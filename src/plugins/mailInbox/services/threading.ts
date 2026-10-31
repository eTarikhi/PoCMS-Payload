import crypto from 'node:crypto'
import type { CollectionSlug, Payload, PayloadRequest, Where } from 'payload'

import { executePayloadSql, qualifiedPayloadTable } from '@/lib/payloadSql'

import {
  MAIL_MESSAGES_COLLECTION,
  MAIL_THREADS_COLLECTION,
  SUBJECT_THREAD_WINDOW_DAYS,
  type MailFolder,
} from '../constants'
import type { ParsedEmailAddress } from '../types'
import {
  extractEmailDomain,
  normalizeMessageId,
  parseAddressList,
  parseReferencesHeader,
} from './emailAddress'

const FREEMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'zoho.com',
  'fastmail.com',
  'hey.com',
])

const REPLY_FORWARD_PREFIX_RE =
  /^(?:\s*(?:\[[^\]]{1,24}\]\s*)*(?:re|fwd?|aw|wg|sv|antw|vs|tr)(?:\[\d+\])?\s*:\s*)+/i

/**
 * Strips iterative `Re:`, `Fwd:`, `AW:`, `WG:`, `SV:`, and `[EXTERNAL]` prefixes and collapses
 * whitespace so subject-based fallback threading groups replies reliably.
 */
export function normalizeConversationSubject(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '')
    .replace(/[\r\n\0]+/g, ' ')
    .replace(REPLY_FORWARD_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || '(No subject)'
}

export function isFreemailDomain(domain: string): boolean {
  return FREEMAIL_DOMAINS.has(domain.trim().toLowerCase())
}

/**
 * Computes a deterministic concurrency & lookup key for a message's conversation thread:
 * - Prefers the root RFC 5322 Message-ID (`references[0]` -> `inReplyTo` -> `rfcMessageId`) when threading headers exist.
 * - Falls back to a normalized subject + counterparty hash.
 */
export function computeDeterministicThreadKey({
  rfcMessageId,
  inReplyTo,
  references,
  subject,
  counterpartyEmail,
}: {
  rfcMessageId?: string | null
  inReplyTo?: string | null
  references?: readonly string[] | string | null
  subject?: string | null
  counterpartyEmail?: string | null
}): string {
  const refs = parseReferencesHeader(references)
  const normInReplyTo = normalizeMessageId(inReplyTo)
  const normOwnId = normalizeMessageId(rfcMessageId)

  const anchorId = refs[0] || normInReplyTo
  if (anchorId) {
    const digest = crypto.createHash('sha256').update(anchorId.toLowerCase()).digest('hex').slice(0, 32)
    return `rfc:${digest}`
  }

  const normSubject = normalizeConversationSubject(subject).toLowerCase()
  const cp = (counterpartyEmail ?? '').trim().toLowerCase()
  if (cp && normSubject !== '(no subject)') {
    const digest = crypto
      .createHash('sha256')
      .update(`${cp}::${normSubject}`)
      .digest('hex')
      .slice(0, 32)
    return `subj:${digest}`
  }

  if (normOwnId) {
    const digest = crypto.createHash('sha256').update(normOwnId.toLowerCase()).digest('hex').slice(0, 32)
    return `msg:${digest}`
  }

  return `rnd:${crypto.randomBytes(16).toString('hex')}`
}

/**
 * Three-tier conversation thread resolver:
 * 1. Exact RFC 5322 `In-Reply-To` / `References` lookup against existing `mail-messages.rfcMessageId`.
 * 2. Deterministic `threadKey` lookup on `mail-threads`.
 * 3. Active 30-day normalized-subject + counterparty email fallback (excluding trashed/spam threads).
 */
