import dns from 'node:dns'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'

import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import {
  fallbackResolveHost,
  installNeonWebSocketErrorEventFix,
  installNodeDnsFallback,
  loadDnsPrewarmEnv,
  resolveIPv4ViaDoH,
} from '@/lib/nodeDnsFallback'
import {
  applyPhase1DatabaseOptimizations,
  buildPhase1OptimizationPlan,
  LOCKED_DOCUMENT_RELS_STANDARD_FK_COLUMNS,
  TEXTS_TABLES,
  UNDONE_CONFLICTING_OUT_OF_BAND_INDEXES,
} from '@/lib/phase1SqlOptimizations'
import { phase1BeforeSchemaInit } from '@/lib/postgresSchemaHooks'
import { runDatabaseRepairAction } from '@/plugins/databaseManager/core/repair'
import { REPAIR_ACTION_META } from '@/plugins/databaseManager/shared'

describe('Phase 1 Database Integrity, Versioned Migrations & Index Optimizations (R-06..R-09)', () => {
  it('R-06 & R-08 & R-09: eliminates FK contradictions, fixes all 7 *_texts leading FK indexes, and prunes boolean B-trees in generated schema', () => {
    const schemaPath = path.join(process.cwd(), 'src', 'payload-generated-schema.ts')
    const schemaSource = fs.readFileSync(schemaPath, 'utf8')

    // R-06.1: mail_messages.thread_id must be NOT NULL with ON DELETE CASCADE (never SET NULL)
    const mailMsgMatch = schemaSource.match(
      /export const mail_messages = pgTable\(\s*'mail_messages',([\s\S]*?)\n\)\n/,
    )
    expect(mailMsgMatch).not.toBeNull()
    expect(mailMsgMatch![1]).toContain("onDelete: 'cascade'")
    expect(mailMsgMatch![1]).not.toContain("onDelete: 'set null'")

    // R-06.2: form_submissions.form_id must NOT have .notNull() alongside onDelete: 'set null'
    const formSubMatch = schemaSource.match(
      /export const form_submissions = pgTable\(\s*'form_submissions',([\s\S]*?)\n\)\n/,
    )
    expect(formSubMatch).not.toBeNull()
    const formFieldSnippet = formSubMatch![1].match(/form:\s*integer\('form_id'\)[\s\S]*?\}\)/)
    expect(formFieldSnippet).not.toBeNull()
    expect(formFieldSnippet![0]).not.toContain('.notNull()')
    expect(formFieldSnippet![0]).toContain("onDelete: 'set null'")

    // R-08: Zero inverted `*_texts_order_parent` indexes remain; all 7 *_texts tables lead with columns.parent
    expect(schemaSource).not.toContain('_texts_order_parent')
    for (const tbl of TEXTS_TABLES) {
      const idxName = `${tbl}_parent_path_order_idx`
      expect(idxName.length).toBeLessThanOrEqual(63)
      expect(schemaSource).toMatch(
        new RegExp(
          `index\\('${idxName}'\\)\\.on\\(\\s*columns\\.parent,\\s*columns\\.path,\\s*columns\\.order,?\\s*\\)`,
        ),
      )
    }

    // R-08: Query-aligned composite indexes exist in Drizzle schema
    expect(schemaSource).toContain('mail_threads_counts_cover_idx')
    expect(schemaSource).toContain('mail_threads_folder_last_msg_idx')
    expect(schemaSource).toContain('mail_messages_thread_sent_idx')
    expect(schemaSource).toContain('_articles_v_parent_updated_idx')
    expect(schemaSource).toContain('_projects_v_parent_updated_idx')
    expect(schemaSource).toContain('payload_jobs_queue_wait_created_idx')

    // R-09: Write-amplifying standalone boolean B-tree indexes are removed from Drizzle schema
    for (const prunedIdx of [
      'mail_threads_is_read_idx',
      'mail_threads_is_starred_idx',
      'mail_threads_has_attachments_idx',
      'mail_messages_is_read_idx',
      'mail_messages_direction_idx',
      'mail_messages_status_idx',
      '_articles_v_autosave_idx',
      '_projects_v_autosave_idx',
      'payload_jobs_processing_idx',
      'payload_jobs_has_error_idx',
    ]) {
      expect(schemaSource).not.toContain(`'${prunedIdx}'`)
    }
  })

  it('R-06..R-09: unit-tests phase1BeforeSchemaInit transformation on synthetic rawTables', async () => {
    const indexSet = new Set<string>(['header_texts_order_parent', 'mail_threads_is_read_idx'])
    const fakeAdapter = {
      indexes: indexSet,
      rawTables: {
        mail_messages: {
          name: 'mail_messages',
          columns: {
            thread: {
              name: 'thread_id',
              type: 'integer',
              notNull: true,
              reference: { table: 'mail_threads', name: 'id', onDelete: 'set null' },
            },
            sentAt: { name: 'sent_at', type: 'timestamp' },
            isRead: { name: 'is_read', type: 'boolean' },
          },
          indexes: {
            threadIdx: { name: 'mail_messages_thread_idx', on: 'thread' },
            isReadIdx: { name: 'mail_messages_is_read_idx', on: 'isRead' },
          },
        },
        form_submissions: {
          name: 'form_submissions',
          columns: {
            form: {
              name: 'form_id',
              type: 'integer',
              notNull: true,
              reference: { table: 'forms', name: 'id', onDelete: 'set null' },
            },
          },
        },
        header_texts: {
          name: 'header_texts',
          columns: {
            order: { name: 'order', type: 'integer' },
            parent: { name: 'parent_id', type: 'integer' },
            path: { name: 'path', type: 'varchar' },
          },
          indexes: {
            orderParentIdx: { name: 'header_texts_order_parent', on: ['order', 'parent'] },
          },
        },
      },
    }

    await phase1BeforeSchemaInit({
      adapter: fakeAdapter as never,
      extendTable: vi.fn(),
      schema: { enums: {}, relations: {}, tables: {} },
    })

    expect(fakeAdapter.rawTables.mail_messages.columns.thread.reference.onDelete).toBe('cascade')
    expect(fakeAdapter.rawTables.form_submissions.columns.form.notNull).toBe(false)
    expect(fakeAdapter.rawTables.header_texts.indexes.orderParentIdx).toEqual({
      name: 'header_texts_parent_path_order_idx',
      on: ['parent', 'path', 'order'],
    })
    expect(indexSet.has('header_texts_order_parent')).toBe(false)
    expect(indexSet.has('header_texts_parent_path_order_idx')).toBe(true)

    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> }
    expect(pkgJson.scripts['db:migrate']).toContain('migrate-neon.mjs')
    expect(pkgJson.scripts['db:optimize-indexes']).toContain('optimize-indexes')
    expect(fs.existsSync(path.join(process.cwd(), 'scripts', 'migrate-neon.mjs'))).toBe(true)
    // Verify R-07 compliance: no tracked migrations in src/migrations while Drizzle push is default in dev
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'migrations', 'index.ts'))).toBe(false)
    const migrateRunnerSource = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'migrate-neon.mjs'),
      'utf8',
    )
    expect(migrateRunnerSource).not.toContain('WHERE "batch" = -1')
  })

  it('R-08 & R-09: builds Drizzle-aligned CONCURRENTLY composite & standard FK plans, prunes undone out-of-band R-08b/R-09b indexes, and wires apply-neon-optimizations into /admin/database Repair', async () => {
    const concurrentPlan = buildPhase1OptimizationPlan({ schemaName: 'public', concurrent: true })

    // Every index identifier must obey PostgreSQL's 63-byte NAMEDATALEN cap
    expect(concurrentPlan.createIndexes).toHaveLength(32) // 13 R-08a composite + 19 standard Drizzle lock FK indexes
    for (const idx of concurrentPlan.createIndexes) {
      expect(idx.name.length).toBeLessThanOrEqual(63)
      expect(idx.createSql).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS')
      expect(idx.createSql).not.toContain(' WHERE ')
      expect(idx.createSql).not.toContain('gin_trgm_ops')
    }
    for (const drop of concurrentPlan.dropIndexes) {
      expect(drop.dropSql).toContain('DROP INDEX CONCURRENTLY IF EXISTS')
    }

    // Verify all 13 Drizzle-native composite B-trees + 19 standard `payload_locked_documents_rels_*_id_idx` are created
    const sqlAll = concurrentPlan.createIndexes.map((i) => i.createSql).join('\n')
    expect(sqlAll).toContain('"header_texts_parent_path_order_idx"')
    expect(sqlAll).toContain('"_articles_v_parent_updated_idx" ON "public"."_articles_v" ("parent_id", "updated_at")')
    expect(sqlAll).toContain('"mail_threads_counts_cover_idx"')
    expect(sqlAll).toContain('"mail_threads_folder_last_msg_idx"')
    expect(sqlAll).toContain('"mail_messages_thread_sent_idx"')
    expect(sqlAll).toContain('"payload_jobs_queue_wait_created_idx"')
    expect(LOCKED_DOCUMENT_RELS_STANDARD_FK_COLUMNS).toHaveLength(19)
    for (const { column, drizzleIndex, undonePartialIndex } of LOCKED_DOCUMENT_RELS_STANDARD_FK_COLUMNS) {
      expect(sqlAll).toContain(
        `"${drizzleIndex}" ON "public"."payload_locked_documents_rels" ("${column}");`,
      )
      expect(sqlAll).not.toContain(undonePartialIndex)
    }

    // Verify all 27 undone out-of-band conflicting R-08b/R-09b indexes are pruned on optimize
    expect(UNDONE_CONFLICTING_OUT_OF_BAND_INDEXES).toHaveLength(27)
    const dropAll = concurrentPlan.dropIndexes.map((d) => d.dropSql).join('\n')
    for (const undoneIdx of UNDONE_CONFLICTING_OUT_OF_BAND_INDEXES) {
      expect(dropAll).toContain(`DROP INDEX CONCURRENTLY IF EXISTS "public"."${undoneIdx}";`)
    }

    // Verify Repair action in /admin/database uses CONCURRENTLY when unpooled and non-concurrent when pooled
    expect(REPAIR_ACTION_META.some((m) => m.action === 'apply-neon-optimizations')).toBe(true)

    const ranStatements: string[] = []
    const mockExecutor = {
      query: async <T>(text: string) => {
        ranStatements.push(text)
        if (text.includes('information_schema.columns')) {
          return {
            rows: [
              { table_name: 'header_texts', column_name: 'parent_id' },
              { table_name: 'header_texts', column_name: 'path' },
              { table_name: 'header_texts', column_name: 'order' },
              { table_name: 'mail_threads', column_name: 'folder' },
              { table_name: 'mail_threads', column_name: 'is_read' },
              { table_name: 'mail_threads', column_name: 'is_starred' },
              { table_name: 'payload_locked_documents_rels', column_name: 'articles_id' },
            ] as unknown as T[],
          }
        }
        return { rows: [] as T[] }
      },
    }

    const unpooledSummary = await applyPhase1DatabaseOptimizations(mockExecutor, {
      concurrent: true,
    })
    expect(unpooledSummary.concurrent).toBe(true)
    expect(unpooledSummary.createdIndexes).toContain('header_texts_parent_path_order_idx')
    expect(unpooledSummary.createdIndexes).toContain('mail_threads_counts_cover_idx')
    expect(unpooledSummary.createdIndexes).toContain('payload_locked_documents_rels_articles_id_idx')
    expect(unpooledSummary.droppedIndexes).toContain('idx_articles_public_feed')
    expect(unpooledSummary.droppedIndexes).toContain('idx_pld_rels_articles_nn')
    expect(
      ranStatements.some((s) => s.startsWith('CREATE INDEX CONCURRENTLY IF NOT EXISTS')),
    ).toBe(true)

    const pooledRepairResult = await runDatabaseRepairAction(
      { config: { collections: [] } } as unknown as Payload,
      'apply-neon-optimizations',
      {
        directRunner: async (fn) =>
          fn(mockExecutor, {
            usedUnpooledConnection: false,
            diagnostics: {
              configured: true,
              hostKind: 'neon',
              providerLabel: 'Neon',
              host: 'ep-test-pooler.neon.tech',
              database: 'neondb',
              pooled: true,
              hasUnpooledUrl: false,
              sslMode: 'verify-full',
              neonEndpointId: 'ep-test',
              supabaseProjectRef: null,
              advisoryNote: null,
            },
          }),
      },
    )
    expect(pooledRepairResult.ok).toBe(true)
    expect(pooledRepairResult.usedUnpooledConnection).toBe(false)
    expect(pooledRepairResult.summary).toContain('transactional-safe')
  })

  it('normalizes sslmode and recovers from Windows EAI_AGAIN DNS errors via IPv4 / DoH fallback', async () => {
    const {
      loadVercelPool,
      normalizeMigrationPostgresUrl,
    } = await import('../../scripts/migrate-neon.mjs')
    expect(typeof loadVercelPool()).toBe('function')
    expect(
      normalizeMigrationPostgresUrl(
        'postgresql://u:p@ep-test.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require',
      ),
    ).toBe('postgresql://u:p@ep-test.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full')
    expect(
      normalizeMigrationPostgresUrl(
        'postgresql://u:p@ep-test.c-5.eu-central-1.aws.neon.tech/neondb?uselibpqcompat=true&sslmode=require',
      ),
    ).toBe(
      'postgresql://u:p@ep-test.c-5.eu-central-1.aws.neon.tech/neondb?uselibpqcompat=true&sslmode=require',
    )

    // 1. OS dual-stack EAI_AGAIN recovered by OS IPv4-only retry (`family: 4`)
    const recoveredViaOsV4 = await fallbackResolveHost(
      'ep-osv4.c-5.eu-central-1.aws.neon.tech',
      (_host, opts, cb) => {
        if (opts.family === 4) {
          cb(null, [{ address: '18.192.10.20', family: 4 }])
        } else {
          const e: NodeJS.ErrnoException = new Error('getaddrinfo EAI_AGAIN')
          e.code = 'EAI_AGAIN'
          cb(e, '')
        }
      },
      { bypassCache: true, disablePublicUdp: true },
    )
    expect(recoveredViaOsV4).toEqual([{ address: '18.192.10.20', family: 4 }])

    // 2. Total OS + UDP DNS failure recovered via DNS-over-HTTPS (DoH 443)
    const mockDohFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [
            { type: 5, data: 'c-5.eu-central-1.aws.neon.tech.' },
            { type: 1, data: '3.125.44.88' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/dns-json' } },
      ),
    ) as unknown as typeof fetch

    const recoveredViaDoh = await fallbackResolveHost(
      'ep-doh.c-5.eu-central-1.aws.neon.tech',
      (_host, _opts, cb) => {
        const e: NodeJS.ErrnoException = new Error('getaddrinfo EAI_AGAIN')
        e.code = 'EAI_AGAIN'
        cb(e, '')
      },
      { bypassCache: true, disablePublicUdp: true, fetchImpl: mockDohFetch },
    )
    expect(recoveredViaDoh).toEqual([{ address: '3.125.44.88', family: 4 }])

    // 3. Deleted Neon endpoint (`Status: 3` NXDOMAIN) surfaces ENOTFOUND immediately
    const nxDomainFetch = vi.fn(async () =>
      new Response(JSON.stringify({ Status: 3 }), { status: 200 }),
    ) as unknown as typeof fetch
    await expect(
      resolveIPv4ViaDoH('ep-deleted.c-5.eu-central-1.aws.neon.tech', nxDomainFetch),
    ).rejects.toMatchObject({ code: 'ENOTFOUND' })
  })

  it('prevents @neondatabase/serverless + ws ErrorEvent readonly-message TypeError on connection timeout, avoids CJS require.resolve on ESM @payloadcms/db-vercel-postgres, and serves POCMS_DNS_PREWARM fast-path', async () => {
    // Regression guard: `src/lib/nodeDnsFallback.ts` must never contain a static CommonJS
    // `require.resolve('@payloadcms/db-vercel-postgres')` / `require('@payloadcms/db-vercel-postgres')`
    // call, which triggers Next.js 16 Turbopack's `"Package @payloadcms/db-vercel-postgres can't be external"`
    // warning in `pnpm dev` (`serverExternalPackages`).
    const dnsFallbackSource = fs
      .readFileSync(path.join(process.cwd(), 'src', 'lib', 'nodeDnsFallback.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(dnsFallbackSource).not.toMatch(/\bresolve\(\s*['"]@payloadcms\/db-vercel-postgres['"]\s*\)/)
    expect(dnsFallbackSource).not.toMatch(/\brequire\(\s*['"]@payloadcms\/db-vercel-postgres['"]\s*\)/)

    installNodeDnsFallback()
    installNeonWebSocketErrorEventFix()

    // 1. Prewarmed DNS cache entry resolves via fast-path without hitting OS DNS
    loadDnsPrewarmEnv('ep-prewarm-test.c-5.eu-central-1.aws.neon.tech=18.192.55.77')
    const prewarmed = await dns.promises.lookup('ep-prewarm-test.c-5.eu-central-1.aws.neon.tech')
    expect(prewarmed).toEqual({ address: '18.192.55.77', family: 4 })

    // 2. Stalled WebSocket handshake hitting `connectionTimeoutMillis` rejects cleanly with a mutable
    // `Error` ("Connection terminated due to connection timeout") instead of crashing Node 24 with
    // `TypeError: Cannot set property message of #<ErrorEvent> which has only a getter`.
    const dbPkgJsonPath = fs.realpathSync(
      path.join(process.cwd(), 'node_modules', '@payloadcms', 'db-vercel-postgres', 'package.json'),
    )
    const dbReq = createRequire(dbPkgJsonPath)
    const vpReq = createRequire(dbReq.resolve('@vercel/postgres'))
    const { VercelPool } = vpReq('@vercel/postgres') as {
      VercelPool: new (opts: Record<string, unknown>) => {
        query: (sql: string) => Promise<unknown>
        end: () => Promise<void>
      }
    }
    const { neonConfig } = vpReq('@neondatabase/serverless') as {
      neonConfig: {
        wsProxy?: (host: string) => string
        useSecureWebSocket?: boolean
      }
    }

    const prevWsProxy = neonConfig.wsProxy
    const prevSecure = neonConfig.useSecureWebSocket
    const sockets = new Set<net.Socket>()
    const stallServer = net.createServer((socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
    })

    await new Promise<void>((resolve) => stallServer.listen(0, '127.0.0.1', () => resolve()))
    const port = (stallServer.address() as net.AddressInfo).port

    try {
      neonConfig.wsProxy = () => `127.0.0.1:${port}/v2`
      neonConfig.useSecureWebSocket = false

      const pool = new VercelPool({
        connectionString:
          'postgresql://u:p@ep-stall.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full',
        connectionTimeoutMillis: 45,
        max: 1,
      })

      try {
        await expect(pool.query('SELECT 1')).rejects.toThrow(
          /Connection terminated due to connection timeout/,
        )
      } finally {
        await pool.end().catch(() => undefined)
      }
    } finally {
      neonConfig.wsProxy = prevWsProxy
      neonConfig.useSecureWebSocket = prevSecure
      for (const s of sockets) s.destroy()
      await new Promise<void>((resolve) => stallServer.close(() => resolve()))
    }
  })
})
