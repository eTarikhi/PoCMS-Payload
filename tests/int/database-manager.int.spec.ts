import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NeonClient } from '@neon/sdk'
import type { Payload, PayloadRequest } from 'payload'

vi.mock('@payloadcms/ui', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import config from '@/payload.config'
import { CAPABILITIES, NO_PERMISSIONS, type EffectivePermissions } from '@/access/permissions'
import { NavExtraLinks } from '@/components/admin/nav/NavExtraLinks'
import { DatabaseClient } from '@/components/admin/views/Database/DatabaseClient'
import { DatabaseHealthSummaryView } from '@/components/admin/widgets/DatabaseHealth'
import {
  assertSafeBackupPathname,
  exportFormattedDatabaseBackup,
  exportLogicalBackupArchive,
  saveEncryptedBackupToVault,
  type BlobVaultDriver,
} from '@/plugins/databaseManager/core/backup'
import {
  generateMigrationFromDatabase,
  generateSeedFromDatabase,
} from '@/plugins/databaseManager/core/codegen'
import { quoteIdent, type DirectClientRunner, type SqlExecutor } from '@/plugins/databaseManager/core/connection'
import {
  packBackupDocument,
  packLogicalBackup,
  unpackBackupDocument,
  unpackLogicalBackup,
} from '@/plugins/databaseManager/core/crypto'
import {
  analyzeSqlRestoreStatements,
  parseCsvRecords,
  parseNdjsonToArchive,
  serializeArchiveToNdjson,
  serializeArchiveToSql,
  serializeTableToCsv,
  splitSqlStatements,
} from '@/plugins/databaseManager/core/formats'
import { collectCorePostgresHealth } from '@/plugins/databaseManager/core/monitor'
import { executeReadOnlyDiagnosticQuery } from '@/plugins/databaseManager/core/queryRunner'
import { runDatabaseRepairAction } from '@/plugins/databaseManager/core/repair'
import { dryRunLogicalRestore, executeLogicalRestore } from '@/plugins/databaseManager/core/restore'
import { createDatabaseManagementEndpoints } from '@/plugins/databaseManager/endpoints'
import { createNeonProviderAdapter } from '@/plugins/databaseManager/providers/neon'
import { prismaPostgresProviderAdapter } from '@/plugins/databaseManager/providers/prismaPostgres'
import { supabaseProviderAdapter } from '@/plugins/databaseManager/providers/supabase'
import {
  classifyDatabaseHealth,
  extractNeonEndpointIdFromHost,
  extractSupabaseProjectRefFromHost,
  formatBytes,
  parsePostgresDiagnostics,
  topologicalSortTables,
} from '@/plugins/databaseManager/shared'
import { collectDatabaseManagementSnapshot } from '@/plugins/databaseManager/snapshot'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const userWithCapabilities = (
  capabilities: EffectivePermissions['capabilities'],
  fullAccess = false,
) => ({
  id: 1,
  name: 'Admin User',
  email: 'admin@vtarikhi.com',
  permissions: {
    ...NO_PERMISSIONS,
    fullAccess,
    roles: fullAccess ? ['Administrator'] : ['DBA'],
    capabilities,
  },
})

/**
 * Stateful in-memory SQL mock emulating PostgreSQL system catalogs (`pg_stat_database`,
 * `pg_stat_user_tables`, `pg_sequences`, `information_schema.*`) + public user tables.
 */
function createMockPostgresCatalog() {
  const executedSql: Array<{ text: string; values?: unknown[] }> = []
  let failOnInsertInto: string | null = null

  const state = {
    sequences: new Map<string, number>([
      ['media_id_seq', 2],
      ['articles_id_seq', 1], // Intentionally behind MAX(id)=5 to test drift detection!
    ]),
    rows: new Map<string, Array<Record<string, unknown>>>([
      [
        'media',
        [
          { id: 1, filename: 'hero.png' },
          { id: 2, filename: 'diagram.png' },
        ],
      ],
      [
        'articles',
        [
          {
            id: 5,
            title: 'Serverless Backups',
            featured_image_id: 2,
            parent_id: null,
            content: [{ type: 'p', children: [{ text: 'Hello' }] }],
          },
          {
            id: 6,
            title: 'Child Follow-up',
            featured_image_id: 1,
            parent_id: 5,
            content: [{ type: 'p', children: [{ text: 'Nested' }] }],
          },
        ],
      ],
      [
        'users',
        [
          {
            id: 1,
            email: 'admin@vtarikhi.com',
            hash: 'secret_pbkdf2_hash_hex',
            salt: 'secret_salt_hex',
          },
        ],
      ],
      ['payload_migrations', [{ id: 1, name: '20261026_001_init', batch: 1 }]],
      ['payload_locked_documents', [{ id: 99 }]],
    ]),
  }

  const executor: SqlExecutor = {
    async query<T extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) {
      const normalized = text.replace(/\s+/g, ' ').trim()
      executedSql.push({ text: normalized, values })

      if (normalized.includes('FROM pg_stat_database')) {
        return {
          rows: [
            {
              server_version: 'PostgreSQL 17.2 on x86_64-pc-linux-gnu, compiled by gcc',
              db_size_bytes: 25_165_824,
              xact_commit: 1420,
              xact_rollback: 3,
              deadlocks: 0,
              stats_reset: '2026-10-01T00:00:00.000Z',
              cache_hit_ratio: 99.42,
              max_connections: 100,
            },
          ] as unknown as T[],
        }
      }

      if (normalized.includes('FROM pg_stat_activity')) {
        return {
          rows: [{ total: 6, active: 2, idle: 4, idle_in_tx: 0 }] as unknown as T[],
        }
      }

      if (normalized.includes('FROM pg_stat_user_tables')) {
        return {
          rows: [
            {
              table_name: 'articles',
              live_rows: 200,
              dead_tuples: 120,
              table_bytes: 1_048_576,
              index_bytes: 262_144,
              total_bytes: 1_310_720,
              seq_scans: 12,
              idx_scans: 540,
              last_vacuum: null,
              last_autovacuum: '2026-10-25T10:00:00.000Z',
              last_analyze: null,
              last_autoanalyze: '2026-10-25T10:00:00.000Z',
            },
            {
              table_name: 'media',
              live_rows: 25,
              dead_tuples: 2,
              table_bytes: 131_072,
              index_bytes: 65_536,
              total_bytes: 196_608,
              seq_scans: 3,
              idx_scans: 180,
              last_vacuum: null,
              last_autovacuum: null,
              last_analyze: null,
              last_autoanalyze: null,
            },
            {
              table_name: 'payload_migrations',
              live_rows: 1,
              dead_tuples: 0,
              table_bytes: 16_384,
              index_bytes: 16_384,
              total_bytes: 32_768,
              seq_scans: 1,
              idx_scans: 5,
              last_vacuum: null,
              last_autovacuum: null,
              last_analyze: null,
              last_autoanalyze: null,
            },
            {
              table_name: 'payload_locked_documents',
              live_rows: 1,
              dead_tuples: 0,
              table_bytes: 8192,
              index_bytes: 8192,
              total_bytes: 16_384,
              seq_scans: 1,
              idx_scans: 1,
              last_vacuum: null,
              last_autovacuum: null,
              last_analyze: null,
              last_autoanalyze: null,
            },
          ] as unknown as T[],
        }
      }

      if (normalized.includes('JOIN pg_sequences')) {
        return {
          rows: [
            {
              table_name: 'articles',
              column_name: 'id',
              seq_qualified: 'public.articles_id_seq',
              seq_name: 'articles_id_seq',
              last_value: state.sequences.get('articles_id_seq') ?? 1,
            },
            {
              table_name: 'media',
              column_name: 'id',
              seq_qualified: 'public.media_id_seq',
              seq_name: 'media_id_seq',
              last_value: state.sequences.get('media_id_seq') ?? 1,
            },
          ] as unknown as T[],
        }
      }

      const maxMatch = /^SELECT COALESCE\(MAX\("id"\), 0\)::bigint AS max_id FROM public\."([^"]+)"$/.exec(
        normalized,
      )
      if (maxMatch) {
        const tblRows = state.rows.get(maxMatch[1]!) ?? []
        const maxId = tblRows.reduce(
          (acc, r) => Math.max(acc, typeof r.id === 'number' ? r.id : 0),
          0,
        )
        return { rows: [{ max_id: maxId }] as unknown as T[] }
      }

      if (normalized.startsWith('SELECT setval(')) {
        const seqArg = String(values?.[0] ?? '')
        const cleanSeq = seqArg.replace(/^public\./, '').replace(/"/g, '')
        const nextVal = Number(values?.[1] ?? 1)
        state.sequences.set(cleanSeq, nextVal)
        return { rows: [{ setval: nextVal }] as unknown as T[] }
      }

      if (normalized.includes('FROM information_schema.tables')) {
        return {
          rows: [...state.rows.keys()].sort().map((table_name) => ({ table_name })) as unknown as T[],
        }
      }

      if (normalized.includes('FROM information_schema.columns')) {
        return {
          rows: [
            { table_name: 'media', column_name: 'id', data_type: 'integer', udt_name: 'int4', is_nullable: 'NO' },
            { table_name: 'media', column_name: 'filename', data_type: 'text', udt_name: 'text', is_nullable: 'NO' },
            { table_name: 'articles', column_name: 'id', data_type: 'integer', udt_name: 'int4', is_nullable: 'NO' },
            { table_name: 'articles', column_name: 'title', data_type: 'text', udt_name: 'text', is_nullable: 'NO' },
            { table_name: 'articles', column_name: 'featured_image_id', data_type: 'integer', udt_name: 'int4', is_nullable: 'YES' },
            { table_name: 'articles', column_name: 'parent_id', data_type: 'integer', udt_name: 'int4', is_nullable: 'YES' },
            { table_name: 'articles', column_name: 'content', data_type: 'jsonb', udt_name: 'jsonb', is_nullable: 'YES' },
            { table_name: 'users', column_name: 'id', data_type: 'integer', udt_name: 'int4', is_nullable: 'NO' },
            { table_name: 'users', column_name: 'email', data_type: 'text', udt_name: 'text', is_nullable: 'NO' },
            { table_name: 'users', column_name: 'hash', data_type: 'text', udt_name: 'text', is_nullable: 'YES' },
            { table_name: 'users', column_name: 'salt', data_type: 'text', udt_name: 'text', is_nullable: 'YES' },
            { table_name: 'payload_migrations', column_name: 'id', data_type: 'integer', udt_name: 'int4', is_nullable: 'NO' },
            { table_name: 'payload_migrations', column_name: 'name', data_type: 'text', udt_name: 'text', is_nullable: 'NO' },
            { table_name: 'payload_migrations', column_name: 'batch', data_type: 'integer', udt_name: 'int4', is_nullable: 'YES' },
          ] as unknown as T[],
        }
      }

      if (normalized.includes("tc.constraint_type = 'PRIMARY KEY'")) {
        const allPks = [
          { table_name: 'media', column_name: 'id' },
          { table_name: 'articles', column_name: 'id' },
          { table_name: 'users', column_name: 'id' },
          { table_name: 'payload_migrations', column_name: 'id' },
        ]
        if (normalized.includes('tc.table_name = $1') && values?.[0]) {
          return {
            rows: allPks.filter((p) => p.table_name === values[0]) as unknown as T[],
          }
        }
        return { rows: allPks as unknown as T[] }
      }

      if (normalized.includes('FROM pg_constraint c') && normalized.includes("c.contype = 'f'")) {
        return {
          rows: [
            {
              constraint_name: 'articles_featured_image_id_fk',
              table_name: 'articles',
              column_name: 'featured_image_id',
              ref_table: 'media',
              row_estimate: 120,
            },
          ] as unknown as T[],
        }
      }

      if (normalized.startsWith('EXPLAIN ')) {
        return {
          rows: [{ 'QUERY PLAN': 'Seq Scan on articles  (cost=0.00..12.40 rows=240 width=64)' }] as unknown as T[],
        }
      }

      if (normalized.includes("tc.constraint_type = 'FOREIGN KEY'")) {
        return {
          rows: [
            {
              table_name: 'articles',
              column_name: 'featured_image_id',
              ref_table: 'media',
              ref_column: 'id',
            },
            {
              table_name: 'articles',
              column_name: 'parent_id',
              ref_table: 'articles',
              ref_column: 'id',
            },
          ] as unknown as T[],
        }
      }

      if (normalized === 'SELECT version() AS version') {
        return { rows: [{ version: 'PostgreSQL 17.2' }] as unknown as T[] }
      }

      if (
        normalized.includes('FROM public."payload_migrations"') &&
        normalized.includes('COUNT(*)')
      ) {
        return {
          rows: [{ count: 1, latest: '20261026_001_init' }] as unknown as T[],
        }
      }

      if (normalized === 'SELECT name FROM public."payload_migrations" ORDER BY created_at ASC') {
        return {
          rows: [{ name: '20261026_001_init' }] as unknown as T[],
        }
      }

      if (
        normalized.includes('FROM public."payload_locked_documents"') &&
        normalized.startsWith('SELECT COUNT(*)')
      ) {
        return {
          rows: [{ cnt: state.rows.get('payload_locked_documents')?.length ?? 0 }] as unknown as T[],
        }
      }

      if (normalized.startsWith('DELETE FROM public."payload_locked_documents"')) {
        const prev = state.rows.get('payload_locked_documents') ?? []
        state.rows.set('payload_locked_documents', [])
        return { rows: prev as unknown as T[] }
      }

      const selectAllMatch = /^SELECT \* FROM public\."([^"]+)"/.exec(normalized)
      if (selectAllMatch) {
        return {
          rows: (state.rows.get(selectAllMatch[1]!) ?? []) as unknown as T[],
        }
      }

      if (normalized.startsWith('SELECT pg_try_advisory_xact_lock')) {
        return { rows: [{ locked: true }] as unknown as T[] }
      }

      if (normalized.startsWith('INSERT INTO public."')) {
        const tblMatch = /^INSERT INTO public\."([^"]+)"/.exec(normalized)
        if (tblMatch && failOnInsertInto && tblMatch[1] === failOnInsertInto) {
          throw new Error(`Simulated constraint failure on ${failOnInsertInto}`)
        }
        return { rows: [] }
      }

      return { rows: [] }
    },
  }

  const directRunner: DirectClientRunner = async (fn) =>
    fn(executor, {
      usedUnpooledConnection: true,
      diagnostics: parsePostgresDiagnostics(
        'postgresql://user:pw@ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech/pocms',
        'postgresql://user:pw@ep-cool-morning-a2bc.eu-central-1.aws.neon.tech/pocms',
      ),
    })

  return {
    executor,
    directRunner,
    executedSql,
    state,
    setFailOnInsert(table: string | null) {
      failOnInsertInto = table
    },
  }
}