export async function resolveOrCreateMailThread({
  payload,
  req,
  explicitThreadId,
  rfcMessageId,
  inReplyTo,
  references,
  subject,
  counterparty,
  initialFolder,
  nowIso = new Date().toISOString(),
}: {
  payload: Payload
  req?: PayloadRequest
  explicitThreadId?: number | string | null
  rfcMessageId?: string | null
  inReplyTo?: string | null
  references?: readonly string[] | string | null
  subject?: string | null
  counterparty: ParsedEmailAddress
  initialFolder: MailFolder
  nowIso?: string
}): Promise<{ threadId: number | string; threadKey: string; created: boolean }> {
  const normalizedSubject = normalizeConversationSubject(subject)
  const cleanSubject = String(subject ?? '').trim() || '(No subject)'
  const refs = parseReferencesHeader(references)
  const normInReplyTo = normalizeMessageId(inReplyTo)

  if (explicitThreadId !== null && explicitThreadId !== undefined && explicitThreadId !== '') {
    const existing = await payload
      .findByID({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        id: explicitThreadId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch(() => null)
    if (existing) {
      const rec = existing as unknown as Record<string, unknown>
      return {
        threadId: existing.id,
        threadKey: String(rec.threadKey ?? `id:${existing.id}`),
        created: false,
      }
    }
  }

  // Tier 1: Exact RFC 5322 header graph match (`In-Reply-To` + `References`)
  const candidateRfcIds = Array.from(new Set([normInReplyTo, ...refs].filter(Boolean)))
  if (candidateRfcIds.length > 0) {
    const matchedMessages = await payload.find({
      collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
      where: {
        rfcMessageId: { in: candidateRfcIds },
      },
      sort: '-sentAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const matchedDoc = matchedMessages.docs[0] as unknown as Record<string, unknown> | undefined
    const matchedThread = matchedDoc?.thread
    const resolvedId =
      typeof matchedThread === 'number' || typeof matchedThread === 'string'
        ? matchedThread
        : matchedThread && typeof matchedThread === 'object' && 'id' in matchedThread
          ? (matchedThread as { id: number | string }).id
          : null

    if (resolvedId !== null) {
      const parentThread = await payload
        .findByID({
          collection: MAIL_THREADS_COLLECTION as CollectionSlug,
          id: resolvedId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        .catch(() => null)
      if (parentThread) {
        const rec = parentThread as unknown as Record<string, unknown>
        return {
          threadId: parentThread.id,
          threadKey: String(rec.threadKey ?? `id:${parentThread.id}`),
          created: false,
        }
      }
    }
  }

  const threadKey = computeDeterministicThreadKey({
    rfcMessageId,
    inReplyTo: normInReplyTo,
    references: refs,
    subject: cleanSubject,
    counterpartyEmail: counterparty.address,
  })

  // Tier 2: Deterministic threadKey match
  const byKey = await payload.find({
    collection: MAIL_THREADS_COLLECTION as CollectionSlug,
    where: {
      threadKey: { equals: threadKey },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (byKey.docs[0]) {
    const doc = byKey.docs[0]
    return {
      threadId: doc.id,
      threadKey,
      created: false,
    }
  }

  // Tier 3: Normalized subject + counterparty match within 30-day window
  if (counterparty.address && normalizedSubject !== '(No subject)') {
    const windowCutoff = new Date(
      new Date(nowIso).getTime() - SUBJECT_THREAD_WINDOW_DAYS * 86_400_000,
    ).toISOString()

    const domain = extractEmailDomain(counterparty.address)
    const whereClause: Where = {
      and: [
        { normalizedSubject: { equals: normalizedSubject } },
        { counterpartyEmail: { equals: counterparty.address.toLowerCase() } },
        { lastMessageAt: { greater_than_equal: windowCutoff } },
        { folder: { not_in: ['trash', 'spam'] } },
      ],
    }

    // Extra safety: never merge generic 1-word subjects ("Hi", "Hello", "Test") on freemail domains without RFC headers.
    const isTrivialSubject = normalizedSubject.length < 6 && isFreemailDomain(domain)
    if (!isTrivialSubject) {
      const bySubject = await payload.find({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        where: whereClause,
        sort: '-lastMessageAt',
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (bySubject.docs[0]) {
        const rec = bySubject.docs[0] as unknown as Record<string, unknown>
        return {
          threadId: bySubject.docs[0].id,
          threadKey: String(rec.threadKey ?? threadKey),
          created: false,
        }
      }
    }
  }

  // Create new conversation thread
  const createdThread = await payload.create({
    collection: MAIL_THREADS_COLLECTION as CollectionSlug,
    overrideAccess: true,
    req,
    context: { ...(req?.context ?? {}), skipAuditLog: true },
    data: {
      threadKey,
      subject: cleanSubject,
      normalizedSubject,
      folder: initialFolder,
      isRead: initialFolder === 'sent',
      isStarred: false,
      hasAttachments: false,
      hasDraft: false,
      messageCount: 0,
      unreadCount: 0,
      snippet: '',
      counterpartyName: counterparty.name || counterparty.address || 'Unknown',
      counterpartyEmail: counterparty.address || '',
      participants: counterparty.address ? [counterparty] : [],
      lastMessageAt: nowIso,
    } as Record<string, unknown>,
  })

  return {
    threadId: createdThread.id,
    threadKey,
    created: true,
  }
}

const ROLLUP_MESSAGE_SELECT = {
  status: true,
  isRead: true,
  attachments: true,
  sentAt: true,
  createdAt: true,
  snippet: true,
  fromAddress: true,
  fromName: true,
  toAddresses: true,
} as const

async function recomputeThreadRollupsViaSql({
  payload,
  req,
  threadId,
  reopenInboxOnInbound,
}: {
  payload: Payload
  req?: PayloadRequest
  threadId: number | string
  reopenInboxOnInbound: boolean
}): Promise<boolean> {
  const numericId =
    typeof threadId === 'number' && Number.isFinite(threadId)
      ? threadId
      : typeof threadId === 'string' && /^\d+$/.test(threadId.trim())
        ? Number.parseInt(threadId.trim(), 10)
        : null
  if (numericId === null) return false

  const threadsTable = qualifiedPayloadTable(payload, 'mail_threads')
  const messagesTable = qualifiedPayloadTable(payload, 'mail_messages')
  const relsTable = qualifiedPayloadTable(payload, 'mail_messages_rels')

  try {
    const res = await executePayloadSql(
      payload,
      `
        WITH msg_rows AS (
          SELECT
            m.id,
            m.status::text AS status,
            COALESCE(m.is_read, false) AS is_read,
            COALESCE(m.sent_at, m.created_at) AS effective_sent_at,
            NULLIF(BTRIM(COALESCE(m.snippet, '')), '') AS clean_snippet,
            LOWER(BTRIM(COALESCE(m.from_address, ''))) AS from_address,
            BTRIM(COALESCE(m.from_name, '')) AS from_name,
            m.to_addresses
          FROM ${messagesTable} m
          WHERE m.thread_id = $1
          ORDER BY COALESCE(m.sent_at, m.created_at) ASC, m.id ASC
          LIMIT 250
        ),
        rollup AS (
          SELECT
            COUNT(*)::int AS message_count,
            COUNT(*) FILTER (WHERE NOT is_read AND status <> 'draft')::int AS unread_count,
            COALESCE(BOOL_OR(status = 'draft'), false) AS has_draft,
            EXISTS (
              SELECT 1
              FROM ${relsTable} r
              JOIN msg_rows mr ON mr.id = r.parent_id
              WHERE r.mail_attachments_id IS NOT NULL
            ) AS has_attachments,
            MAX(effective_sent_at) AS last_message_at,
            (
              SELECT LEFT(mr2.clean_snippet, 180)
              FROM msg_rows mr2
              WHERE mr2.clean_snippet IS NOT NULL
              ORDER BY mr2.effective_sent_at DESC, mr2.id DESC
              LIMIT 1
            ) AS latest_snippet
          FROM msg_rows
        ),
        addr_candidates AS (
          SELECT
            mr.from_address AS addr,
            mr.from_name AS display_name,
            1 AS src_prio,
            ROW_NUMBER() OVER (ORDER BY mr.effective_sent_at DESC, mr.id DESC) AS recency_rank,
            ROW_NUMBER() OVER (ORDER BY mr.effective_sent_at ASC, mr.id ASC) AS first_order
          FROM msg_rows mr
          WHERE mr.from_address <> ''
          UNION ALL
          SELECT
            LOWER(BTRIM(COALESCE(elem->>'address', ''))) AS addr,
            BTRIM(COALESCE(elem->>'name', '')) AS display_name,
            2 AS src_prio,
            ROW_NUMBER() OVER (ORDER BY mr.effective_sent_at DESC, mr.id DESC) AS recency_rank,
            10000 + ROW_NUMBER() OVER (ORDER BY mr.effective_sent_at ASC, mr.id ASC) AS first_order
          FROM msg_rows mr
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(mr.to_addresses) = 'array' THEN mr.to_addresses ELSE '[]'::jsonb END
          ) AS elem
          WHERE LOWER(BTRIM(COALESCE(elem->>'address', ''))) <> ''
        ),
        dedup_participants AS (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object('name', best.display_name, 'address', best.addr)
              ORDER BY best.first_seen
            ),
            '[]'::jsonb
          ) AS participants_json
          FROM (
            SELECT DISTINCT ON (ac.addr)
              ac.addr,
              COALESCE(
                NULLIF(ac.display_name, ''),
                (
                  SELECT ac2.display_name
                  FROM addr_candidates ac2
                  WHERE ac2.addr = ac.addr AND ac2.display_name <> ''
                  ORDER BY ac2.src_prio ASC, ac2.recency_rank ASC
                  LIMIT 1
                ),
                ''
              ) AS display_name,
              MIN(ac.first_order) OVER (PARTITION BY ac.addr) AS first_seen
            FROM addr_candidates ac
            ORDER BY ac.addr, ac.src_prio ASC, ac.recency_rank ASC
          ) best
        )
        UPDATE ${threadsTable} t
        SET
          folder = CASE
            WHEN $2::boolean AND t.folder::text IN ('archive', 'sent') THEN 'inbox'::${threadsTable.split('.')[0]}."enum_mail_threads_folder"
            ELSE t.folder
          END,
          message_count = r.message_count,
          unread_count = r.unread_count,
          is_read = (r.unread_count = 0),
          has_attachments = r.has_attachments,
          has_draft = r.has_draft,
          snippet = COALESCE(r.latest_snippet, ''),
          last_message_at = COALESCE(r.last_message_at, t.last_message_at, now()),
          participants = dp.participants_json,
          updated_at = now()
        FROM rollup r
        CROSS JOIN dedup_participants dp
        WHERE t.id = $1 AND r.message_count > 0
      `,
      [numericId, reopenInboxOnInbound],
      req,
    )
    return res !== null
  } catch {
    return false
  }
}

/**
 * Recomputes denormalized rollup fields (`messageCount`, `unreadCount`, `isRead`, `hasAttachments`,
 * `hasDraft`, `snippet`, `lastMessageAt`, `participants`, and folder auto-reopen on new inbound reply)
 * from the thread's child `mail-messages`.
 *
 * Executes a single atomic zero-TOAST PostgreSQL `UPDATE ... FROM (WITH msg_rows ...)` statement when
 * connected to PostgreSQL, falling back to an explicitly `select`-projected Local API query on
 * in-memory test harnesses.
 */
export async function recomputeThreadRollups({
  payload,
  req,
  threadId,
  reopenInboxOnInbound = false,
}: {
  payload: Payload
  req?: PayloadRequest
  threadId: number | string
  reopenInboxOnInbound?: boolean
}): Promise<void> {
  const handledBySql = await recomputeThreadRollupsViaSql({
    payload,
    req,
    threadId,
    reopenInboxOnInbound,
  })
  if (handledBySql) return

  const threadDoc = await payload
    .findByID({
      collection: MAIL_THREADS_COLLECTION as CollectionSlug,
      id: threadId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    .catch(() => null)
  if (!threadDoc) return

  const messagesRes = await payload.find({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    where: {
      thread: { equals: threadId },
    },
    sort: 'sentAt',
    limit: 250,
    depth: 0,
    select: ROLLUP_MESSAGE_SELECT,
    overrideAccess: true,
    req,
  })

  const docs = messagesRes.docs as unknown as Array<Record<string, unknown>>
  if (docs.length === 0) return

  let unreadCount = 0
  let hasAttachments = false
  let hasDraft = false
  let lastMessageAt = ''
  let latestSnippet = ''
  const participantMap = new Map<string, ParsedEmailAddress>()

  for (const msg of docs) {
    const status = String(msg.status ?? '')
    const isMsgRead = Boolean(msg.isRead)
    if (status === 'draft') {
      hasDraft = true
    }
    if (!isMsgRead && status !== 'draft') {
      unreadCount += 1
    }
    const attArr = Array.isArray(msg.attachments) ? msg.attachments : []
    if (attArr.length > 0) {
      hasAttachments = true
    }
    const sentAt = typeof msg.sentAt === 'string' ? msg.sentAt : String(msg.createdAt ?? '')
    if (sentAt && (!lastMessageAt || sentAt >= lastMessageAt)) {
      lastMessageAt = sentAt
      if (typeof msg.snippet === 'string' && msg.snippet.trim()) {
        latestSnippet = msg.snippet.trim()
      }
    }

    const fromAddr = String(msg.fromAddress ?? '').trim().toLowerCase()
    const fromName = String(msg.fromName ?? '').trim()
    if (fromAddr) {
      participantMap.set(fromAddr, {
        name: fromName || participantMap.get(fromAddr)?.name || '',
        address: fromAddr,
      })
    }

    for (const addr of parseAddressList(msg.toAddresses as ParsedEmailAddress[] | undefined)) {
      if (addr.address && !participantMap.has(addr.address)) {
        participantMap.set(addr.address, addr)
      }
    }
  }

  const threadRec = threadDoc as unknown as Record<string, unknown>
  const currentFolder = (threadRec.folder as MailFolder) || 'inbox'
  let nextFolder = currentFolder
  // Just like Gmail/Resend Inboxes: if an archived or sent thread receives a fresh inbound reply, surface it back in Inbox!
  if (reopenInboxOnInbound && (currentFolder === 'archive' || currentFolder === 'sent')) {
    nextFolder = 'inbox'
  }

  await payload.update({
    collection: MAIL_THREADS_COLLECTION as CollectionSlug,
    id: threadId,
    overrideAccess: true,
    req,
    context: { ...(req?.context ?? {}), skipAuditLog: true },
    data: {
      folder: nextFolder,
      messageCount: docs.length,
      unreadCount,
      isRead: unreadCount === 0,
      hasAttachments,
      hasDraft,
      snippet: latestSnippet.slice(0, 180),
      lastMessageAt: lastMessageAt || new Date().toISOString(),
      participants: Array.from(participantMap.values()),
    } as Record<string, unknown>,
  })
}
