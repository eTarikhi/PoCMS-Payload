#!/usr/bin/env node
/**
 * Neon-aware PostgreSQL migration & online index optimization runner (`R-07`, `R-08`, `R-09`).
 *
 * Automatically promotes `POSTGRES_URL_NON_POOLING` / `DATABASE_URL_UNPOOLED` over `-pooler.`
 * PgBouncer transaction pooler endpoints so DDL locks, advisory locks, and `CREATE INDEX CONCURRENTLY`
 * run directly against the primary PostgreSQL compute.
 *
 * Usage:
 *   node scripts/migrate-neon.mjs migrate           # Run pending Payload migrations (`src/migrations`)
 *   node scripts/migrate-neon.mjs status            # Show applied/pending migration ledger status
 *   node scripts/migrate-neon.mjs create [name]     # Create a new Payload Drizzle migration
 *   node scripts/migrate-neon.mjs optimize-indexes  # Zero-lock online `CONCURRENTLY` Phase 1 rollout
 */
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import pg from 'pg'

const mode = (process.argv[2] || 'migrate').trim().toLowerCase()
const extraArgs = process.argv.slice(3)

const pooledUrl = (process.env.POSTGRES_URL ?? '').trim()
const unpooledUrl = (
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL_UNPOOLED ??
  ''
).trim()

const effectiveUrl = unpooledUrl || pooledUrl
const isPooled =
  effectiveUrl.includes('-pooler.') ||
  effectiveUrl.includes('.pooler.supabase.com') ||
  effectiveUrl.includes('pgbouncer=true')

if (mode !== 'create' && !effectiveUrl) {
  console.error('[db:migrate] Error: Set POSTGRES_URL_NON_POOLING or POSTGRES_URL before running.')
  process.exit(1)
}

if (mode === 'optimize-indexes') {
  const { tsImport } = await import('tsx/esm/api')
  const { applyPhase1DatabaseOptimizations } = await tsImport(
    '../src/lib/phase1SqlOptimizations.ts',
    import.meta.url,
  )

  const concurrent = !isPooled
  if (!concurrent) {
    console.warn(
      '[db:optimize-indexes] Warning: Connected via a pooled URL (-pooler); falling back to non-concurrent DDL. Set POSTGRES_URL_NON_POOLING for zero-lock CONCURRENTLY execution.',
    )
  }

  const client = new pg.Client({
    connectionString: effectiveUrl,
    connectionTimeoutMillis: 15_000,
    query_timeout: 300_000,
    ...(concurrent ? { statement_timeout: 300_000 } : {}),
  })

  await client.connect()
  try {
    const summary = await applyPhase1DatabaseOptimizations(client, {
      schemaName: 'public',
      concurrent,
    })
    console.log(
      `[db:optimize-indexes] Completed (${summary.concurrent ? 'CONCURRENTLY' : 'non-concurrent'}): ` +
        `${summary.createdIndexes.length} index(es) ensured, ${summary.droppedIndexes.length} legacy index(es) pruned.`,
    )
  } finally {
    await client.end().catch(() => undefined)
  }
  process.exit(0)
}

// When transitioning an existing pushDevSchema-bootstrapped database (`batch = -1` row in
// `payload_migrations`) to versioned migrations, `@payloadcms/drizzle` prompts interactively and
// silently exits 0 on non-TTY stdin (CI / Vercel builds). Clearing the `batch = -1` dev sentinel
// allows idempotent versioned migrations in `src/migrations/` to execute cleanly in non-TTY runs.
if (mode === 'migrate' && process.env.PAYLOAD_MIGRATE_KEEP_DEV_SENTINEL !== 'true') {
  const client = new pg.Client({
    connectionString: effectiveUrl,
    connectionTimeoutMillis: 10_000,
  })
  try {
    await client.connect()
    const check = await client.query(
      `SELECT to_regclass('public.payload_migrations') IS NOT NULL AS exists`,
    )
    if (check.rows[0]?.exists) {
      const cleaned = await client.query(
        `DELETE FROM "public"."payload_migrations" WHERE "batch" = -1`,
      )
      if ((cleaned.rowCount ?? 0) > 0) {
        console.log(
          `[db:migrate] Cleared ${cleaned.rowCount} dev-mode sentinel row(s) (batch = -1) from payload_migrations for non-interactive migration execution.`,
        )
      }
    }
  } catch (err) {
    console.warn(
      `[db:migrate] Pre-check warning (continuing to payload migrate): ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    await client.end().catch(() => undefined)
  }
}

const payloadSubcommand =
  mode === 'status'
    ? ['migrate:status', ...extraArgs]
    : mode === 'create'
      ? ['migrate:create', ...(extraArgs.length ? extraArgs : ['schema_update'])]
      : mode === 'down'
        ? ['migrate:down', ...extraArgs]
        : ['migrate', ...extraArgs]

const env = {
  ...process.env,
  ...(effectiveUrl ? { POSTGRES_URL: effectiveUrl } : {}),
  BLOB_READ_WRITE_TOKEN:
    process.env.BLOB_READ_WRITE_TOKEN || 'vercel_blob_rw_codegen0_placeholder0',
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'migration-cli-placeholder-secret-32chars',
  PAYLOAD_CONFIG_PATH: process.env.PAYLOAD_CONFIG_PATH || 'src/payload.config.ts',
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' '),
}

const payloadBin = path.resolve(process.cwd(), 'node_modules', 'payload', 'bin.js')
const result = spawnSync(process.execPath, [payloadBin, ...payloadSubcommand], {
  env,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
