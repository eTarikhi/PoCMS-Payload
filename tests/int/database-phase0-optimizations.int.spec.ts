import fs from 'node:fs'
import path from 'node:path'

import type { Payload, PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ensureDraftVersions } from '@/access/draftMigration'
import { ensureOrderable } from '@/access/orderable'
import {
  executePayloadSql,
  resolvePayloadPoolClient,
  resolvePayloadQueryClient,
} from '@/lib/payloadSql'
import {
  buildPostgresAdapterArgs,
  isLocalPostgresUrl,
  isServerlessAutoscalingPostgresUrl,
  resolvePostgresPoolOptions,
  resolveReadReplicaUrls,
} from '@/lib/postgresAdapterConfig'
import { collectDatabaseAdvisorReport } from '@/plugins/databaseManager/core/advisor'
import { createPayloadSqlExecutor, type SqlExecutor } from '@/plugins/databaseManager/core/connection'
import { computeCursorPollDelayMs } from '@/plugins/mailInbox/endpoints/mailStream'
import {
  collectInboxFolderCounts,
  ensureDefaultMailLabels,
} from '@/plugins/mailInbox/services/inboxQueries'
import {
  hasDirectUnpooledPostgresUrl,
  publishMailStreamEvent,
} from '@/plugins/mailInbox/services/realtimeBus'
import { recomputeThreadRollups } from '@/plugins/mailInbox/services/threading'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Phase 0 Database & Neon Serverless Optimizations (R-01..R-05)', () => {
  it('R-01: applies host-aware serverless pool caps, overrides, and deduplicated read replicas', () => {
    const neonUrl =
      'postgresql://user:pass@ep-cool-sky-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full'
    const localUrl = 'postgres://postgres:postgres@127.0.0.1:5432/pocms'

    expect(isLocalPostgresUrl(localUrl)).toBe(true)
    expect(isLocalPostgresUrl('postgres://postgres:postgres@postgres:5432/pocms')).toBe(true)
    expect(isLocalPostgresUrl(neonUrl)).toBe(false)
    expect(isServerlessAutoscalingPostgresUrl(neonUrl)).toBe(true)
    expect(isServerlessAutoscalingPostgresUrl(localUrl)).toBe(false)

    const neonPool = resolvePostgresPoolOptions({ POSTGRES_URL: neonUrl })
    expect(neonPool).toEqual({
      connectionString: neonUrl,
      max: 4,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      maxUses: 7_500,
    })

    const localPool = resolvePostgresPoolOptions({ POSTGRES_URL: localUrl })
    expect(localPool.max).toBe(10)
    expect(localPool.idleTimeoutMillis).toBe(30_000)

    const replica1 =
      'postgresql://user:pass@ep-replica-1-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full'
    const replica2 =
      'postgresql://user:pass@ep-replica-2-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full'

    const replicas = resolveReadReplicaUrls({
      POSTGRES_URL: neonUrl,
      POSTGRES_READ_REPLICA_URLS: `${replica1}, ${neonUrl}, ${replica2}, ${replica1}`,
    })
    expect(replicas).toEqual([replica1, replica2])

    const adapterArgs = buildPostgresAdapterArgs({
      NODE_ENV: 'test',
      POSTGRES_URL: neonUrl,
      POSTGRES_POOL_MAX: '3',
      POSTGRES_READ_REPLICA_URLS: replica1,
    })
    expect(adapterArgs.push).toBe(false)
    expect(adapterArgs.pool?.max).toBe(3)
    expect(adapterArgs.readReplicas).toEqual([replica1])
  })

  it('R-02: recomputes thread rollups via a single atomic zero-TOAST SQL UPDATE and projects fallback selects', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = []
    const txClient = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values })
        return { rows: [], rowCount: 1 }
      }),
    }
    const poolClient = {
      query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
    }

    const sqlPayload = {
      db: {
        drizzle: { $client: poolClient },
        sessions: {
          'tx-99': { db: { session: { client: txClient } } },
        },
      },
      findByID: vi.fn(),
      find: vi.fn(),
      update: vi.fn(),
    } as unknown as Payload

    await recomputeThreadRollups({
      payload: sqlPayload,
      req: { transactionID: Promise.resolve('tx-99') } as unknown as PayloadRequest,
      threadId: 42,
      reopenInboxOnInbound: true,
    })

    // Must execute inside the active transaction client (`tx-99`) without calling Local API `SELECT *`
    expect(txClient.query).toHaveBeenCalledTimes(1)
    expect(poolClient.query).not.toHaveBeenCalled()
    expect(sqlPayload.find).not.toHaveBeenCalled()
    expect(sqlPayload.update).not.toHaveBeenCalled()

    const executedSql = queries[0].text
    expect(executedSql).toContain('UPDATE "public"."mail_threads"')
    expect(executedSql).not.toContain('sanitized_html')
    expect(executedSql).not.toContain('plain_text')
    expect(executedSql).not.toContain('headers_snapshot')
    expect(queries[0].values).toEqual([42, true])

    // Verify fallback path (no SQL db) passes an explicit `select` projection excluding TOAST bodies
    let capturedSelect: Record<string, unknown> | undefined
    const mockFallbackPayload = {
      findByID: vi.fn(async () => ({ id: 7, folder: 'inbox' })),
      find: vi.fn(async (args: { select?: Record<string, unknown> }) => {
        capturedSelect = args.select
        return {
          docs: [
            {
              id: 1,
              status: 'received',
              isRead: false,
              attachments: [],
              sentAt: '2026-10-31T10:00:00.000Z',
              snippet: 'Hello world',
              fromAddress: 'alice@example.com',
              fromName: 'Alice',
              toAddresses: [{ name: 'PoCMS', address: 'dev@vtarikhi.com' }],
            },
          ],
        }
      }),
      update: vi.fn(async () => ({ id: 7 })),
    } as unknown as Payload

    await recomputeThreadRollups({
      payload: mockFallbackPayload,
      threadId: 7,
    })
    expect(capturedSelect).toBeDefined()
    expect(capturedSelect?.sanitizedHtml).toBeUndefined()
    expect(capturedSelect?.plainText).toBeUndefined()
    expect(capturedSelect?.headersSnapshot).toBeUndefined()
    expect(capturedSelect?.status).toBe(true)
  })

  it('R-03: aggregates all 8 inbox folder counts in one single-pass SQL FILTER query', async () => {
    const queryMock = vi.fn(async () => ({
      rows: [
        {
          inbox: 12,
          inbox_unread: 3,
          starred: 4,
          sent: 9,
          archive: 27,
          spam: 2,
          spam_unread: 1,
          trash: 5,
        },
      ],
      rowCount: 1,
    }))

    const payload = {
      db: {
        drizzle: { $client: { query: queryMock } },
      },
      count: vi.fn(),
    } as unknown as Payload

    const counts = await collectInboxFolderCounts(payload)
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(payload.count).not.toHaveBeenCalled()
    expect(counts).toEqual({
      inbox: 12,
      inboxUnread: 3,
      starred: 4,
      sent: 9,
      archive: 27,
      spam: 2,
      spamUnread: 1,
      trash: 5,
    })
  })

  it('R-04: replaces cold-start pagination:false _v scans and serial startup loops with single SQL probes', async () => {
    // 1. ensureDraftVersions: 1 `NOT EXISTS` anti-join, zero `findVersions` calls
    const draftSqlMock = vi.fn(async (_sqlText: string, _values?: unknown[]) => ({
      rows: [{ collection: 'articles', id: 15 }],
      rowCount: 1,
    }))
    const updatedDrafts: Array<{ collection: string; id: number | string }> = []
    const draftPayload = {
      db: { drizzle: { $client: { query: draftSqlMock } } },
      find: vi.fn(),
      findVersions: vi.fn(),
      update: vi.fn(async ({ collection, id }: { collection: string; id: number | string }) => {
        updatedDrafts.push({ collection, id })
        return { id }
      }),
      logger: { info: vi.fn(), error: vi.fn() },
    } as unknown as Payload

    const migrated = await ensureDraftVersions(draftPayload)
    expect(migrated).toBe(1)
    expect(draftSqlMock).toHaveBeenCalledTimes(1)
    expect(draftSqlMock.mock.calls[0]?.[0]).toContain('NOT EXISTS')
    expect(draftPayload.find).not.toHaveBeenCalled()
    expect(draftPayload.findVersions).not.toHaveBeenCalled()
    expect(updatedDrafts).toEqual([{ collection: 'articles', id: 15 }])

    // 2. ensureOrderable: 1 `SELECT EXISTS (...)` probe across all 5 collections, 0 `count` calls
    const orderSqlMock = vi.fn(async () => ({
      rows: [
        {
          projects: false,
          services: false,
          skills: false,
          experiences: false,
          educations: false,
        },
      ],
      rowCount: 1,
    }))
    const orderPayload = {
      db: { drizzle: { $client: { query: orderSqlMock } } },
      count: vi.fn(),
      find: vi.fn(),
      update: vi.fn(),
      logger: { info: vi.fn(), error: vi.fn() },
    } as unknown as Payload

    await ensureOrderable(orderPayload)
    expect(orderSqlMock).toHaveBeenCalledTimes(1)
    expect(orderPayload.count).not.toHaveBeenCalled()
    expect(orderPayload.find).not.toHaveBeenCalled()

    // 3. ensureDefaultMailLabels: 1 `{ slug: { in: [...] } }` lookup instead of 4 serial queries
    const findLabelsMock = vi.fn(async () => ({
      docs: [
        { slug: 'lead' },
        { slug: 'cv-request' },
        { slug: 'client' },
        { slug: 'urgent' },
      ],
    }))
    const labelPayload = {
      find: findLabelsMock,
      create: vi.fn(),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    await ensureDefaultMailLabels(labelPayload)
    expect(findLabelsMock).toHaveBeenCalledTimes(1)
    expect(labelPayload.create).not.toHaveBeenCalled()
  })

  it('R-05: resolves drizzle.$client & primaryDrizzle, protects Neon scale-to-zero, and gates ephemeral stats advisor', async () => {
    const primaryClient = {
      query: vi.fn(async (_sqlText: string, _values?: unknown[]) => ({
        rows: [{ ok: 1 }],
        rowCount: 1,
      })),
    }
    const replicaWrapperClient = {
      query: vi.fn(async (_sqlText: string, _values?: unknown[]) => ({
        rows: [],
        rowCount: 0,
      })),
    }

    // Prefers primaryDrizzle.$client over replica-wrapped drizzle.$client for writes & pg_notify
    const vercelPayload = {
      db: {
        pool: undefined,
        primaryDrizzle: { $client: primaryClient },
        drizzle: { $client: replicaWrapperClient },
      },
    } as unknown as Payload

    expect(resolvePayloadPoolClient(vercelPayload)).toBe(primaryClient)
    expect(await resolvePayloadQueryClient(vercelPayload)).toBe(primaryClient)

    const execRes = await executePayloadSql<{ ok: number }>(vercelPayload, 'SELECT $1::int AS ok', [
      1,
    ])
    expect(execRes?.rows).toEqual([{ ok: 1 }])

    const dbManagerExec = createPayloadSqlExecutor(vercelPayload)
    expect(dbManagerExec).not.toBeNull()
    await dbManagerExec!.query('SELECT * FROM articles WHERE id = $1', [5])
    expect(primaryClient.query).toHaveBeenCalledTimes(2)

    await publishMailStreamEvent(vercelPayload, { type: 'threads.updated', unreadCount: 2 })
    expect(primaryClient.query).toHaveBeenCalledTimes(3)
    expect(primaryClient.query.mock.calls[2]?.[0]).toContain('pg_notify')

    // Neon scale-to-zero: serverless hosts default LISTEN off unless MAIL_STREAM_PG_LISTEN=true
    const neonDirect =
      'postgresql://user:pass@ep-cool-sky-123456.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full'
    expect(hasDirectUnpooledPostgresUrl({ POSTGRES_URL_NON_POOLING: neonDirect }).supported).toBe(
      false,
    )
    expect(
      hasDirectUnpooledPostgresUrl({
        POSTGRES_URL_NON_POOLING: neonDirect,
        MAIL_STREAM_PG_LISTEN: 'true',
      }).supported,
    ).toBe(true)
    expect(
      hasDirectUnpooledPostgresUrl({
        POSTGRES_URL: 'postgres://postgres:postgres@127.0.0.1:5432/pocms',
      }).supported,
    ).toBe(true)

    // Adaptive SSE cursor poll backoff steps from 4s up to 60s
    expect(computeCursorPollDelayMs(0)).toBe(4_000)
    expect(computeCursorPollDelayMs(8)).toBe(8_000)
    expect(computeCursorPollDelayMs(15)).toBe(15_000)
    expect(computeCursorPollDelayMs(25)).toBe(30_000)
    expect(computeCursorPollDelayMs(40)).toBe(60_000)

    // Advisor ephemeral stats guard (< 24h uptime warns about recent stats reset)
    const freshWakeExecutor: SqlExecutor = {
      query: async <T>(sqlText: string) => {
        if (sqlText.includes('pg_stat_user_indexes')) {
          return {
            rows: [
              { table_name: 't', index_name: 'i1', index_scans: 0, size_bytes: 32768 },
              { table_name: 't', index_name: 'i2', index_scans: 0, size_bytes: 32768 },
              { table_name: 't', index_name: 'i3', index_scans: 0, size_bytes: 32768 },
              { table_name: 't', index_name: 'i4', index_scans: 0, size_bytes: 32768 },
            ] as unknown as T[],
          }
        }
        if (sqlText.includes('stats_age_seconds')) {
          return { rows: [{ stats_age_seconds: 300 }] as unknown as T[] }
        }
        return { rows: [] as T[] }
      },
    }

    const report = await collectDatabaseAdvisorReport(freshWakeExecutor)
    expect(
      report.recommendations.some((rec) => rec.includes('Neon scale-from-zero resume')),
    ).toBe(true)

    // Verify documentation & roadmap guide is present and linked
    const repoRoot = process.cwd()
    const archDoc = fs.readFileSync(
      path.join(repoRoot, 'docs', 'database-architecture.md'),
      'utf8',
    )
    const docsIndex = fs.readFileSync(path.join(repoRoot, 'docs', 'README.md'), 'utf8')
    expect(archDoc).toContain('R-01')
    expect(archDoc).toContain('R-14')
    expect(docsIndex).toContain('database-architecture.md')
  })
})
