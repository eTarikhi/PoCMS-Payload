import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { cleanup, render, screen } from '@testing-library/react'
import type { CollectionSlug, Payload, PayloadRequest } from 'payload'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { CAPABILITIES, governedEntities, type EffectivePermissions } from '@/access/permissions'
import { NavExtraLinks } from '@/components/admin/nav/NavExtraLinks'
import { InboxClient } from '@/components/admin/views/Inbox/InboxClient'
import { SafeEmailIframe } from '@/components/admin/views/Inbox/SafeEmailIframe'
import { MailInboxSummaryView } from '@/components/admin/widgets/MailInbox'
import config from '@/payload.config'
import {
  APPLY_TELEMETRY_TASK_SLUG,
  INGEST_INBOUND_WORKFLOW_SLUG,
  MAIL_ATTACHMENTS_COLLECTION,
  MAIL_LABELS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  MAIL_QUEUE,
  MAIL_THREADS_COLLECTION,
  MAIL_WEBHOOK_EVENTS_COLLECTION,
  PRUNE_WEBHOOK_LEDGER_TASK_SLUG,
  resolveMonotonicDeliveryStatus,
  SEND_OUTBOUND_WORKFLOW_SLUG,
} from '@/plugins/mailInbox'
import { createMailActionEndpoints } from '@/plugins/mailInbox/endpoints/mailActions'
import { createMailStreamEndpoint } from '@/plugins/mailInbox/endpoints/mailStream'
import { createResendWebhookEndpoint } from '@/plugins/mailInbox/endpoints/resendWebhook'
import { ingestReceivedEmailEndToEnd } from '@/plugins/mailInbox/jobs/ingestWorkflow'
import {
  applyDeliveryTelemetryUpdate,
  pruneWebhookEventsLedger,
} from '@/plugins/mailInbox/jobs/telemetryTask'
import {
  buildReplyReferencesChain,
  formatAddressHeader,
  parseAddressList,
  parseEmailAddress,
} from '@/plugins/mailInbox/services/emailAddress'
import { createFormSubmissionToInboxHook } from '@/plugins/mailInbox/services/formBridge'
import {
  collectInboxSnapshot,
  composeOrSendMail,
  executeBulkThreadAction,
  loadMailThreadDetail,
} from '@/plugins/mailInbox/services/inboxQueries'
import {
  revealRemoteImagesInSanitizedHtml,
  sanitizeEmailHtml,
  splitVisibleReplyAndQuotedHistory,
} from '@/plugins/mailInbox/services/mimeSanitizer'
import {
  createSignedWebhookHeaders,
  verifyResendWebhookSignature,
  WebhookVerificationError,
} from '@/plugins/mailInbox/services/svixVerify'
import { normalizeConversationSubject } from '@/plugins/mailInbox/services/threading'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const makeUser = (capabilities: EffectivePermissions['capabilities']) => ({
  id: 42,
  email: 'operator@example.com',
  permissions: {
    fullAccess: false,
    roles: ['Operator'],
    levels: {},
    capabilities,
  },
})