describe('Database Management Plugin — Architecture, RBAC & Turbopack Isolation', () => {
  it('keeps shared.ts and DatabaseClient.tsx completely free of server-only imports', () => {
    const sharedSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/plugins/databaseManager/shared.ts'),
      'utf8',
    )
    const clientSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/admin/views/Database/DatabaseClient.tsx'),
      'utf8',
    )

    for (const src of [sharedSrc, clientSrc]) {
      expect(src).not.toMatch(/from\s+['"]next\/cache['"]/)
      expect(src).not.toMatch(/from\s+['"]node:/)
      expect(src).not.toMatch(/from\s+['"]pg['"]/)
      expect(src).not.toMatch(/from\s+['"]@neon\/sdk['"]/)
      expect(src).not.toMatch(/from\s+['"]@vercel\/blob['"]/)
    }
  })

  it('registers manageDatabase capability, /admin/database view, widget, nav link, and RBAC-guarded endpoints', async () => {
    expect(CAPABILITIES.some((c) => c.name === 'manageDatabase')).toBe(true)

    const sanitized = await config
    expect(sanitized.admin.components?.views?.database).toBeDefined()
    expect(sanitized.admin.components?.views?.database?.path).toBe('/database')
    expect(
      sanitized.admin.dashboard?.widgets.some((w) => w.slug === 'database-health'),
    ).toBe(true)

    // Sidebar link only renders when user holds `manageDatabase`
    const { container: withoutCap } = render(
      React.createElement(NavExtraLinks, {
        payload: { config: sanitized },
        user: userWithCapabilities(['viewSystem']),
      } as never),
    )
    expect(withoutCap.querySelector('#nav-database')).toBeNull()
    cleanup()

    const { container: withCap } = render(
      React.createElement(NavExtraLinks, {
        payload: { config: sanitized },
        user: userWithCapabilities(['manageDatabase']),
      } as never),
    )
    expect(withCap.querySelector('#nav-database')).not.toBeNull()
    cleanup()

    // Endpoints reject unauthorized callers with 403
    const endpoints = createDatabaseManagementEndpoints()
    for (const ep of endpoints) {
      const res = await ep.handler({
        user: userWithCapabilities(['viewSystem']),
      } as unknown as PayloadRequest)
      expect(res.status).toBe(403)
    }
  })

  it('parses Neon, Supabase, and Prisma connection diagnostics without leaking secrets and hardens quoteIdent', () => {
    expect(
      extractNeonEndpointIdFromHost('ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech'),
    ).toBe('ep-cool-morning-a2bc')
    expect(
      extractNeonEndpointIdFromHost('ep-cool-morning-a2bc.eu-central-1.aws.neon.tech'),
    ).toBe('ep-cool-morning-a2bc')
    expect(extractSupabaseProjectRefFromHost('db.xyzprojectref.supabase.co')).toBe(
      'xyzprojectref',
    )
    expect(
      extractSupabaseProjectRefFromHost('aws-0-eu-central-1.pooler.supabase.com', 'postgres.suparef99'),
    ).toBe('suparef99')

    const pooledOnly = parsePostgresDiagnostics(
      'postgresql://neondb_owner:top_secret_pw@ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech/pocms?sslmode=require',
    )
    expect(pooledOnly.hostKind).toBe('neon')
    expect(pooledOnly.pooled).toBe(true)
    expect(pooledOnly.hasUnpooledUrl).toBe(false)
    expect(pooledOnly.neonEndpointId).toBe('ep-cool-morning-a2bc')
    expect(pooledOnly.advisoryNote).toContain('POSTGRES_URL_NON_POOLING')
    expect(JSON.stringify(pooledOnly)).not.toContain('top_secret_pw')

    expect(quoteIdent('articles_rels')).toBe('"articles_rels"')
    expect(() => quoteIdent('articles"; DROP TABLE users; --')).toThrow()
    expect(formatBytes(1_048_576)).toBe('1.0 MB')
  })
})

describe('Phase 1 (Pilot Tier): Core PostgreSQL Monitoring, Backup, Encryption, Restore & Repair', () => {
  it('monitors PostgreSQL vitals, detects sequence drift & bloat, and repairs sequences, locks, and VACUUM over unpooled connection', async () => {
    const mockDb = createMockPostgresCatalog()
    const sanitized = await config
    const fakePayload = { config: sanitized, db: {} } as unknown as Payload

    const core = await collectCorePostgresHealth(fakePayload, {
      executor: mockDb.executor,
      env: {
        NODE_ENV: 'test',
        POSTGRES_URL: 'postgresql://u:p@ep-cool-a1-pooler.eu-central-1.aws.neon.tech/pocms',
        POSTGRES_URL_NON_POOLING: 'postgresql://u:p@ep-cool-a1.eu-central-1.aws.neon.tech/pocms',
      },
    })

    expect(core.vitals.status).toBe('connected')
    expect(core.vitals.cacheHitRatio).toBe(99.42)
    expect(core.vitals.connections?.active).toBe(2)
    expect(core.hygiene.outOfSyncSequencesCount).toBe(1) // articles_id_seq (1 < 6)
    expect(core.hygiene.bloatedTablesCount).toBe(1) // articles (120 / 320 = 37.5%)
    expect(core.hygiene.staleLocksCount).toBe(1)

    const classified = classifyDatabaseHealth(core.vitals, core.hygiene)
    expect(classified.tone).toBe('poor')
    expect(classified.label).toBe('Sequence drift')

    // Repair 1: Sync sequences fixes articles_id_seq -> 6
    const syncRes = await runDatabaseRepairAction(fakePayload, 'sync-sequences', {
      executor: mockDb.executor,
    })
    expect(syncRes.ok).toBe(true)
    expect(mockDb.state.sequences.get('articles_id_seq')).toBe(6)

    // Repair 2: VACUUM (ANALYZE) runs outside transaction via direct unpooled runner
    const vacRes = await runDatabaseRepairAction(fakePayload, 'vacuum-analyze', {
      directRunner: mockDb.directRunner,
      tableName: 'articles',
    })
    expect(vacRes.ok).toBe(true)
    expect(vacRes.usedUnpooledConnection).toBe(true)
    expect(
      mockDb.executedSql.some((q) => q.text === 'VACUUM (ANALYZE) public."articles"'),
    ).toBe(true)

    // Repair 3: Clear stale locks
    const lockRes = await runDatabaseRepairAction(fakePayload, 'clear-stale-locks', {
      executor: mockDb.executor,
    })
    expect(lockRes.details.cleared).toBe(1)
  })

  it('exports pure-TS logical backups, encrypts with AES-256-GCM, stores & prunes in Vercel Blob, and enforces path safety', async () => {
    const mockDb = createMockPostgresCatalog()

    // Unredacted + AES-256-GCM encrypted round-trip
    const archive = await exportLogicalBackupArchive(mockDb.executor, {
      redactSecrets: false,
      databaseName: 'pocms',
    })
    expect(archive.tables.map((t) => t.name)).toEqual([
      'articles',
      'media',
      'payload_migrations',
      'users',
    ]) // payload_locked_documents excluded automatically!
    const usersDump = archive.tables.find((t) => t.name === 'users')!
    expect(usersDump.rows[0]?.hash).toBe('secret_pbkdf2_hash_hex')

    const packed = packLogicalBackup(archive, {
      compress: true,
      encryptionSecret: 'super-secret-backup-key-2026',
    })
    expect(packed.encrypted).toBe(true)
    expect(packed.bytes.toString('utf8')).not.toContain('Serverless Backups')

    // Wrong key fails GCM authentication tag check
    expect(() =>
      unpackLogicalBackup(packed.bytes, { encryptionSecret: 'wrong-secret-key!!' }),
    ).toThrow(/Failed to decrypt/)

    const unpacked = unpackLogicalBackup(packed.bytes, {
      encryptionSecret: 'super-secret-backup-key-2026',
    })
    expect(unpacked.encrypted).toBe(true)
    expect(unpacked.checksumVerified).toBe(true)
    expect(unpacked.archive.tables.length).toBe(4)

    // Secret redaction mode strips user password hashes
    const redacted = await exportLogicalBackupArchive(mockDb.executor, {
      redactSecrets: true,
    })
    expect(redacted.tables.find((t) => t.name === 'users')?.rows[0]?.hash).toBeNull()

    // Cloud Vault upload + retention pruning
    const storedBlobs: Array<{
      url: string
      downloadUrl: string
      pathname: string
      size: number
      uploadedAt: Date
      bytes: Buffer
    }> = []

    const mockBlobDriver: BlobVaultDriver = {
      async list({ prefix }) {
        return {
          blobs: storedBlobs.filter((b) => b.pathname.startsWith(prefix)),
        }
      },
      async put(pathname, body) {
        const item = {
          url: `https://blob.vercel-storage.com/${pathname}`,
          downloadUrl: `https://blob.vercel-storage.com/${pathname}?download=1`,
          pathname,
          size: body.length,
          uploadedAt: new Date(Date.now() + storedBlobs.length * 1000),
          bytes: body,
        }
        storedBlobs.push(item)
        return item
      },
      async del(urls) {
        const set = new Set(Array.isArray(urls) ? urls : [urls])
        for (let i = storedBlobs.length - 1; i >= 0; i--) {
          if (set.has(storedBlobs[i]!.url)) storedBlobs.splice(i, 1)
        }
      },
      async readBytes(pathname) {
        const hit = storedBlobs.find((b) => b.pathname === pathname)
        if (!hit) throw new Error('Not found')
        return hit.bytes
      },
    }

    const vaultEnv = {
      NODE_ENV: 'test' as const,
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test_token',
      PAYLOAD_SECRET: 'test-payload-secret-12345',
    }

    await saveEncryptedBackupToVault(mockDb.executor, {
      env: vaultEnv,
      driver: mockBlobDriver,
      retentionCount: 2,
      label: 'first',
    })
    await saveEncryptedBackupToVault(mockDb.executor, {
      env: vaultEnv,
      driver: mockBlobDriver,
      retentionCount: 2,
      label: 'second',
    })
    const third = await saveEncryptedBackupToVault(mockDb.executor, {
      env: vaultEnv,
      driver: mockBlobDriver,
      retentionCount: 2,
      label: 'third',
    })

    expect(third.prunedCount).toBe(1)
    expect(storedBlobs.length).toBe(2)

    expect(() => assertSafeBackupPathname('../etc/passwd')).toThrow()
    expect(() => assertSafeBackupPathname('media/avatar.png')).toThrow()
  })

  it('orders foreign keys topologically, validates dry-runs, restores transactionally with jsonb serialization, and rolls back cleanly on error', async () => {
    const sorted = topologicalSortTables([
      { name: 'articles', foreignKeys: [{ refTable: 'media' }, { refTable: 'articles' }] },
      { name: 'media', foreignKeys: [] },
    ])
    expect(sorted.ordered).toEqual(['media', 'articles'])
    expect(sorted.cyclicTables).toEqual([])

    const mockDb = createMockPostgresCatalog()
    const sanitized = await config
    const fakePayload = { config: sanitized, db: {} } as unknown as Payload
    const env = {
      NODE_ENV: 'test' as const,
      PAYLOAD_SECRET: 'restore-secret-key-2026',
    }

    const archive = await exportLogicalBackupArchive(mockDb.executor)
    const packed = packLogicalBackup(archive, {
      compress: true,
      encryptionSecret: env.PAYLOAD_SECRET,
    })

    // Dry run performs zero writes
    const sqlCountBefore = mockDb.executedSql.length
    const dryRun = await dryRunLogicalRestore(mockDb.executor, packed.bytes, { env })
    expect(dryRun.valid).toBe(true)
    expect(dryRun.encrypted).toBe(true)
    expect(dryRun.checksumVerified).toBe(true)
    expect(dryRun.insertOrder).toContain('media')
    expect(dryRun.insertOrder.indexOf('media')).toBeLessThan(
      dryRun.insertOrder.indexOf('articles'),
    )
    expect(
      mockDb.executedSql
        .slice(sqlCountBefore)
        .some((q) => q.text.startsWith('TRUNCATE') || q.text.startsWith('INSERT')),
    ).toBe(false)

    // Transactional restore succeeds + triggers pre-restore safety snapshot callback
    const safetySnapSpy = vi.fn().mockResolvedValue({
      id: 'snap_pre_restore_1',
      name: 'pre-restore-safety-oct26',
    })

    const restored = await executeLogicalRestore(fakePayload, packed.bytes, {
      env,
      directRunner: mockDb.directRunner,
      onBeforeRestoreSafetySnapshot: safetySnapSpy,
    })

    expect(restored.ok).toBe(true)
    expect(restored.safetySnapshotId).toBe('snap_pre_restore_1')
    expect(safetySnapSpy).toHaveBeenCalledTimes(1)

    const txQueries = mockDb.executedSql.map((q) => q.text)
    expect(txQueries).toContain('BEGIN')
    expect(txQueries).toContain('COMMIT')
    // Verify jsonb array column `content` was JSON-stringified rather than passed as raw JS array
    const articleInsert = mockDb.executedSql.find((q) =>
      q.text.startsWith('INSERT INTO public."articles"'),
    )
    expect(articleInsert).toBeDefined()
    expect(articleInsert?.values?.some((v) => typeof v === 'string' && v.startsWith('['))).toBe(
      true,
    )

    // Simulated mid-transaction failure rolls back completely!
    mockDb.executedSql.length = 0
    mockDb.setFailOnInsert('articles')
    await expect(
      executeLogicalRestore(fakePayload, packed.bytes, {
        env,
        directRunner: mockDb.directRunner,
      }),
    ).rejects.toThrow(/Simulated constraint failure on articles/)
    expect(mockDb.executedSql.map((q) => q.text)).toContain('ROLLBACK')
    expect(mockDb.executedSql.map((q) => q.text)).not.toContain('COMMIT')
  })
})

describe('Phase 2 (Advanced Tier): Pluggable Serverless Provider Adapters & Admin UI', () => {
  it('auto-discovers Neon project/branch/endpoint via @neon/sdk, manages snapshots/branches/compute, blocks deleting default branch, and degrades cleanly without keys', async () => {
    const neonConn = parsePostgresDiagnostics(
      'postgresql://neondb_owner:pw@ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech/pocms',
      'postgresql://neondb_owner:pw@ep-cool-morning-a2bc.eu-central-1.aws.neon.tech/pocms',
    )

    // 1. Without API keys, Neon / Supabase / Prisma adapters return clean `not-configured` results
    const unconfiguredNeon = await createNeonProviderAdapter().getStatus(neonConn, {
      NODE_ENV: 'test',
    })
    expect(unconfiguredNeon.detectedFromHost).toBe(true)
    expect(unconfiguredNeon.result).toEqual({
      status: 'not-configured',
      missing: ['NEON_API_KEY'],
    })

    const unconfiguredSb = await supabaseProviderAdapter.getStatus(neonConn, {
      NODE_ENV: 'test',
    })
    expect(unconfiguredSb.result.status).toBe('not-configured')

    const unconfiguredPrisma = await prismaPostgresProviderAdapter.getStatus(neonConn, {
      NODE_ENV: 'test',
    })
    expect(unconfiguredPrisma.result.status).toBe('not-configured')

    // 2. With NEON_API_KEY, adapter auto-matches `ep-cool-morning-a2bc` across projects!
    const snapshotCreateSpy = vi.fn().mockResolvedValue({
      data: {
        id: 'snap-900',
        name: 'manual-snap',
        source_branch_id: 'br-main-1',
        created_at: '2026-10-26T12:00:00Z',
        manual: true,
      },
      error: null,
    })
    const snapshotRestoreSpy = vi.fn().mockResolvedValue({
      data: {
        id: 'br-restored-901',
        name: 'restored-branch',
        parent_id: 'br-main-1',
        default: false,
        protected: false,
        current_state: 'ready',
        created_at: '2026-10-26T12:05:00Z',
      },
      error: null,
    })
    const branchCreateSpy = vi.fn().mockResolvedValue({
      data: {
        id: 'br-pitr-2',
        name: 'pitr-check',
        parent_id: 'br-main-1',
        default: false,
        protected: false,
        current_state: 'ready',
        expires_at: '2026-10-27T12:00:00Z',
        created_at: '2026-10-26T12:00:00Z',
      },
      error: null,
    })
    const branchDeleteSpy = vi.fn().mockResolvedValue({ data: undefined, error: null })
    const endpointRestartSpy = vi.fn().mockResolvedValue({
      data: {
        id: 'ep-cool-morning-a2bc',
        host: 'ep-cool-morning-a2bc.eu-central-1.aws.neon.tech',
        branch_id: 'br-main-1',
        type: 'read_write',
        current_state: 'active',
        autoscaling_limit_min_cu: 0.25,
        autoscaling_limit_max_cu: 2,
        region_id: 'aws-eu-central-1',
      },
      error: null,
    })

    const fakeNeonClient = {
      projects: {
        list: () => ({
          all: async () => ({
            data: [
              {
                id: 'proj-other-1',
                name: 'other-app',
                region_id: 'aws-us-east-1',
                pg_version: 16,
              },
              {
                id: 'proj-pocms-2',
                name: 'pocms-production',
                region_id: 'aws-eu-central-1',
                pg_version: 17,
              },
            ],
            error: null,
          }),
        }),
      },
      branches: {
        list: () => ({
          all: async () => ({
            data: [
              {
                id: 'br-main-1',
                name: 'main',
                default: true,
                protected: true,
                current_state: 'ready',
                logical_size: 25_165_824,
                created_at: '2026-10-01T00:00:00Z',
              },
              {
                id: 'br-preview-2',
                name: 'preview-pr-42',
                parent_id: 'br-main-1',
                default: false,
                protected: false,
                current_state: 'ready',
                logical_size: 25_165_824,
                created_at: '2026-10-25T00:00:00Z',
              },
            ],
            error: null,
          }),
        }),
        get: async ({ branchId }: { branchId: string }) => ({
          data:
            branchId === 'br-main-1'
              ? { id: 'br-main-1', name: 'main', default: true, protected: true }
              : { id: branchId, name: 'preview-pr-42', default: false, protected: false },
          error: null,
        }),
        create: branchCreateSpy,
        delete: branchDeleteSpy,
      },
      snapshots: {
        list: async () => ({
          data: [
            {
              id: 'snap-existing-1',
              name: 'daily-auto',
              source_branch_id: 'br-main-1',
              created_at: '2026-10-26T00:00:00Z',
              manual: false,
            },
          ],
          error: null,
        }),
        create: snapshotCreateSpy,
        delete: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        restore: snapshotRestoreSpy,
      },
      postgres: {
        endpoints: {
          list: async ({ projectId }: { projectId: string }) => ({
            data:
              projectId === 'proj-pocms-2'
                ? [
                    {
                      id: 'ep-cool-morning-a2bc',
                      host: 'ep-cool-morning-a2bc.eu-central-1.aws.neon.tech',
                      branch_id: 'br-main-1',
                      type: 'read_write',
                      current_state: 'active',
                      autoscaling_limit_min_cu: 0.25,
                      autoscaling_limit_max_cu: 2,
                      region_id: 'aws-eu-central-1',
                    },
                  ]
                : [],
            error: null,
          }),
          start: endpointRestartSpy,
          suspend: endpointRestartSpy,
          restart: endpointRestartSpy,
        },
      },
    } as unknown as NeonClient

    const neonAdapter = createNeonProviderAdapter(() => fakeNeonClient)
    const envWithNeon = {
      NODE_ENV: 'test' as const,
      POSTGRES_URL:
        'postgresql://neondb_owner:pw@ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech/pocms',
      POSTGRES_URL_NON_POOLING:
        'postgresql://neondb_owner:pw@ep-cool-morning-a2bc.eu-central-1.aws.neon.tech/pocms',
      NEON_API_KEY: 'napi_test_key_123',
    }

    const status = await neonAdapter.getStatus(neonConn, envWithNeon)
    expect(status.result.status).toBe('ok')
    if (status.result.status !== 'ok') throw new Error('Expected ok')
    expect(status.result.data.projectId).toBe('proj-pocms-2')
    expect(status.result.data.autoDetectedProject).toBe(true)
    expect(status.result.data.activeBranchId).toBe('br-main-1')
    expect(status.result.data.snapshots.length).toBe(1)
    expect(status.result.data.branches.length).toBe(2)

    // Guardrail: cannot delete default/protected production branch!
    await expect(
      neonAdapter.deleteBranch!('br-main-1', neonConn, envWithNeon),
    ).rejects.toThrow(/default or protected/)
    expect(branchDeleteSpy).not.toHaveBeenCalled()

    // Non-protected branch deletes cleanly
    await neonAdapter.deleteBranch!('br-preview-2', neonConn, envWithNeon)
    expect(branchDeleteSpy).toHaveBeenCalledWith({
      projectId: 'proj-pocms-2',
      branchId: 'br-preview-2',
    })

    // Full end-to-end POST /api/admin-database dispatches provider actions + records AuditLogs
    const mockDb = createMockPostgresCatalog()
    const sanitized = await config
    const auditCreateSpy = vi.fn().mockResolvedValue({ id: 500 })
    const fakePayload = {
      config: sanitized,
      db: {},
      create: auditCreateSpy,
      logger: { error: vi.fn(), info: vi.fn() },
    } as unknown as Payload

    const endpoints = createDatabaseManagementEndpoints({
      executor: mockDb.executor,
      directRunner: mockDb.directRunner,
      adapters: [neonAdapter, supabaseProviderAdapter, prismaPostgresProviderAdapter],
      env: envWithNeon,
    })

    const postEp = endpoints.find((e) => e.path === '/admin-database' && e.method === 'post')!
    const snapRes = await postEp.handler({
      user: userWithCapabilities(['manageDatabase']),
      payload: fakePayload,
      headers: new Headers({ 'user-agent': 'Vitest' }),
      json: async () => ({
        action: 'provider-snapshot-create',
        provider: 'neon',
        name: 'pre-release',
        expiresInDays: 7,
      }),
    } as unknown as PayloadRequest)

    expect(snapRes.status).toBe(200)
    expect(snapshotCreateSpy).toHaveBeenCalledTimes(1)
    expect(auditCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'audit-logs',
        data: expect.objectContaining({
          action: 'backup',
          entityKind: 'database',
          entityType: 'neon-snapshot',
        }),
      }),
    )

    // Render Widget & Full Admin View across tabs
    const fullSnapshot = await collectDatabaseManagementSnapshot(fakePayload, {
      executor: mockDb.executor,
      adapters: [neonAdapter, supabaseProviderAdapter, prismaPostgresProviderAdapter],
      env: envWithNeon,
    })

    render(React.createElement(DatabaseHealthSummaryView, { snapshot: fullSnapshot }))
    expect(screen.getByText('Database health')).toBeDefined()
    expect(screen.getByText('Neon Serverless Postgres API')).toBeDefined()
    cleanup()

    render(
      React.createElement(DatabaseClient, {
        initialSnapshot: fullSnapshot,
        apiRoute: '/api',
        isAdminUser: true,
      }),
    )
    expect(screen.getByText('Database manager')).toBeDefined()
    expect(screen.getByText('Public schema table & bloat inspector')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: /Serverless Provider/i }))
    expect(screen.getByText('Instant Copy-on-Write Snapshots')).toBeDefined()
    expect(screen.getByText('pocms-production')).toBeDefined()
  })
})

describe('Database Management Plugin — Multi-Format Backup/Restore, Codegen, Advisor & Read-Only SQL', () => {
  it('serializes & restores PostgreSQL .sql dumps (DDL + DML + dollar-quote parser + safety blocks)', async () => {
    const mockDb = createMockPostgresCatalog()
    const fakePayload = { config: await config, db: {} } as unknown as Payload

    const archive = await exportLogicalBackupArchive(mockDb.executor, {
      anonymizePii: true,
      redactSecrets: true,
    })

    // PII anonymization & secret redaction verified
    const usersDump = archive.tables.find((t) => t.name === 'users')!
    expect(usersDump.rows[0]?.email).toBe('user-1@example.local')
    expect(usersDump.rows[0]?.hash).toBeNull()

    const fullSql = serializeArchiveToSql(archive, {
      contentMode: 'schema-and-data',
      includeTransaction: true,
    })
    expect(fullSql).toContain('CREATE TABLE IF NOT EXISTS public."media"')
    expect(fullSql).toContain('CREATE TABLE IF NOT EXISTS public."articles"')
    expect(fullSql).toContain('INSERT INTO public."articles"')
    expect(fullSql).toContain('SELECT setval(')

    // Dollar-quoted PL/pgSQL DO $$ ... $$; blocks with internal semicolons must NOT split mid-block
    const stmts = splitSqlStatements(fullSql)
    const doBlocks = stmts.filter((s) => s.startsWith('DO $$'))
    expect(doBlocks.length).toBeGreaterThan(0)
    for (const block of doBlocks) {
      expect(block.endsWith('END $$')).toBe(true)
    }

    // Forbidden superuser commands are blocked before touching PostgreSQL
    expect(() => analyzeSqlRestoreStatements('DROP DATABASE pocms;')).toThrow(/DROP DATABASE/i)
    expect(() => analyzeSqlRestoreStatements('ALTER SYSTEM SET work_mem = 0;')).toThrow(
      /ALTER SYSTEM/i,
    )

    // Encrypted .enc.sql.gz pack + auto-detected dry-run + transactional restore
    const packedSql = packBackupDocument(fullSql, {
      format: 'sql',
      compress: true,
      encryptionSecret: 'super-secret-backup-key-12345',
    })
    const env = { DATABASE_BACKUP_SECRET: 'super-secret-backup-key-12345' } as unknown as NodeJS.ProcessEnv

    const dryRun = await dryRunLogicalRestore(mockDb.executor, packedSql.bytes, { env })
    expect(dryRun.valid).toBe(true)
    expect(dryRun.detectedFormat).toBe('sql')
    expect(dryRun.encrypted).toBe(true)
    expect(dryRun.matchedTables).toContain('articles')

    mockDb.executedSql.length = 0
    const restored = await executeLogicalRestore(fakePayload, packedSql.bytes, {
      env,
      directRunner: mockDb.directRunner,
    })
    expect(restored.ok).toBe(true)
    expect(restored.detectedFormat).toBe('sql')
    expect(mockDb.executedSql[0]?.text).toBe('BEGIN')
    expect(mockDb.executedSql.some((q) => q.text === 'COMMIT')).toBe(true)
  })

  it('round-trips streaming NDJSON (.ndjson) and RFC-4180 CSV (.csv upsert & replace) backups', async () => {
    const mockDb = createMockPostgresCatalog()
    const fakePayload = { config: await config, db: {} } as unknown as Payload
    const env = { PAYLOAD_SECRET: 'payload-secret-key-987654321' } as unknown as NodeJS.ProcessEnv

    // 1. Streaming NDJSON export -> unpack -> SHA-256 verify -> atomic restore
    const rawArchive = await exportLogicalBackupArchive(mockDb.executor)
    const directNdjson = serializeArchiveToNdjson(rawArchive)
    expect(directNdjson.split('\n')[0]).toContain('"format":"pocms-pg-ndjson-v1"')

    const ndjsonExport = await exportFormattedDatabaseBackup(mockDb.executor, {
      format: 'ndjson',
      compress: true,
      encryptionSecret: 'payload-secret-key-987654321',
    })
    expect(ndjsonExport.filename).toMatch(/\.enc\.ndjson\.gz$/)

    const unpackedNdjson = unpackBackupDocument(ndjsonExport.bytes, {
      encryptionSecret: 'payload-secret-key-987654321',
    })
    expect(unpackedNdjson.detectedFormat).toBe('ndjson')
    const parsedArchive = parseNdjsonToArchive(unpackedNdjson.text)
    expect(parsedArchive.tables.map((t) => t.name)).toContain('articles')

    const ndjsonRestore = await executeLogicalRestore(fakePayload, ndjsonExport.bytes, {
      env,
      directRunner: mockDb.directRunner,
    })
    expect(ndjsonRestore.ok).toBe(true)
    expect(ndjsonRestore.detectedFormat).toBe('ndjson')

    // 2. RFC-4180 CSV export + quoted comma/newline/JSONB round-trip + Upsert restore
    const csvExport = await exportFormattedDatabaseBackup(mockDb.executor, {
      format: 'csv',
      csvTable: 'articles',
      compress: false,
    })
    expect(csvExport.filename).toMatch(/^pocms-articles-.*\.csv$/)
    const csvText = csvExport.bytes.toString('utf8')
    const parsedCsv = parseCsvRecords(csvText)
    expect(parsedCsv.headers).toEqual(['id', 'title', 'featured_image_id', 'parent_id', 'content'])
    expect(parsedCsv.rows).toHaveLength(2)

    const csvDryRun = await dryRunLogicalRestore(mockDb.executor, csvText, {
      env,
      formatHint: 'csv',
      csvTable: 'articles',
      csvStrategy: 'upsert',
    })
    expect(csvDryRun.valid).toBe(true)
    expect(csvDryRun.detectedFormat).toBe('csv')
    expect(csvDryRun.totalRows).toBe(2)

    mockDb.executedSql.length = 0
    const csvExec = await executeLogicalRestore(fakePayload, csvText, {
      env,
      directRunner: mockDb.directRunner,
      formatHint: 'csv',
      csvTable: 'articles',
      csvStrategy: 'upsert',
    })
    expect(csvExec.ok).toBe(true)
    expect(csvExec.detectedFormat).toBe('csv')
    expect(csvExec.restoredRows).toBe(2)
    expect(
      mockDb.executedSql.some((q) =>
        q.text.includes('INSERT INTO public."articles"') &&
        q.text.includes('ON CONFLICT ("id") DO UPDATE SET'),
      ),
    ).toBe(true)

    // Verify serializeTableToCsv handles embedded quotes & newlines per RFC-4180
    const trickyCsv = serializeTableToCsv({
      name: 'articles',
      columns: [
        { name: 'id', dataType: 'integer', udtName: 'int4', isNullable: false },
        { name: 'title', dataType: 'text', udtName: 'text', isNullable: false },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      rowCount: 1,
      rows: [{ id: 99, title: 'Hello, "World"\nLine 2' }],
    })
    const reParsed = parseCsvRecords(trickyCsv)
    expect(reParsed.rows[0]?.title).toBe('Hello, "World"\nLine 2')
  })

  it('generates Payload v3 TypeScript migrations & portable Local API seeds directly from live database', async () => {
    const mockDb = createMockPostgresCatalog()
    // Include backticks & ${...} inside article content to prove template-literal escaping is bulletproof
    mockDb.state.rows.get('articles')!.push({
      id: 30,
      title: 'Code Block `test` ${injected}',
      featured_image_id: 1,
      parent_id: null,
      content: { code: 'const x = `${hello}`' },
    })

    // 1. Schema baseline migration (.ts)
    const schemaMig = await generateMigrationFromDatabase(mockDb.executor, {
      name: 'initial_baseline',
      mode: 'schema-baseline',
      writeToDisk: false,
    })
    expect(schemaMig.language).toBe('typescript')
    expect(schemaMig.filename).toMatch(/^\d{8}_\d{6}_initial_baseline\.ts$/)
    expect(schemaMig.content).toContain("from '@payloadcms/db-vercel-postgres'")
    expect(schemaMig.content).toContain('export async function up({ db }: MigrateUpArgs)')
    expect(schemaMig.content).toContain('export async function down({ db }: MigrateDownArgs)')
    expect(schemaMig.content).toContain('CREATE TABLE IF NOT EXISTS public."articles"')
    expect(schemaMig.content).toContain('DROP TABLE IF EXISTS public."articles" CASCADE;')

    // 2. Data upsert migration (.ts) — escapes backticks and `${` safely
    const dataMig = await generateMigrationFromDatabase(mockDb.executor, {
      name: 'content_snapshot',
      mode: 'data-upsert',
      tables: ['articles'],
      writeToDisk: false,
    })
    expect(dataMig.content).toContain('ON CONFLICT ("id") DO UPDATE SET')
    expect(dataMig.content).toContain('\\`test\\` \\${injected}')

    // 3. Portable Payload Local API Seed (.ts) — resolves media IDs -> filenames & strips timestamps
    const sanitized = await config
    const fakePayload = {
      config: sanitized,
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'media') {
          return { docs: [{ id: 1, filename: 'hero-cover.webp' }], totalDocs: 1 }
        }
        if (collection === 'articles') {
          return {
            docs: [
              {
                id: 10,
                title: 'Distributed Systems',
                slug: 'distributed-systems',
                _order: 'a0',
                featuredImage: 1,
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-01T00:00:00.000Z',
              },
            ],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0 }
      }),
      findGlobal: vi.fn(async ({ slug }: { slug: string }) => ({
        id: 1,
        globalType: slug,
        siteTitle: 'PoCMS Portfolio',
        ogImage: 1,
      })),
    } as unknown as Payload

    const seedArtifact = await generateSeedFromDatabase(fakePayload, mockDb.executor, {
      name: 'portfolio_seed',
      mode: 'payload-local-api',
      collections: ['articles'],
      globals: ['site-settings'],
      anonymizePii: true,
      writeToDisk: false,
    })

    expect(seedArtifact.language).toBe('typescript')
    expect(seedArtifact.filename).toMatch(/^\d{8}_\d{6}_portfolio_seed\.ts$/)
    expect(seedArtifact.content).toContain('export async function seedDatabaseSnapshot(payload: Payload)')
    expect(seedArtifact.content).toContain('"featuredImage": "hero-cover.webp"')
    expect(seedArtifact.content).toContain('"ogImage": "hero-cover.webp"')
    expect(seedArtifact.content).toContain('"_order": "a0"')
    expect(seedArtifact.content).not.toContain('"createdAt"')
  })

  it('detects missing FK indexes in Advisor, creates them via Repair, and enforces 3-layer Read-Only SQL Inspector', async () => {
    const mockDb = createMockPostgresCatalog()
    const sanitized = await config
    const auditCreateSpy = vi.fn().mockResolvedValue({ id: 901 })
    const fakePayload = {
      config: sanitized,
      db: {},
      count: vi.fn().mockResolvedValue({ totalDocs: 2 }),
      create: auditCreateSpy,
      logger: { error: vi.fn(), info: vi.fn() },
    } as unknown as Payload

    const env = {
      POSTGRES_URL: 'postgresql://user:pw@ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech/pocms',
      PAYLOAD_SECRET: 'secret-1234567890',
    } as unknown as NodeJS.ProcessEnv

    const snap = await collectDatabaseManagementSnapshot(fakePayload, {
      executor: mockDb.executor,
      env,
    })
    expect(snap.advisor.missingFkIndexes).toHaveLength(1)
    expect(snap.advisor.missingFkIndexes[0]?.suggestedIndexName).toBe(
      'idx_articles_featured_image_id',
    )

    // 1-click Repair creates the missing FK index
    const idxRepair = await runDatabaseRepairAction(fakePayload, 'create-missing-fk-indexes', {
      executor: mockDb.executor,
      env,
    })
    expect(idxRepair.ok).toBe(true)
    expect(
      mockDb.executedSql.some((q) =>
        q.text.includes(
          'CREATE INDEX IF NOT EXISTS "idx_articles_featured_image_id" ON public."articles" ("featured_image_id")',
        ),
      ),
    ).toBe(true)

    // Read-Only SQL Inspector blocks multi-statement, DDL, DML, and CTE writes
    await expect(
      executeReadOnlyDiagnosticQuery('SELECT 1; DROP TABLE articles;', {
        executor: mockDb.executor,
      }),
    ).rejects.toThrow(/single read-only SQL statement/i)

    await expect(
      executeReadOnlyDiagnosticQuery('DELETE FROM public."articles"', {
        executor: mockDb.executor,
      }),
    ).rejects.toThrow(/Only read-only SELECT/i)

    await expect(
      executeReadOnlyDiagnosticQuery(
        'WITH doomed AS (DELETE FROM public."articles" RETURNING *) SELECT * FROM doomed',
        { executor: mockDb.executor },
      ),
    ).rejects.toThrow(/Mutating or administrative SQL keywords/i)

    // Valid SELECT executes inside BEGIN READ ONLY ... ROLLBACK and redacts password hashes
    mockDb.executedSql.length = 0
    const userQuery = await executeReadOnlyDiagnosticQuery('SELECT * FROM public."users"', {
      executor: mockDb.executor,
    })
    expect(userQuery.rowCount).toBe(1)
    expect(userQuery.rows[0]?.hash).toBe('[REDACTED]')
    expect(userQuery.rows[0]?.salt).toBe('[REDACTED]')
    expect(mockDb.executedSql[0]?.text).toBe('BEGIN READ ONLY')
    expect(mockDb.executedSql[1]?.text).toContain('SET LOCAL statement_timeout')
    expect(mockDb.executedSql[mockDb.executedSql.length - 1]?.text).toBe('ROLLBACK')

    // EXPLAIN mode wraps SELECT automatically
    const explainRes = await executeReadOnlyDiagnosticQuery('SELECT * FROM public."articles"', {
      explain: true,
      executor: mockDb.executor,
    })
    expect(explainRes.explainMode).toBe(true)
    expect(explainRes.rows[0]?.['QUERY PLAN']).toContain('Seq Scan on articles')

    // Endpoints end-to-end: multi-format export + generate-migration + sql-query
    const endpoints = createDatabaseManagementEndpoints({
      executor: mockDb.executor,
      directRunner: mockDb.directRunner,
      env,
    })
    const exportEp = endpoints.find((e) => e.path === '/admin-database/export')!
    const sqlDownloadRes = await exportEp.handler({
      user: userWithCapabilities(['manageDatabase']),
      payload: fakePayload,
      url: 'http://localhost:3000/api/admin-database/export?format=sql&contentMode=schema-only&compress=false',
      headers: new Headers(),
    } as unknown as PayloadRequest)
    expect(sqlDownloadRes.status).toBe(200)
    const sqlText = await sqlDownloadRes.text()
    expect(sqlText).toContain('CREATE TABLE IF NOT EXISTS public."articles"')
    expect(sqlText).not.toContain('INSERT INTO public."articles"')

    // Render all 6 tabs in DatabaseClient
    render(
      React.createElement(DatabaseClient, {
        initialSnapshot: snap,
        apiRoute: '/api',
        isAdminUser: true,
      }),
    )
    fireEvent.click(screen.getByRole('tab', { name: /Migrations & Seeds/i }))
    expect(screen.getByText('Generate Migration from Live Database')).toBeDefined()
    expect(screen.getByText('Generate Seed File from Live Database')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: /SQL Inspector/i }))
    expect(screen.getByText('Safe Read-Only SQL & EXPLAIN Inspector')).toBeDefined()
  })
})

