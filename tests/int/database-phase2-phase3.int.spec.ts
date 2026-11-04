import fs from 'node:fs'
import path from 'node:path'

import type { CollectionConfig, Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { resolveMergedSkillLabels } from '@/app/(frontend)/lib/mappers'
import { createJobsConfig } from '@/jobs/config'
import {
  applyPhase2And3DatabaseOptimizations,
  DEFAULT_SEQUENCE_CACHE_SIZE,
  HIGH_WRITE_SERIAL_SEQUENCES,
  LEGACY_FORMS_BLOCK_TABLES,
  LEGACY_FORMS_SELECT_OPTIONS_TABLE,
  migrateFormsBlocksToJsonb,
  migrateMailMessageBodiesSidecar,
  restoreAuditLogsHeapIfPartitioned,
  retireLegacyUsersRolesAndBackfillProjectSkills,
  tuneHighWriteSequencesCache,
} from '@/lib/phase2And3SqlOptimizations'
import { buildPostgresAdapterArgs } from '@/lib/postgresAdapterConfig'
import {
  areAuditValuesEqual,
  auditLogPlugin,
  computeChangedFields,
  flushPendingAuditLogs,
  getPendingAuditWriteCount,
} from '@/plugins/auditLog'
import { markWebhookLedgerState } from '@/plugins/mailInbox/jobs/ingestWorkflow'
import { pruneWebhookEventsLedger } from '@/plugins/mailInbox/jobs/telemetryTask'
import {
  archiveColdMailBodies,
  hydrateMailMessageBodies,
  upsertMailMessageBody,
} from '@/plugins/mailInbox/services/messageBodiesStore'

describe('Phase 2 & Phase 3 Database Modernization (R-10, R-12, R-13)', () => {
  it('R-10: enables blocksAsJSON: true, collapses forms_blocks_* into forms.fields jsonb, and migrates legacy block tables losslessly', async () => {
    const adapterArgs = buildPostgresAdapterArgs({})
    expect(adapterArgs.blocksAsJSON).toBe(true)

    const schemaPath = path.join(process.cwd(), 'src', 'payload-generated-schema.ts')
    const schemaSource = fs.readFileSync(schemaPath, 'utf8')

    // Zero relational forms_blocks_* tables remain in Drizzle schema
    expect(schemaSource).not.toContain('forms_blocks_')
    const formsMatch = schemaSource.match(
      /export const forms = pgTable\(\s*'forms',([\s\S]*?)\n\)\n/,
    )
    expect(formsMatch).not.toBeNull()
    expect(formsMatch![1]).toContain("fields: jsonb('fields')")

    // Test lossless relational-to-JSONB SQL backfill + ordered table drop
    const executedSql: string[] = []
    const summary = await migrateFormsBlocksToJsonb({
      query: async (sqlText) => {
        executedSql.push(sqlText.trim())
        if (sqlText.includes('FROM information_schema.tables')) {
          return {
            rows: [
              { table_name: 'forms' },
              ...LEGACY_FORMS_BLOCK_TABLES.map((t) => ({ table_name: t })),
              { table_name: LEGACY_FORMS_SELECT_OPTIONS_TABLE },
            ],
          }
        }
        if (sqlText.includes('WITH all_blocks AS')) {
          return { rows: [], rowCount: 2 }
        }
        return { rows: [], rowCount: 0 }
      },
    })

    expect(summary.formsTableExists).toBe(true)
    expect(summary.backfilledFormsCount).toBe(2)
    expect(summary.droppedLegacyTables).toHaveLength(8)
    // `forms_blocks_select_options` must be dropped BEFORE `forms_blocks_select`
    expect(summary.droppedLegacyTables[0]).toBe('forms_blocks_select_options')

    const backfillStmt = executedSql.find((s) => s.includes('WITH all_blocks AS'))
    expect(backfillStmt).toBeDefined()
    expect(backfillStmt).toContain("'blockType', 'select'")
    expect(backfillStmt).toContain('forms_blocks_select_options')
    expect(backfillStmt).toContain('jsonb_agg(block_json ORDER BY block_order ASC)')
  })

  it('R-12: schedules retention tasks (expired sessions, 14d jobs + orphan logs, 24h webhook snapshot compaction) and supports autoRun opt-in', async () => {
    const sanitized = await config
    const tasks = sanitized.jobs?.tasks ?? []

    const bySlug = new Map(tasks.map((t) => [t.slug, t]))
    expect(bySlug.get('purgeExpiredSessions')?.schedule).toEqual([
      { cron: '15 3 * * *', queue: 'default' },
    ])
    expect(bySlug.get('purgeCompletedJobs')?.schedule).toEqual([
      { cron: '30 3 * * *', queue: 'default' },
    ])
    expect(bySlug.get('pruneDocumentVersions')?.schedule).toEqual([
      { cron: '0 4 * * *', queue: 'default' },
    ])
    expect(bySlug.has('maintainAuditLogPartitions')).toBe(false)
    expect(bySlug.get('pruneWebhookLedger')?.schedule).toEqual([
      { cron: '45 3 * * *', queue: 'mail' },
    ])
    expect(bySlug.get('archiveColdMailBodies')?.schedule).toEqual([
      { cron: '20 4 * * 0', queue: 'mail' },
    ])

    // Verify opt-in autoRun configuration
    expect(createJobsConfig({ NODE_ENV: 'production' }).autoRun).toBeUndefined()
    expect(
      createJobsConfig({ NODE_ENV: 'production', PAYLOAD_JOBS_AUTORUN: 'true' }).autoRun,
    ).toEqual([{ cron: '*/5 * * * *', limit: 25, allQueues: true }])

    // Execute `purgeExpiredSessions` & `purgeCompletedJobs` handlers against mock SQL/Payload
    const sqlCalls: Array<{ text: string; values?: unknown[] }> = []
    let capturedCutoff = ''
    const mockPayload = {
      db: {
        schemaName: 'public',
        pool: {
          query: vi.fn(async (text: string, values?: unknown[]) => {
            sqlCalls.push({ text, values })
            return { rows: [], rowCount: 4 }
          }),
        },
      },
      delete: vi.fn(async ({ where }: { where: { and: Array<{ completedAt?: { less_than: string } }> } }) => {
        capturedCutoff = where.and[0]?.completedAt?.less_than ?? ''
        return { docs: [{ id: 1 }, { id: 2 }, { id: 3 }] }
      }),
    } as unknown as Payload

    const sessionsTask = bySlug.get('purgeExpiredSessions')!
    const sessionsRes = await (sessionsTask.handler as (args: unknown) => Promise<{ output: Record<string, unknown> }>)({
      input: {},
      req: { payload: mockPayload },
    })
    expect(sessionsRes.output.deletedCount).toBe(4)
    expect(sqlCalls[0]?.text).toContain('DELETE FROM "public"."users_sessions" WHERE "expires_at" < $1::timestamptz')

    const jobsTask = bySlug.get('purgeCompletedJobs')!
    const before14d = Date.now() - 14 * 86_400_000
    const jobsRes = await (jobsTask.handler as (args: unknown) => Promise<{ output: Record<string, unknown> }>)({
      input: {},
      req: { payload: mockPayload },
    })
    expect(jobsRes.output.deletedCount).toBe(3)
    expect(jobsRes.output.orphanLogDeletedCount).toBe(4)
    const parsedCutoffMs = new Date(capturedCutoff).getTime()
    expect(Math.abs(parsedCutoffMs - before14d)).toBeLessThan(10_000)
    expect(
      sqlCalls.some((c) => c.text.includes('DELETE FROM "public"."payload_jobs_log"')),
    ).toBe(true)

    // Verify webhook snapshot clearing on state transition + 24h compaction in `pruneWebhookEventsLedger`
    const webhookUpdates: Array<Record<string, unknown>> = []
    const webhookPayload = {
      db: {
        schemaName: 'public',
        pool: {
          query: vi.fn(async () => ({ rows: [], rowCount: 7 })),
        },
      },
      find: vi.fn(async () => ({
        docs: [{ id: 55, svixId: 'msg_123', attempts: 0, payloadSnapshot: { raw: 'big' } }],
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        webhookUpdates.push(data)
        return { id: 55, ...data }
      }),
      delete: vi.fn(async () => ({ docs: [{ id: 10 }, { id: 11 }] })),
    } as unknown as Payload

    await markWebhookLedgerState({
      payload: webhookPayload,
      svixId: 'msg_123',
      state: 'processed',
    })
    expect(webhookUpdates[0]).toMatchObject({
      processingState: 'processed',
      payloadSnapshot: null,
    })

    const ledgerPruned = await pruneWebhookEventsLedger({
      payload: webhookPayload,
      retentionDays: 30,
      compactAfterHours: 24,
    })
    expect(ledgerPruned.compactedCount).toBe(7)
    expect(ledgerPruned.deletedCount).toBe(2)
  })

  it('R-12: decouples audit-logs writes from req.transactionID and offloads Lexical AST diffing to non-blocking microtasks', async () => {
    const sharedLexicalAst = {
      root: {
        type: 'root',
        children: Array.from({ length: 50 }, (_, idx) => ({
          type: 'paragraph',
          children: [{ type: 'text', text: `Paragraph ${idx} content` }],
        })),
      },
    }

    // Identical reference short-circuits in O(1); deep mutation detects exact changed top-level field
    expect(areAuditValuesEqual(sharedLexicalAst, sharedLexicalAst)).toBe(true)
    const editedLexicalAst = structuredClone(sharedLexicalAst)
    editedLexicalAst.root.children[49].children[0].text = 'Updated final paragraph'
    expect(areAuditValuesEqual(sharedLexicalAst, editedLexicalAst)).toBe(false)
    expect(
      computeChangedFields(
        { id: 1, title: 'Same', content: editedLexicalAst, extraUndefined: undefined },
        { id: 1, title: 'Same', content: sharedLexicalAst },
      ),
    ).toEqual(['content'])

    // Verify asyncWrite: true returns before `payload.create` runs AND never passes `req`
    const createCalls: Array<Record<string, unknown>> = []
    const articlesCol: CollectionConfig = {
      slug: 'articles',
      labels: { singular: 'Article', plural: 'Articles' },
      admin: { useAsTitle: 'title' },
      fields: [],
    }
    const transformed = await auditLogPlugin({ asyncWrite: true })({
      collections: [articlesCol],
      globals: [],
    } as never)

    let releaseCreate!: () => void
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve
    })

    const hookedArticles = (transformed.collections ?? [])[0]!
    const mockReq = {
      transactionID: Promise.resolve(999),
      user: { id: 7, name: 'Amir Tarikhi', email: 'amir@vtarikhi.com' },
      headers: new Headers({
        'x-forwarded-for': '198.51.100.7',
        'user-agent': 'Vitest-Async/1.0',
      }),
      payload: {
        create: vi.fn(async (args: Record<string, unknown>) => {
          await createGate
          createCalls.push(args)
          return { id: 500 }
        }),
        logger: { error: vi.fn() },
      },
    } as unknown as PayloadRequest

    for (const hook of hookedArticles.hooks?.afterChange ?? []) {
      await hook({
        collection: hookedArticles,
        context: {},
        data: {},
        doc: { id: 42, title: 'Async Audit Spec', content: editedLexicalAst },
        operation: 'update',
        previousDoc: { id: 42, title: 'Async Audit Spec', content: sharedLexicalAst },
        req: mockReq,
      } as never)
    }

    // Hook returned immediately even while `payload.create` is still blocked on `createGate`!
    expect(createCalls).toHaveLength(0)
    expect(getPendingAuditWriteCount()).toBe(1)

    releaseCreate()
    await flushPendingAuditLogs()

    expect(getPendingAuditWriteCount()).toBe(0)
    expect(createCalls).toHaveLength(1)
    // Critical R-12 invariant: `req` is omitted so `audit-logs` insert NEVER joins `req.transactionID`
    expect(createCalls[0].req).toBeUndefined()
    expect(createCalls[0].data).toMatchObject({
      action: 'update',
      entityType: 'articles',
      documentId: '42',
      ip: '198.51.100.7',
      meta: { changedFields: ['content'] },
    })
  })

  it('R-13a: splits cold MIME bodies into 1:1 mail_message_bodies sidecar with lazy batched hydration and private Vercel Blob archival', async () => {
    const schemaPath = path.join(process.cwd(), 'src', 'payload-generated-schema.ts')
    const schemaSource = fs.readFileSync(schemaPath, 'utf8')

    // Hot `mail_messages` table has ZERO cold MIME columns
    const mailMessagesMatch = schemaSource.match(
      /export const mail_messages = pgTable\(\s*'mail_messages',([\s\S]*?)\n\)\n/,
    )
    expect(mailMessagesMatch).not.toBeNull()
    expect(mailMessagesMatch![1]).not.toContain('sanitized_html')
    expect(mailMessagesMatch![1]).not.toContain('quoted_history_text')
    expect(mailMessagesMatch![1]).not.toContain('headers_snapshot')

    // 1:1 `mail_message_bodies` table exists with ON DELETE CASCADE FK to `mail_messages.id`
    const bodiesMatch = schemaSource.match(
      /export const mail_message_bodies = pgTable\(\s*'mail_message_bodies',([\s\S]*?)\n\)\n/,
    )
    expect(bodiesMatch).not.toBeNull()
    expect(bodiesMatch![1]).toContain("messageId: integer('message_id').notNull().primaryKey()")
    expect(bodiesMatch![1]).toContain("sanitizedHtml: text('sanitized_html')")
    expect(bodiesMatch![1]).toContain("quotedHistoryText: text('quoted_history_text')")
    expect(bodiesMatch![1]).toContain("headersSnapshot: jsonb('headers_snapshot')")
    expect(bodiesMatch![1]).toContain("blobKey: varchar('blob_key')")
    expect(bodiesMatch![1]).toContain("onDelete('cascade')")

    // Test SQL upsert -> cold Blob archival -> lazy rehydration from private Vercel Blob
    const sidecarRows = new Map<
      number,
      {
        message_id: number
        sanitized_html: string | null
        quoted_history_text: string | null
        headers_snapshot: Record<string, string> | null
        blob_key: string | null
      }
    >()
    const blobVault = new Map<string, string>()

    const sqlPayload = {
      db: {
        schemaName: 'public',
        pool: {
          query: vi.fn(async (text: string, values?: unknown[]) => {
            if (text.includes('INSERT INTO "public"."mail_message_bodies"')) {
              const id = Number(values?.[0])
              sidecarRows.set(id, {
                message_id: id,
                sanitized_html: (values?.[1] as string | null) ?? null,
                quoted_history_text: (values?.[2] as string | null) ?? null,
                headers_snapshot: values?.[3]
                  ? (JSON.parse(String(values[3])) as Record<string, string>)
                  : null,
                blob_key: (values?.[4] as string | null) ?? null,
              })
              return { rows: [], rowCount: 1 }
            }
            if (text.includes('WHERE b."blob_key" IS NULL')) {
              return {
                rows: Array.from(sidecarRows.values()).filter((r) => r.blob_key === null),
                rowCount: sidecarRows.size,
              }
            }
            if (text.includes('UPDATE "public"."mail_message_bodies"') && text.includes('"blob_key" = $2')) {
              const id = Number(values?.[0])
              const url = String(values?.[1])
              const existing = sidecarRows.get(id)
              if (existing) {
                sidecarRows.set(id, {
                  ...existing,
                  blob_key: url,
                  sanitized_html: null,
                  quoted_history_text: null,
                  headers_snapshot: null,
                })
              }
              return { rows: [], rowCount: 1 }
            }
            if (text.includes('WHERE "message_id" = ANY($1::int[])')) {
              const ids = (values?.[0] as number[]) ?? []
              return {
                rows: ids.map((id) => sidecarRows.get(id)).filter(Boolean),
                rowCount: ids.length,
              }
            }
            return { rows: [], rowCount: 0 }
          }),
        },
      },
    } as unknown as Payload

    const largeHtml = `<article><p>${'Archived newsletter content '.repeat(80)}</p></article>`
    await upsertMailMessageBody({
      payload: sqlPayload,
      messageId: 77,
      body: {
        sanitizedHtml: largeHtml,
        quotedHistoryText: '> Prior quoted reply',
        headersSnapshot: { 'message-id': '<77@acme.org>' },
      },
    })

    // Archive cold body > 90d to private Blob storage -> clears inline Postgres TOAST columns
    const archiveRes = await archiveColdMailBodies({
      payload: sqlPayload,
      olderThanDays: 90,
      blobToken: 'vercel_blob_rw_live_secret_token',
      putBlobImpl: async ({ pathname, body }) => {
        const url = `https://private.blob.vercel-storage.com/${pathname}`
        blobVault.set(url, body)
        return { url }
      },
    })
    expect(archiveRes.archivedCount).toBe(1)
    expect(sidecarRows.get(77)?.sanitized_html).toBeNull()
    expect(sidecarRows.get(77)?.blob_key).toBe(
      'https://private.blob.vercel-storage.com/mail-bodies/msg-77.json',
    )

    // Lazy hydration transparently restores from private Blob using Bearer token
    let capturedAuthHeader = ''
    const docToHydrate: Record<string, unknown> = { id: 77, subject: 'Archived thread' }
    await hydrateMailMessageBodies({
      payload: sqlPayload,
      docs: [docToHydrate],
      blobToken: 'vercel_blob_rw_live_secret_token',
      fetchImpl: async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined
        capturedAuthHeader = headers?.Authorization ?? ''
        const stored = blobVault.get(String(input))
        return new Response(stored ?? '{}', { status: stored ? 200 : 404 })
      },
    })
    expect(capturedAuthHeader).toBe('Bearer vercel_blob_rw_live_secret_token')
    expect(docToHydrate.sanitizedHtml).toBe(largeHtml)
    expect(docToHydrate.quotedHistoryText).toBe('> Prior quoted reply')
    expect(docToHydrate.headersSnapshot).toEqual({ 'message-id': '<77@acme.org>' })

    // Verify legacy `mail_messages` inline MIME column migration + drop
    const sidecarMig = await migrateMailMessageBodiesSidecar({
      query: async (sqlText) => {
        if (sqlText.includes('FROM information_schema.columns')) {
          return {
            rows: [
              { column_name: 'id' },
              { column_name: 'sanitized_html' },
              { column_name: 'quoted_history_text' },
              { column_name: 'headers_snapshot' },
            ],
          }
        }
        if (sqlText.includes('INSERT INTO "public"."mail_message_bodies"')) {
          return { rows: [], rowCount: 15 }
        }
        return { rows: [], rowCount: 0 }
      },
    })
    expect(sidecarMig.backfilledBodiesCount).toBe(15)
    expect(sidecarMig.droppedLegacyColumns).toEqual([
      'sanitized_html',
      'quoted_history_text',
      'headers_snapshot',
    ])
  })

  it('restores any previously partitioned audit_logs (relkind = p) back to a standard Payload 3 Drizzle heap table (relkind = r) with 100% row preservation', async () => {
    const schemaPath = path.join(process.cwd(), 'src', 'payload-generated-schema.ts')
    const schemaSource = fs.readFileSync(schemaPath, 'utf8')
    // Standard Payload `audit_logs` has single-column PK and `audit_logs_id` on `payload_locked_documents_rels`
    expect(schemaSource).toContain('audit_logs_id')
    expect(schemaSource).not.toContain('maintainAuditLogPartitions')

    const executed: string[] = []
    const restoreSummary = await restoreAuditLogsHeapIfPartitioned({
      query: async (sqlText) => {
        executed.push(sqlText.trim())
        if (sqlText.includes("c.relname = 'audit_logs'")) {
          return { rows: [{ relkind: 'p' }] }
        }
        if (sqlText.includes('SELECT to_regclass')) {
          return { rows: [{ exists: true }] }
        }
        if (sqlText.includes('INSERT INTO "public"."audit_logs"')) {
          return { rows: [], rowCount: 42 }
        }
        if (sqlText.includes('DELETE FROM "public"."payload_migrations"')) {
          return { rows: [], rowCount: 1 }
        }
        if (sqlText.includes('SELECT COUNT(*)::int AS cnt FROM "public"."payload_migrations"')) {
          return { rows: [{ cnt: 0 }] }
        }
        return { rows: [], rowCount: 0 }
      },
    })

    expect(restoreSummary.auditLogsExists).toBe(true)
    expect(restoreSummary.restoredFromPartitioned).toBe(true)
    expect(restoreSummary.preservedRowsCount).toBe(42)
    expect(restoreSummary.removedLegacyMigrationRow).toBe(true)

    // Verify single-column PRIMARY KEY ("id") and sequence ownership transfer BEFORE dropping partitioned parent
    expect(executed.some((s) => s.includes('PRIMARY KEY ("id")'))).toBe(true)
    const seqIdx = executed.findIndex((s) =>
      s.includes('ALTER SEQUENCE "public"."audit_logs_id_seq" OWNED BY "public"."audit_logs"."id"'),
    )
    const dropPartIdx = executed.findIndex((s) =>
      s.includes('DROP TABLE "public"."audit_logs__part_restore" CASCADE'),
    )
    expect(seqIdx).toBeGreaterThan(-1)
    expect(dropPartIdx).toBeGreaterThan(seqIdx)

    // Verify re-inserting ('dev', -1) sentinel when retired Phase 1 migration row was cleared
    expect(
      executed.some((s) =>
        s.includes(`INSERT INTO "public"."payload_migrations" ("name", "batch") VALUES ('dev', -1)`),
      ),
    ).toBe(true)

    // Verify no-op when `audit_logs` is already a standard heap table (`relkind = 'r'`)
    const noopSummary = await restoreAuditLogsHeapIfPartitioned({
      query: async (sqlText) => {
        if (sqlText.includes("c.relname = 'audit_logs'")) {
          return { rows: [{ relkind: 'r' }] }
        }
        return { rows: [{ exists: false }], rowCount: 0 }
      },
    })
    expect(noopSummary.restoredFromPartitioned).toBe(false)

    // Verify combined Phase 2 & 3 orchestrator returns gracefully on empty database
    const emptyCombined = await applyPhase2And3DatabaseOptimizations({
      query: async () => ({ rows: [], rowCount: 0 }),
    })
    expect(emptyCombined.formsBlocks.formsTableExists).toBe(false)
    expect(emptyCombined.mailBodies.mailMessagesExists).toBe(false)
    expect(emptyCombined.auditLogsHeap.auditLogsExists).toBe(false)
    expect(emptyCombined.taxonomyAndLegacyRoles.legacyUsersRolesTableFound).toBe(false)
    expect(emptyCombined.sequenceCache.tunedSequences).toEqual([])
  })

  it('R-11a: retires Users.legacyRoles (users_roles + enum_users_roles), links Projects <-> Skills via relationship + virtual join, and merges skill labels', async () => {
    const schemaPath = path.join(process.cwd(), 'src', 'payload-generated-schema.ts')
    const schemaSource = fs.readFileSync(schemaPath, 'utf8')

    // 1. `users_roles` and `enum_users_roles` are completely retired from Drizzle schema
    expect(schemaSource).not.toContain('users_roles')
    expect(schemaSource).not.toContain('enum_users_roles')

    // 2. `projects_rels` and `site_settings_rels` link `skills_id`, while `skills` adds 0 extra columns for virtual `join`
    expect(schemaSource).toContain('export const projects_rels = pgTable(')
    expect(schemaSource).toContain('export const site_settings_rels = pgTable(')
    const skillsTableMatch = schemaSource.match(
      /export const skills = pgTable\(\s*'skills',([\s\S]*?)\n\)\n/,
    )
    expect(skillsTableMatch).not.toBeNull()
    expect(skillsTableMatch![1]).not.toContain('related_projects')

    const sanitized = await config
    const skillsCol = sanitized.collections.find((c) => c.slug === 'skills')!
    const joinField = skillsCol.fields.find(
      (f) => 'name' in f && f.name === 'relatedProjects' && f.type === 'join',
    )
    expect(joinField).toBeDefined()

    // 3. Pure mapper merges populated single-topic Skills, deduplicates versioned tags, and expands compound bars when freeform is empty
    const postgresSkill = {
      id: 10,
      label: 'PostgreSQL',
      group: 'backend' as const,
      value: 90,
      color: 'primary' as const,
      updatedAt: '2026-11-01T00:00:00.000Z',
      createdAt: '2026-11-01T00:00:00.000Z',
    }
    const compoundFrontendSkill = {
      id: 11,
      label: 'React, Next.js, Vue.js',
      group: 'frontend' as const,
      value: 95,
      color: 'info' as const,
      updatedAt: '2026-11-01T00:00:00.000Z',
      createdAt: '2026-11-01T00:00:00.000Z',
    }
    const phpSkill = {
      id: 12,
      label: 'PHP',
      group: 'backend' as const,
      value: 95,
      color: 'success' as const,
      updatedAt: '2026-11-01T00:00:00.000Z',
      createdAt: '2026-11-01T00:00:00.000Z',
    }

    expect(
      resolveMergedSkillLabels(
        ['Next.js', 'PHP 8', 'Payload CMS'],
        [compoundFrontendSkill, phpSkill, postgresSkill],
      ),
    ).toEqual(['Next.js', 'PHP 8', 'Payload CMS', 'PostgreSQL'])

    expect(resolveMergedSkillLabels([], [compoundFrontendSkill, postgresSkill])).toEqual([
      'React',
      'Next.js',
      'Vue.js',
      'PostgreSQL',
    ])

    // 4. SQL migration losslessly backfills `users_roles` -> `users_rels`, drops `users_roles` + `enum_users_roles`, and backfills `projects_rels`
    const ranSql: string[] = []
    const r11Summary = await retireLegacyUsersRolesAndBackfillProjectSkills({
      query: async (sqlText) => {
        ranSql.push(sqlText.trim())
        if (sqlText.includes('SELECT to_regclass($1) IS NOT NULL AS exists')) {
          return { rows: [{ exists: true }] }
        }
        if (sqlText.includes('AS has_users_rels')) {
          return { rows: [{ has_users_rels: true, has_roles: true }] }
        }
        if (sqlText.includes("WHERE \"value\"::text = 'editor'")) {
          return { rows: [], rowCount: 2 }
        }
        if (sqlText.includes("WHERE \"value\"::text = 'admin'")) {
          return { rows: [], rowCount: 1 }
        }
        if (sqlText.includes("t.typname = 'enum_users_roles'")) {
          return { rows: [{ '?column?': 1 }] }
        }
        if (sqlText.includes('AS has_projects_rels')) {
          return {
            rows: [{ has_projects_rels: true, has_projects_texts: true, has_skills: true }],
          }
        }
        if (sqlText.includes('INSERT INTO "public"."projects_rels"')) {
          return { rows: [], rowCount: 5 }
        }
        return { rows: [], rowCount: 0 }
      },
    })

    expect(r11Summary.legacyUsersRolesTableFound).toBe(true)
    expect(r11Summary.migratedUsersRolesCount).toBe(3)
    expect(r11Summary.droppedUsersRolesArtifacts).toBe(true)
    expect(r11Summary.backfilledProjectSkillLinksCount).toBe(5)
    expect(ranSql.some((s) => s.includes('DROP TABLE IF EXISTS "public"."users_roles" CASCADE'))).toBe(
      true,
    )
    expect(ranSql.some((s) => s.includes('DROP TYPE IF EXISTS "public"."enum_users_roles"'))).toBe(
      true,
    )
  })

  it('R-14b: tunes CACHE 64 on high-write serial PK sequences while leaving child array varchar PKs untouched', async () => {
    expect(DEFAULT_SEQUENCE_CACHE_SIZE).toBe(64)
    expect(HIGH_WRITE_SERIAL_SEQUENCES).toEqual([
      'audit_logs_id_seq',
      'payload_jobs_id_seq',
      '_articles_v_id_seq',
      '_projects_v_id_seq',
      'mail_webhook_events_id_seq',
      'mail_messages_id_seq',
    ])

    const executed: string[] = []
    const seqSummary = await tuneHighWriteSequencesCache({
      query: async (sqlText) => {
        executed.push(sqlText.trim())
        if (sqlText.includes('FROM pg_sequences')) {
          return {
            rows: [
              { sequencename: 'audit_logs_id_seq', cache_size: 1 },
              { sequencename: 'payload_jobs_id_seq', cache_size: 1 },
              { sequencename: '_articles_v_id_seq', cache_size: 64 },
              { sequencename: '_projects_v_id_seq', cache_size: 1 },
              { sequencename: 'mail_webhook_events_id_seq', cache_size: 128 },
            ],
          }
        }
        return { rows: [], rowCount: 0 }
      },
    })

    expect(seqSummary.targetCacheSize).toBe(64)
    expect(seqSummary.tunedSequences).toEqual([
      'audit_logs_id_seq',
      'payload_jobs_id_seq',
      '_projects_v_id_seq',
    ])
    expect(seqSummary.alreadyTunedSequences).toEqual([
      '_articles_v_id_seq',
      'mail_webhook_events_id_seq',
    ])
    expect(seqSummary.missingSequences).toEqual(['mail_messages_id_seq'])
    expect(executed).toContain('ALTER SEQUENCE "public"."audit_logs_id_seq" CACHE 64')
    expect(executed).toContain('ALTER SEQUENCE "public"."payload_jobs_id_seq" CACHE 64')
    expect(executed).toContain('ALTER SEQUENCE "public"."_projects_v_id_seq" CACHE 64')
  })
})