/** Lightweight in-memory Payload Local API harness for deterministic workflow & threading tests. */
function createInMemoryMailPayload() {
  let seq = 1
  const store = new Map<string, Array<Record<string, unknown>>>([
    [MAIL_THREADS_COLLECTION, []],
    [MAIL_MESSAGES_COLLECTION, []],
    [MAIL_ATTACHMENTS_COLLECTION, []],
    [
      MAIL_LABELS_COLLECTION,
      [
        { id: 101, name: 'Lead', slug: 'lead', color: '#3B82F6', isSystem: true },
        { id: 102, name: 'CV Request', slug: 'cv-request', color: '#10B981', isSystem: true },
      ],
    ],
    [MAIL_WEBHOOK_EVENTS_COLLECTION, []],
    ['forms', [{ id: 1, title: 'Request CV', slug: 'request-cv' }]],
  ])
  const queuedJobs: Array<Record<string, unknown>> = []

  const matchesClause = (doc: Record<string, unknown>, where?: Record<string, unknown>): boolean => {
    if (!where || Object.keys(where).length === 0) return true
    if (Array.isArray(where.and)) {
      return (where.and as Array<Record<string, unknown>>).every((sub) => matchesClause(doc, sub))
    }
    if (Array.isArray(where.or)) {
      return (where.or as Array<Record<string, unknown>>).some((sub) => matchesClause(doc, sub))
    }
    for (const [field, cond] of Object.entries(where)) {
      if (!cond || typeof cond !== 'object') continue
      const op = cond as Record<string, unknown>
      const val = doc[field]
      if ('equals' in op && val !== op.equals) return false
      if ('not_equals' in op && val === op.not_equals) return false
      if ('in' in op && Array.isArray(op.in) && !op.in.includes(val)) return false
      if ('not_in' in op && Array.isArray(op.not_in) && op.not_in.includes(val)) return false
      if ('greater_than_equal' in op && String(val ?? '') < String(op.greater_than_equal)) {
        return false
      }
      if ('less_than' in op && String(val ?? '') >= String(op.less_than)) {
        return false
      }
      if ('contains' in op) {
        const arr = Array.isArray(val) ? val.map(String) : []
        if (!arr.includes(String(op.contains))) return false
      }
      if ('like' in op) {
        const needle = String(op.like ?? '').toLowerCase()
        if (!String(val ?? '').toLowerCase().includes(needle)) return false
      }
    }
    return true
  }

  const payload = {
    config: { routes: { api: '/api', admin: '/admin' } },
    email: { defaultFromAddress: 'dev@vtarikhi.com', defaultFromName: 'PoCMS' },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    db: {},
    jobs: {
      queue: vi.fn(async (jobInput: Record<string, unknown>) => {
        const entry = { id: `job_${seq++}`, ...jobInput }
        queuedJobs.push(entry)
        return entry
      }),
      run: vi.fn(async () => ({ ok: true })),
    },
    find: vi.fn(
      async ({
        collection,
        where,
        sort,
        limit = 50,
      }: {
        collection: CollectionSlug
        where?: Record<string, unknown>
        sort?: string
        limit?: number
      }) => {
        const rows = [...(store.get(collection) ?? [])].filter((doc) => matchesClause(doc, where))
        if (sort) {
          const desc = sort.startsWith('-')
          const key = desc ? sort.slice(1) : sort
          rows.sort((a, b) => {
            const av = String(a[key] ?? '')
            const bv = String(b[key] ?? '')
            return desc ? bv.localeCompare(av) : av.localeCompare(bv)
          })
        }
        const docs = rows.slice(0, limit)
        return {
          docs,
          totalDocs: rows.length,
          page: 1,
          totalPages: 1,
        }
      },
    ),
    count: vi.fn(
      async ({
        collection,
        where,
      }: {
        collection: CollectionSlug
        where?: Record<string, unknown>
      }) => {
        const rows = (store.get(collection) ?? []).filter((doc) => matchesClause(doc, where))
        return { totalDocs: rows.length }
      },
    ),
    findByID: vi.fn(async ({ collection, id }: { collection: CollectionSlug; id: number | string }) => {
      const hit = (store.get(collection) ?? []).find((d) => String(d.id) === String(id))
      if (!hit) throw new Error('Not found')
      return hit
    }),
    create: vi.fn(
      async ({
        collection,
        data,
        file,
      }: {
        collection: CollectionSlug
        data: Record<string, unknown>
        file?: { name: string; mimetype: string; size: number; data: Buffer }
      }) => {
        const rows = store.get(collection) ?? []
        if (collection === MAIL_WEBHOOK_EVENTS_COLLECTION) {
          if (rows.some((r) => r.svixId === data.svixId)) {
            const dupErr = Object.assign(new Error('duplicate key value violates unique constraint'), {
              code: '23505',
            })
            throw dupErr
          }
        }
        const now = new Date().toISOString()
        const id = seq++
        const extraFileFields = file
          ? {
              filename: `att_${crypto.randomBytes(6).toString('hex')}_${file.name}`,
              mimeType: file.mimetype,
              filesize: file.size,
              url: `/api/${MAIL_ATTACHMENTS_COLLECTION}/file/att_${id}_${encodeURIComponent(file.name)}`,
            }
          : {}
        const created: Record<string, unknown> = {
          id,
          createdAt: now,
          updatedAt: now,
          ...data,
          ...extraFileFields,
        }
        rows.push(created)
        store.set(collection, rows)
        return created
      },
    ),
    update: vi.fn(
      async ({
        collection,
        id,
        data,
      }: {
        collection: CollectionSlug
        id: number | string
        data: Record<string, unknown>
      }) => {
        const rows = store.get(collection) ?? []
        const idx = rows.findIndex((r) => String(r.id) === String(id))
        if (idx < 0) throw new Error('Not found')
        const updated = {
          ...rows[idx],
          ...data,
          updatedAt: new Date().toISOString(),
        }
        rows[idx] = updated
        return updated
      },
    ),
    delete: vi.fn(
      async ({
        collection,
        id,
        where,
      }: {
        collection: CollectionSlug
        id?: number | string
        where?: Record<string, unknown>
      }) => {
        const rows = store.get(collection) ?? []
        if (id !== undefined) {
          const idx = rows.findIndex((r) => String(r.id) === String(id))
          if (idx < 0) return { docs: [] }
          const [removed] = rows.splice(idx, 1)
          return { docs: [removed] }
        }
        const removed = rows.filter((r) => matchesClause(r, where))
        store.set(
          collection,
          rows.filter((r) => !matchesClause(r, where)),
        )
        return { docs: removed }
      },
    ),
  }

  return {
    payload: payload as unknown as Payload,
    store,
    queuedJobs,
  }
}

describe('Mail Inbox Plugin — Architecture, RBAC, Bundle Isolation & Schema', () => {
  it('keeps client-side Inbox modules completely free of server-only Node, pg, or Payload runtime imports', () => {
    const clientFiles = [
      'src/plugins/mailInbox/constants.ts',
      'src/plugins/mailInbox/types.ts',
      'src/plugins/mailInbox/services/mimeSanitizer.ts',
      'src/components/admin/views/Inbox/SafeEmailIframe.tsx',
      'src/components/admin/views/Inbox/ComposeDrawer.tsx',
      'src/components/admin/views/Inbox/InboxClient.tsx',
      'src/components/admin/nav/NavExtraLinks/InboxUnreadBadge.tsx',
    ]

    for (const relPath of clientFiles) {
      const src = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8')
      expect(src).not.toMatch(/from\s+['"]node:/)
      expect(src).not.toMatch(/from\s+['"]pg['"]/)
      expect(src).not.toMatch(/from\s+['"]next\/cache['"]/)
      // `import type` from payload is erased at compile time; runtime value imports are forbidden.
      expect(src).not.toMatch(/^import\s+\{(?!\s*type\b)[^}]*\}\s+from\s+['"]payload['"]/m)
    }
  })

  it('registers mail-* collections, virtual join, concurrency control, /admin/inbox view, widget, nav link & RBAC', async () => {
    const sanitized = await config

    expect(CAPABILITIES.some((c) => c.name === 'manageInbox')).toBe(true)
    expect(sanitized.admin.components?.views?.inbox).toBeDefined()
    expect(
      sanitized.admin.dashboard?.widgets.some((w) => w.slug === 'mail-inbox'),
    ).toBe(true)
    expect(sanitized.jobs?.enableConcurrencyControl).toBe(true)

    const workflowSlugs = (sanitized.jobs?.workflows ?? []).map((w) => w.slug)
    expect(workflowSlugs).toContain(INGEST_INBOUND_WORKFLOW_SLUG)
    expect(workflowSlugs).toContain(SEND_OUTBOUND_WORKFLOW_SLUG)

    const taskSlugs = (sanitized.jobs?.tasks ?? []).map((t) => t.slug)
    expect(taskSlugs).toContain(APPLY_TELEMETRY_TASK_SLUG)
    expect(taskSlugs).toContain(PRUNE_WEBHOOK_LEDGER_TASK_SLUG)

    for (const slug of [
      MAIL_THREADS_COLLECTION,
      MAIL_MESSAGES_COLLECTION,
      MAIL_ATTACHMENTS_COLLECTION,
      MAIL_LABELS_COLLECTION,
      MAIL_WEBHOOK_EVENTS_COLLECTION,
    ]) {
      const col = sanitized.collections.find((c) => c.slug === slug)
      expect(col).toBeDefined()
    }

    // Opted out of per-collection CRUD Role rows (`custom.permissions = false`), governed cleanly by `manageInbox` capability
    const entities = governedEntities(sanitized)
    expect(entities.some((e) => e.slug.startsWith('mail-'))).toBe(false)

    // Virtual join field on `mail-threads`
    const threadsCol = sanitized.collections.find((c) => c.slug === MAIL_THREADS_COLLECTION)
    const joinField = threadsCol?.fields.find(
      (f) => 'name' in f && f.name === 'messages' && f.type === 'join',
    )
    expect(joinField).toBeDefined()

    // High-volume webhook ledger opts out of AuditLogs to prevent audit table bloat
    const webhookCol = sanitized.collections.find(
      (c) => c.slug === MAIL_WEBHOOK_EVENTS_COLLECTION,
    )
    expect(webhookCol?.custom?.auditLog).toBe(false)

    // Sidebar link renders only when user holds `manageInbox`
    const { container: withoutCap } = render(
      React.createElement(NavExtraLinks, {
        payload: { config: { routes: { admin: '/admin', api: '/api' } } },
        user: makeUser([]),
      } as never),
    )
    expect(withoutCap.querySelector('#nav-inbox')).toBeNull()
    cleanup()

    const { container: withCap } = render(
      React.createElement(NavExtraLinks, {
        payload: { config: { routes: { admin: '/admin', api: '/api' } } },
        user: makeUser(['manageInbox']),
      } as never),
    )
    expect(withCap.querySelector('#nav-inbox')).not.toBeNull()
  })
})

describe('Mail Inbox Plugin — Svix HMAC Security, Sanitizer, Tracker Shield & RFC 5322 Helpers', () => {
  it('verifies Standard Webhooks / Svix signatures in constant time and rejects tampered or replayed payloads', () => {
    const secret = `whsec_${Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')}`
    const rawBody = JSON.stringify({
      type: 'email.received',
      data: { email_id: 're_123', subject: 'Hello PoCMS' },
    })
    const nowMs = 1_760_000_000_000
    const nowSec = Math.floor(nowMs / 1000)

    const validHeaders = createSignedWebhookHeaders({
      rawBody,
      secret,
      svixId: 'msg_valid_001',
      timestampSeconds: nowSec - 10,
    })

    // Supports rotated multi-signature headers (`v1,oldSig v1,validSig`)
    const rotatedHeaders = {
      ...validHeaders,
      'svix-signature': `v1,${Buffer.from('wrong_old_key_sig_32_bytes_12345').toString('base64')} ${validHeaders['svix-signature']}`,
    }

    const verified = verifyResendWebhookSignature({
      rawBody,
      headers: rotatedHeaders,
      secret,
      nowMs,
    })
    expect(verified.svixId).toBe('msg_valid_001')

    // Rejects tampered payload (even 1 whitespace difference)
    expect(() =>
      verifyResendWebhookSignature({
        rawBody: `${rawBody} `,
        headers: validHeaders,
        secret,
        nowMs,
      }),
    ).toThrow(WebhookVerificationError)

    // Rejects replay older than 5-minute tolerance
    const staleHeaders = createSignedWebhookHeaders({
      rawBody,
      secret,
      svixId: 'msg_stale',
      timestampSeconds: nowSec - 600,
    })
    expect(() =>
      verifyResendWebhookSignature({
        rawBody,
        headers: staleHeaders,
        secret,
        nowMs,
      }),
    ).toThrow(/tolerance/i)
  })

  it('neutralizes XSS vectors, rewrites cid: inline images, shields remote tracking pixels, and folds quoted history', () => {
    const hostileHtml = `
      <!DOCTYPE html>
      <html>
        <head><style>body { background: url('https://evil.test/leak'); }</style></head>
        <body>
          <script>fetch('/api/users/me')</script>
          <svg onload="alert(1)"><circle r="5" /></svg>
          <p onclick="evil()" style="color: #111827; background-image: url(https://evil.test); position: fixed">
            Hi there! Check <a href="&#106;avascript:alert(1)">bad link</a> and
            <a href="https://example.com/proposal">safe link</a>.
          </p>
          <img src="cid:<brand-logo@client.org>" alt="Logo" />
          <img src="https://cdn.client.org/banner.png" width="600" height="200" alt="Banner" />
          <img src="https://tracker.evil.test/open.gif" width="1" height="1" />
          <form action="https://evil.test/steal"><input name="token" /></form>
        </body>
      </html>
    `

    const result = sanitizeEmailHtml(hostileHtml, {
      cidUrlMap: {
        'brand-logo@client.org': '/api/mail-attachments/file/att_logo.png',
      },
    })

    expect(result.sanitizedHtml).not.toContain('<script')
    expect(result.sanitizedHtml).not.toContain('<svg')
    expect(result.sanitizedHtml).not.toContain('<form')
    expect(result.sanitizedHtml).not.toContain('<style')
    expect(result.sanitizedHtml).not.toContain('onclick')
    expect(result.sanitizedHtml).not.toContain('javascript:')
    expect(result.sanitizedHtml).not.toContain('url(')
    expect(result.sanitizedHtml).toContain('href="https://example.com/proposal"')
    expect(result.sanitizedHtml).toContain('rel="noopener noreferrer nofollow"')
    expect(result.sanitizedHtml).toContain('src="/api/mail-attachments/file/att_logo.png"')
    expect(result.resolvedCidCount).toBe(1)
    expect(result.hasRemoteImages).toBe(true)
    expect(result.blockedRemoteImages).toBe(2)
    expect(result.sanitizedHtml).toContain('data-remote-src="https://cdn.client.org/banner.png"')
    expect(result.sanitizedHtml).toContain('data-tracker-pixel="true"')

    // Revealing remote images loads real content images with no-referrer while STILL dropping 1x1 open trackers!
    const revealed = revealRemoteImagesInSanitizedHtml(result.sanitizedHtml)
    expect(revealed).toContain('src="https://cdn.client.org/banner.png"')
    expect(revealed).toContain('referrerpolicy="no-referrer"')
    expect(revealed).not.toContain('tracker.evil.test')

    // Splits top-posted reply from quoted history cleanly
    const split = splitVisibleReplyAndQuotedHistory(
      'Sounds great, let us kick off Monday!\n\nOn Thu, 29 Oct 2026 at 14:10, PoCMS <dev@vtarikhi.com> wrote:\n> Here is the architecture.',
    )
    expect(split.visibleReplyText).toBe('Sounds great, let us kick off Monday!')
    expect(split.quotedHistoryText).toContain('On Thu, 29 Oct 2026')

    // RFC 5322 address & subject helpers
    expect(parseEmailAddress('"Doe, Jane"\r\n <JANE@Example.com>')).toEqual({
      name: 'Doe, Jane',
      address: 'jane@example.com',
    })
    expect(
      parseAddressList('"Doe, Jane" <jane@example.com>, team@acme.io').map(formatAddressHeader),
    ).toEqual(['"Doe, Jane" <jane@example.com>', 'team@acme.io'])
    expect(normalizeConversationSubject('Re: Fwd: [EXTERNAL] AW: Portfolio Redesign')).toBe(
      'Portfolio Redesign',
    )
    expect(buildReplyReferencesChain(['<root@a.io>'], '<msg2@a.io>')).toEqual([
      '<root@a.io>',
      '<msg2@a.io>',
    ])
  })
})

describe('Mail Inbox Plugin — Webhook Ledger, Inbound/Outbound Lifecycle, Telemetry & Form Bridge', () => {
  it('deduplicates Svix webhook retries, ingests MIME + attachments with byte guards, threads replies, enforces monotonic telemetry, and bridges form-submissions', async () => {
    const { payload, store, queuedJobs } = createInMemoryMailPayload()
    const secret = `whsec_${Buffer.from('abcdef0123456789abcdef0123456789').toString('base64')}`

    const webhookEndpoint = createResendWebhookEndpoint({
      getWebhookSecret: () => secret,
    })

    const webhookBody = JSON.stringify({
      type: 'email.received',
      created_at: '2026-10-30T08:00:00.000Z',
      data: {
        email_id: 're_inbound_01',
        message_id: '<msg-client-1@acme.org>',
        from: 'Alice Meyer <alice@acme.org>',
        to: ['dev@vtarikhi.com'],
        subject: 'Consulting inquiry for Q4',
      },
    })
    const signedHeaders = createSignedWebhookHeaders({
      rawBody: webhookBody,
      secret,
      svixId: 'msg_svix_unique_1',
    })

    // 1. Forged signature rejected with 401
    const badRes = await webhookEndpoint.handler({
      payload,
      headers: new Headers({ ...signedHeaders, 'svix-signature': 'v1,aW52YWxpZA==' }),
      text: async () => webhookBody,
    } as unknown as PayloadRequest)
    expect(badRes.status).toBe(401)

    // 2. Valid webhook returns 202 Accepted and queues onto `mail` queue
    const okRes = await webhookEndpoint.handler({
      payload,
      headers: new Headers(signedHeaders),
      text: async () => webhookBody,
    } as unknown as PayloadRequest)
    expect(okRes.status).toBe(202)
    expect(queuedJobs).toHaveLength(1)
    expect(queuedJobs[0].queue).toBe(MAIL_QUEUE)
    expect(queuedJobs[0].workflow).toBe(INGEST_INBOUND_WORKFLOW_SLUG)

    // 3. Duplicate Svix webhook retry returns 200 `{ duplicate: true }` without queuing again
    const dupRes = await webhookEndpoint.handler({
      payload,
      headers: new Headers(signedHeaders),
      text: async () => webhookBody,
    } as unknown as PayloadRequest)
    expect(dupRes.status).toBe(200)
    const dupJson = (await dupRes.json()) as { duplicate?: boolean }
    expect(dupJson.duplicate).toBe(true)
    expect(queuedJobs).toHaveLength(1)

    // 4. Execute inbound ingestion with 1 inline CID logo, 1 PDF (<1MB), and 1 oversized 40MB archive
    const mockFetch = vi.fn(async (inputUrl: string | URL | Request, init?: RequestInit) => {
      const url = typeof inputUrl === 'string' ? inputUrl : inputUrl.toString()
      if (url.endsWith('/emails/receiving/re_inbound_01')) {
        return new Response(
          JSON.stringify({
            object: 'email',
            id: 're_inbound_01',
            from: 'Alice Meyer <alice@acme.org>',
            to: ['dev@vtarikhi.com'],
            cc: [],
            bcc: [],
            reply_to: [],
            subject: 'Consulting inquiry for Q4',
            message_id: '<msg-client-1@acme.org>',
            created_at: '2026-10-30T08:00:00.000Z',
            html: '<p>Hello team,</p><img src="cid:sig-logo" /><p>See attached brief.</p>',
            text: 'Hello team,\nSee attached brief.',
            headers: {
              'Authentication-Results': 'mx.resend.com; spf=pass; dkim=pass; dmarc=pass',
            },
            attachments: [{ id: 'att_1' }, { id: 'att_2' }],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/emails/receiving/re_inbound_01/attachments')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'att_1',
                filename: 'logo.png',
                size: 12,
                content_type: 'image/png',
                content_disposition: 'inline',
                content_id: '<sig-logo>',
                download_url: 'https://files.resend.test/logo.png',
                expires_at: '2026-10-30T09:00:00.000Z',
              },
              {
                id: 'att_oversized',
                filename: 'huge-video.mov',
                size: 40 * 1024 * 1024,
                content_type: 'video/quicktime',
                content_disposition: 'attachment',
                download_url: 'https://files.resend.test/huge.mov',
                expires_at: '2026-10-30T09:00:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url === 'https://files.resend.test/logo.png') {
        return new Response(Buffer.from('PNG_BYTES_12'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }
      if (url.endsWith('/emails') && init?.method === 'POST') {
        const headersRec = init.headers as Record<string, string>
        expect(headersRec['Idempotency-Key']).toMatch(/^pocms-mail-msg-/)
        const bodyJson = JSON.parse(String(init.body)) as {
          headers?: Record<string, string>
        }
        expect(bodyJson.headers?.['In-Reply-To']).toBe('<msg-client-1@acme.org>')
        expect(bodyJson.headers?.References).toContain('<msg-client-1@acme.org>')
        return new Response(JSON.stringify({ id: 're_outbound_99' }), { status: 200 })
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const ingested = await ingestReceivedEmailEndToEnd({
      payload,
      emailId: 're_inbound_01',
      svixId: 'msg_svix_unique_1',
      apiKey: 're_test_key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    })
    expect(ingested.duplicate).toBe(false)

    // Verify oversized attachment was safely recorded with skippedReason while inline CID was rewritten
    const detailAfterInbound = await loadMailThreadDetail({
      payload,
      threadId: ingested.threadId,
      markAsRead: false,
    })
    expect(detailAfterInbound?.unreadCount).toBe(1)
    expect(detailAfterInbound?.messages[0].sanitizedHtml).toContain(
      `/api/${MAIL_ATTACHMENTS_COLLECTION}/file/`,
    )
    expect(detailAfterInbound?.messages[0].attachments).toHaveLength(2)
    expect(
      detailAfterInbound?.messages[0].attachments.find(
        (a) => a.originalFilename === 'huge-video.mov',
      )?.skippedReason,
    ).toMatch(/exceeds max limit/i)

    // 5. Operator replies from Inbox -> dispatches via Resend with RFC 5322 In-Reply-To & References
    const sentReply = await composeOrSendMail({
      payload,
      apiKey: 're_test_key',
      fetchImpl: mockFetch as unknown as typeof fetch,
      input: {
        to: 'alice@acme.org',
        subject: 'Re: Consulting inquiry for Q4',
        text: 'Thanks Alice! Happy to meet Tuesday.',
        replyToThreadId: ingested.threadId,
        replyToMessageId: ingested.messageId,
      },
    })
    expect(sentReply.dispatched).toBe(true)
    expect(sentReply.threadId).toBe(ingested.threadId)
    expect(sentReply.message.status).toBe('sent')
    expect(sentReply.message.resendEmailId).toBe('re_outbound_99')

    // 6. Monotonic delivery telemetry state machine (out-of-order webhooks never downgrade state)
    await applyDeliveryTelemetryUpdate({
      payload,
      resendEmailId: 're_outbound_99',
      eventType: 'email.delivered',
    })
    // Out-of-order late `email.sent` must NOT regress `delivered` back to `sent`
    const afterLateSent = await applyDeliveryTelemetryUpdate({
      payload,
      resendEmailId: 're_outbound_99',
      eventType: 'email.sent',
    })
    expect(afterLateSent.nextStatus).toBe('delivered')
    expect(resolveMonotonicDeliveryStatus('bounced', 'opened')).toBe('bounced')

    await applyDeliveryTelemetryUpdate({
      payload,
      resendEmailId: 're_outbound_99',
      eventType: 'email.opened',
    })
    const afterOpen = await loadMailThreadDetail({
      payload,
      threadId: ingested.threadId,
    })
    const outboundMsg = afterOpen?.messages.find((m) => m.resendEmailId === 're_outbound_99')
    expect(outboundMsg?.status).toBe('opened')
    expect(outboundMsg?.openCount).toBe(1)

    // 7. Archive thread, then receive a second reply referencing our outbound Message-ID -> reopens into Inbox!
    await executeBulkThreadAction({
      payload,
      input: {
        threadIds: [ingested.threadId],
        action: 'moveFolder',
        folder: 'archive',
      },
    })
    const mockFetchReply2 = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          object: 'email',
          id: 're_inbound_02',
          from: 'Alice Meyer <alice@acme.org>',
          to: ['dev@vtarikhi.com'],
          cc: [],
          bcc: [],
          reply_to: [],
          subject: 'Re: Consulting inquiry for Q4',
          message_id: '<msg-client-2@acme.org>',
          created_at: '2026-10-30T09:15:00.000Z',
          html: null,
          text: 'Tuesday at 10:00 CET works!',
          headers: {
            'In-Reply-To': sentReply.message.rfcMessageId ?? '',
            References: `<msg-client-1@acme.org> ${sentReply.message.rfcMessageId ?? ''}`,
          },
          attachments: [],
        }),
        { status: 200 },
      )
    })

    const ingested2 = await ingestReceivedEmailEndToEnd({
      payload,
      emailId: 're_inbound_02',
      apiKey: 're_test_key',
      fetchImpl: mockFetchReply2 as unknown as typeof fetch,
    })
    expect(ingested2.threadId).toBe(ingested.threadId)
    const reopenedThread = await loadMailThreadDetail({
      payload,
      threadId: ingested.threadId,
      markAsRead: false,
    })
    expect(reopenedThread?.folder).toBe('inbox')
    expect(reopenedThread?.messageCount).toBe(3)

    // 8. Form-Builder `form-submissions` bridge mirrors Request-CV submissions into Inbox with `CV Request` label
    const bridgeHook = createFormSubmissionToInboxHook()
    await bridgeHook({
      doc: {
        id: 777,
        form: 1,
        createdAt: '2026-10-30T10:00:00.000Z',
        submissionData: [
          { field: 'name', value: 'Marc Weber' },
          { field: 'email', value: 'marc@zurich-tech.ch' },
          { field: 'message', value: 'Could you share your latest CV?' },
        ],
      },
      operation: 'create',
      req: { payload, context: {} } as unknown as PayloadRequest,
      collection: {} as never,
      context: {},
      data: {},
      previousDoc: {},
    })

    const snap = await collectInboxSnapshot({
      payload,
      folder: 'inbox',
      pluginOptions: { apiKey: 're_test_key', webhookSecret: secret },
    })
    expect(snap.threads).toHaveLength(2)
    const cvThread = snap.threads.find((t) => t.sourceFormSubmissionId === 777)
    expect(cvThread).toBeDefined()
    expect(cvThread?.counterpartyEmail).toBe('marc@zurich-tech.ch')
    expect(cvThread?.labels.some((l) => l.slug === 'cv-request')).toBe(true)

    // 9. Prune old processed webhook ledger entries while preserving recent ones
    const ledgerRows = store.get(MAIL_WEBHOOK_EVENTS_COLLECTION) ?? []
    ledgerRows.push({
      id: 999,
      svixId: 'msg_old_processed',
      eventType: 'email.delivered',
      processingState: 'processed',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const pruned = await pruneWebhookEventsLedger({ payload, retentionDays: 30 })
    expect(pruned.deletedCount).toBe(1)
  })

  it('enforces RBAC on /api/mail/* & SSE stream and renders SafeEmailIframe, MailInboxWidget, and InboxClient', async () => {
    const { payload } = createInMemoryMailPayload()
    const endpoints = [
      ...createMailActionEndpoints({ apiKey: 're_key', webhookSecret: 'whsec_dGVzdA==' }),
      createMailStreamEndpoint(),
    ]

    for (const ep of endpoints) {
      const unauth = await ep.handler({
        payload,
        user: null,
        url: 'http://localhost/api/mail/inbox',
      } as unknown as PayloadRequest)
      expect(unauth.status).toBe(401)

      const forbidden = await ep.handler({
        payload,
        user: makeUser([]),
        url: 'http://localhost/api/mail/inbox',
      } as unknown as PayloadRequest)
      expect(forbidden.status).toBe(403)
    }

    // Authorized SSE stream emits initial snapshot frame cleanly and closes on abort
    const abortController = new AbortController()
    const streamEp = createMailStreamEndpoint()
    const sseRes = await streamEp.handler({
      payload,
      user: makeUser(['manageInbox']),
      signal: abortController.signal,
    } as unknown as PayloadRequest)
    expect(sseRes.status).toBe(200)
    expect(sseRes.headers.get('Content-Type')).toContain('text/event-stream')
    const reader = sseRes.body!.getReader()
    const firstChunk = new TextDecoder().decode((await reader.read()).value)
    const secondChunk = new TextDecoder().decode((await reader.read()).value)
    expect(`${firstChunk}${secondChunk}`).toContain('snapshot')
    abortController.abort()
    await reader.cancel()

    // Render SafeEmailIframe: verifies strict sandbox without `allow-same-origin` or `allow-scripts`
    const { container: iframeContainer } = render(
      React.createElement(SafeEmailIframe, {
        sanitizedHtml: '<p>Safe content</p>',
        allowRemoteImages: false,
        subject: 'Security Check',
      }),
    )
    const iframeEl = iframeContainer.querySelector('iframe')
    expect(iframeEl).not.toBeNull()
    expect(iframeEl?.getAttribute('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox')
    expect(iframeEl?.getAttribute('referrerpolicy')).toBe('no-referrer')
    cleanup()

    // Render Dashboard summary widget & 3-pane InboxClient
    const snapshot = await collectInboxSnapshot({
      payload,
      pluginOptions: { apiKey: 're_key', webhookSecret: 'whsec_dGVzdA==' },
    })

    render(
      React.createElement(MailInboxSummaryView, {
        counts: snapshot.counts,
        integration: snapshot.integration,
      }),
    )
    expect(screen.getByText('Resend live')).toBeDefined()
    cleanup()

    render(
      React.createElement(InboxClient, {
        initialSnapshot: snapshot,
        apiRoute: '/api',
        adminRoute: '/admin',
      }),
    )
    expect(screen.getByText('Mail inbox')).toBeDefined()
    expect(screen.getByText('Compose')).toBeDefined()
  })
})
