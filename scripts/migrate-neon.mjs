#!/usr/bin/env node
/**
 * Neon-aware PostgreSQL migration & online index optimization runner (`R-07`, `R-08`, `R-09`).
 *
 * - Installs resilient IPv4-first + `1.1.1.1` / DoH DNS fallback (`scripts/dns-fallback.mjs`) for
 *   Windows / VPN environments where dual-stack `getaddrinfo` (`onlookupall`) hits `EAI_AGAIN`.
 * - Normalizes `sslmode=require|prefer|verify-ca` -> `sslmode=verify-full` to eliminate `pg` v8.20+
 *   deprecation warnings while enforcing full TLS verification.
 * - Prefers `POSTGRES_URL_NON_POOLING` / `DATABASE_URL_UNPOOLED` over `-pooler.` URLs, probes
 *   reachability (TCP 5432 with automatic Neon WebSocket `:443` fallback), and falls back to
 *   `POSTGRES_URL` if the unpooled URL is stale/unreachable.
 *
 * Usage:
 *   node scripts/migrate-neon.mjs migrate           # Run pending Payload migrations (`src/migrations`)
 *   node scripts/migrate-neon.mjs status            # Show applied/pending migration ledger status
 *   node scripts/migrate-neon.mjs create [name]     # Create a new Payload Drizzle migration
 *   node scripts/migrate-neon.mjs optimize-indexes  # Zero-lock online `CONCURRENTLY` Phase 1 rollout
 */
import { exportDnsPrewarmString, seedDnsCacheEntry } from './dns-fallback.mjs'
import 'dotenv/config'

import { spawnSync } from 'node:child_process'
import dns from 'node:dns'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'

const rootRequire = createRequire(import.meta.url)

export function loadVercelPool() {
  const adapterEntry = rootRequire.resolve('@payloadcms/db-vercel-postgres')
  const adapterRequire = createRequire(adapterEntry)
  return adapterRequire('@vercel/postgres').VercelPool
}

/**
 * Moves any top-level `.ts` / `.js` / `.json` files in `migrationsDir` that are NOT registered in
 * `migrationsDir/index.ts` into `migrationsDir/.archived-local/` so Payload's `readdirSync`
 * migration loader never executes stale untracked local dumps (e.g. `20261025_*.ts` created when
 * `/src/migrations` was gitignored).
 *
 * Legitimate migrations created via `pnpm db:migrate:create` are automatically written into
 * `index.ts` by Payload's `writeMigrationIndex` and are preserved untouched.
 *
 * @param {string} migrationsDir
 * @returns {string[]} List of quarantined filenames
 */
export function quarantineUnregisteredMigrations(migrationsDir) {
  const indexPath = path.join(migrationsDir, 'index.ts')
  if (!fs.existsSync(migrationsDir) || !fs.existsSync(indexPath)) {
    return []
  }

  const indexSource = fs.readFileSync(indexPath, 'utf8')
  /** @type {Set<string>} */
  const registeredStems = new Set()

  for (const match of indexSource.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
    const stem = match[1].replace(/\.(ts|js)$/, '')
    if (stem) registeredStems.add(stem)
  }
  for (const match of indexSource.matchAll(/name:\s*['"]([^'"]+)['"]/g)) {
    if (match[1]) registeredStems.add(match[1])
  }

  if (registeredStems.size === 0) {
    return []
  }

  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true })
  /** @type {string[]} */
  const quarantined = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const fileName = entry.name
    if (fileName === 'index.ts' || fileName === 'index.js') continue
    if (!/\.(ts|js|json)$/.test(fileName)) continue

    const stem = fileName.replace(/\.(ts|js|json)$/, '')
    if (registeredStems.has(stem)) continue

    const archiveDir = path.join(migrationsDir, '.archived-local')
    fs.mkdirSync(archiveDir, { recursive: true })
    const srcPath = path.join(migrationsDir, fileName)
    const destPath = path.join(archiveDir, fileName)
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { force: true })
    }
    fs.renameSync(srcPath, destPath)
    quarantined.push(fileName)
  }

  return quarantined
}

const LEGACY_SSL_MODES = new Set(['prefer', 'require', 'verify-ca'])

/**
 * Normalizes `sslmode=prefer|require|verify-ca` -> `sslmode=verify-full` unless `uselibpqcompat`
 * is explicitly set, silencing `pg-connection-string` v2.x->v3.0 warnings.
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeMigrationPostgresUrl(rawUrl) {
  const trimmed = rawUrl.trim()
  if (!trimmed) return trimmed
  try {
    const parsed = new URL(trimmed)
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase()
    if (sslMode && LEGACY_SSL_MODES.has(sslMode) && !parsed.searchParams.has('uselibpqcompat')) {
      parsed.searchParams.set('sslmode', 'verify-full')
      return parsed.toString()
    }
    return trimmed
  } catch {
    return trimmed
  }
}

/**
 * @param {string} rawUrl
 */
function parseHostSafe(rawUrl) {
  try {
    return new URL(rawUrl).hostname
  } catch {
    return '<invalid-url>'
  }
}

/**
 * @param {string} rawUrl
 */
function isPooledUrl(rawUrl) {
  return (
    rawUrl.includes('-pooler.') ||
    rawUrl.includes('.pooler.supabase.com') ||
    rawUrl.includes('pgbouncer=true')
  )
}

/**
 * Probes connectivity and runs a lightweight callback via TCP `pg.Client` (port 5432), falling back
 * to `@vercel/postgres` `VercelPool` (WebSocket `:443`) on `*.neon.tech` hosts when TCP 5432 is
 * firewalled.
 *
 * @template T
 * @param {string} connectionString
 * @param {(exec: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> }, transport: 'tcp' | 'ws') => Promise<T>} fn
 * @param {{ statementTimeoutMs?: number }} [opts]
 * @returns {Promise<T>}
 */
async function withResilientDbClient(connectionString, fn, opts = {}) {
  const host = parseHostSafe(connectionString)
  const isNeonHost = host.endsWith('.neon.tech')
  const pooled = isPooledUrl(connectionString)

  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: opts.statementTimeoutMs ?? 300_000,
    ...(!pooled && opts.statementTimeoutMs ? { statement_timeout: opts.statementTimeoutMs } : {}),
  })

  try {
    await client.connect()
    try {
      return await fn(client, 'tcp')
    } finally {
      await client.end().catch(() => undefined)
    }
  } catch (tcpErr) {
    await client.end().catch(() => undefined)
    const code = /** @type {NodeJS.ErrnoException} */ (tcpErr)?.code || ''
    // Only fall back to WebSocket :443 on Neon hosts when TCP 5432 failed at transport level (not DNS NXDOMAIN or auth)
    if (
      !isNeonHost ||
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      code === '28P01' ||
      code === '3D000'
    ) {
      throw tcpErr
    }

    const VercelPool = loadVercelPool()
    const wsPool = new VercelPool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 60_000,
    })
    try {
      return await fn(wsPool, 'ws')
    } finally {
      await wsPool.end().catch(() => undefined)
    }
  }
}

/**
 * Unwraps DOM `ErrorEvent` / `AggregateError` / `cause` objects thrown by Node 24 WebSocket or `net`.
 * @param {unknown} raw
 * @returns {{ code: string; message: string }}
 */
function extractConnectionError(raw) {
  if (!raw || typeof raw !== 'object') {
    return { code: '', message: String(raw) }
  }
  const obj = /** @type {Record<string, any>} */ (raw)
  const inner = obj.error || obj.cause || (Array.isArray(obj.errors) ? obj.errors[0] : null)
  const code = String(obj.code || inner?.code || '')
  const message =
    (typeof obj.message === 'string' && obj.message) ||
    (typeof inner?.message === 'string' && inner.message) ||
    String(raw)
  return { code, message }
}

/**
 * Prints an actionable diagnostic when database hostnames fail DNS or TCP/WSS preflight.
 * @param {Array<{ envName: string; host: string; error: unknown }>} failures
 */
function reportConnectionFailures(failures) {
  console.error('\n[db:migrate] Unable to reach the configured PostgreSQL endpoint(s):')
  let firstCode = ''
  for (const item of failures) {
    const { code, message } = extractConnectionError(item.error)
    if (!firstCode && code) firstCode = code
    const codeLabel = code ? ` (${code})` : ''
    console.error(`  - ${item.envName} -> ${item.host}${codeLabel}: ${message}`)
  }

  const firstHost = failures[0]?.host
  console.error('\nTroubleshooting:')
  if (firstCode === 'ENOTFOUND') {
    console.error(
      `  1. Host "${firstHost}" returned NXDOMAIN (does not exist). Check your Neon Console -> Connection Details and update POSTGRES_URL / POSTGRES_URL_NON_POOLING in .env.`,
    )
  } else if (firstCode === 'EAI_AGAIN' || firstCode === 'ETIMEOUT') {
    console.error(
      `  1. DNS resolution timed out (${firstCode}) across OS DNS, 1.1.1.1/8.8.8.8, and DoH. Verify internet/VPN connectivity on this machine:`,
    )
    if (firstHost) {
      console.error(`     PowerShell: Resolve-DnsName ${firstHost} -Server 1.1.1.1`)
    }
    console.error(
      `  2. Also confirm in the Neon Console that endpoint "${firstHost}" has not been deleted or replaced.`,
    )
  } else {
    console.error(
      '  1. Verify internet/VPN/firewall access to ports 5432 or 443 and confirm credentials in .env.',
    )
  }
}

async function main() {
  const mode = (process.argv[2] || 'migrate').trim().toLowerCase()
  const extraArgs = process.argv.slice(3)

  if (mode !== 'create' && process.env.PAYLOAD_MIGRATE_ALLOW_UNREGISTERED !== 'true') {
    const migrationsDir = path.resolve(process.cwd(), 'src', 'migrations')
    const archived = quarantineUnregisteredMigrations(migrationsDir)
    if (archived.length > 0) {
      console.warn(
        `[db:migrate] Quarantined ${archived.length} untracked legacy file(s) -> src/migrations/.archived-local/: ${archived.join(', ')}`,
      )
    }
  }

  /** @type {Array<{ envName: string; url: string; host: string }>} */
  const candidates = []
  const seenUrls = new Set()
  for (const [envName, raw] of [
    ['POSTGRES_URL_NON_POOLING', process.env.POSTGRES_URL_NON_POOLING],
    ['DATABASE_URL_UNPOOLED', process.env.DATABASE_URL_UNPOOLED],
    ['POSTGRES_URL', process.env.POSTGRES_URL],
  ]) {
    const normalized = raw ? normalizeMigrationPostgresUrl(raw) : ''
    if (normalized && !seenUrls.has(normalized)) {
      seenUrls.add(normalized)
      candidates.push({
        envName,
        url: normalized,
        host: parseHostSafe(normalized),
      })
    }
  }

  if (mode !== 'create' && candidates.length === 0) {
    console.error('[db:migrate] Error: Set POSTGRES_URL_NON_POOLING or POSTGRES_URL in .env before running.')
    process.exit(1)
  }

  // Probe candidate URLs in priority order (unpooled first, falling back to pooled if unpooled is stale)
  let selected = candidates[0] ?? null
  if (mode !== 'create' && candidates.length > 0) {
    /** @type {Array<{ envName: string; host: string; error: unknown }>} */
    const failures = []
    selected = null

    for (const candidate of candidates) {
      try {
        await withResilientDbClient(candidate.url, async (db) => {
          await db.query('SELECT 1 AS ok')
        })
        selected = candidate
        if (failures.length > 0) {
          console.warn(
            `[db:migrate] Note: ${failures[0].envName} (${failures[0].host}) was unreachable; connected via ${candidate.envName} (${candidate.host}).`,
          )
        }
        break
      } catch (err) {
        failures.push({ envName: candidate.envName, host: candidate.host, error: err })
      }
    }

    if (!selected) {
      reportConnectionFailures(failures)
      process.exit(1)
    }
  }

  if ((mode === 'optimize-indexes' || mode === 'optimize') && selected) {
    const { tsImport } = await import('tsx/esm/api')
    const { applyPhase1DatabaseOptimizations } = await tsImport(
      '../src/lib/phase1SqlOptimizations.ts',
      import.meta.url,
    )
    const { applyPhase2And3DatabaseOptimizations } = await tsImport(
      '../src/lib/phase2And3SqlOptimizations.ts',
      import.meta.url,
    )

    const concurrent = !isPooledUrl(selected.url)
    if (!concurrent) {
      console.warn(
        `[db:optimize-indexes] Connected via pooled URL (${selected.envName}); using transactional-safe non-concurrent DDL. Set a reachable POSTGRES_URL_NON_POOLING for zero-lock CONCURRENTLY execution.`,
      )
    }

    await withResilientDbClient(
      selected.url,
      async (db, transport) => {
        const summary = await applyPhase1DatabaseOptimizations(db, {
          schemaName: 'public',
          concurrent,
        })
        const phase2And3 = await applyPhase2And3DatabaseOptimizations(db, {
          schemaName: 'public',
        })
        console.log(
          `[db:optimize-indexes] Completed via ${transport.toUpperCase()} (${summary.concurrent ? 'CONCURRENTLY' : 'non-concurrent'}): ` +
            `${summary.createdIndexes.length} index(es) ensured, ${summary.droppedIndexes.length} legacy index(es) pruned; ` +
            `R-10 forms backfilled=${phase2And3.formsBlocks.backfilledFormsCount} (dropped ${phase2And3.formsBlocks.droppedLegacyTables.length} block table(s)); ` +
            `R-13 mail_message_bodies backfilled=${phase2And3.mailBodies.backfilledBodiesCount}, ` +
            `audit_logs partitioned=${phase2And3.auditPartitions.convertedFromHeap ? 'converted' : 'verified'} (${phase2And3.auditPartitions.ensuredPartitions.length} partition(s) ensured).`,
        )
      },
      { statementTimeoutMs: 300_000 },
    )
    return
  }

  // When transitioning an existing pushDevSchema-bootstrapped database (`batch = -1` row in
  // `payload_migrations`) to versioned migrations, `@payloadcms/drizzle` prompts interactively and
  // silently exits 0 on non-TTY stdin. Clearing `batch = -1` allows idempotent migrations to run cleanly.
  if (mode === 'migrate' && selected && process.env.PAYLOAD_MIGRATE_KEEP_DEV_SENTINEL !== 'true') {
    await withResilientDbClient(selected.url, async (db) => {
      const check = await db.query(
        `SELECT to_regclass('public.payload_migrations') IS NOT NULL AS exists`,
      )
      if (check.rows[0]?.exists) {
        const cleaned = await db.query(
          `DELETE FROM "public"."payload_migrations" WHERE "batch" = -1`,
        )
        if ((cleaned.rowCount ?? 0) > 0) {
          console.log(
            `[db:migrate] Cleared ${cleaned.rowCount} dev-mode sentinel row(s) (batch = -1) from payload_migrations.`,
          )
        }
      }
    })
  }

  const payloadSubcommand =
    mode === 'status'
      ? ['migrate:status', ...extraArgs]
      : mode === 'create'
        ? ['migrate:create', ...(extraArgs.length ? extraArgs : ['schema_update'])]
        : mode === 'down'
          ? ['migrate:down', ...extraArgs]
          : ['migrate', ...extraArgs]

  if (selected?.host && selected.host !== 'localhost' && net.isIP(selected.host) === 0) {
    try {
      const prewarmed = await dns.promises.lookup(selected.host, { family: 4 })
      if (prewarmed?.address) {
        seedDnsCacheEntry(selected.host, prewarmed.address)
      }
    } catch {
      // Non-fatal; fallback cache may already hold resolved entries
    }
  }
  const dnsPrewarm = exportDnsPrewarmString()

  const env = {
    ...process.env,
    ...(selected
      ? {
          POSTGRES_URL: selected.url,
          POSTGRES_URL_NON_POOLING: selected.url,
        }
      : {}),
    ...(dnsPrewarm ? { POCMS_DNS_PREWARM: dnsPrewarm } : {}),
    POSTGRES_POOL_CONNECTION_TIMEOUT_MS:
      process.env.POSTGRES_POOL_CONNECTION_TIMEOUT_MS || '60000',
    BLOB_READ_WRITE_TOKEN:
      process.env.BLOB_READ_WRITE_TOKEN || 'vercel_blob_rw_codegen0_placeholder0',
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'migration-cli-placeholder-secret-32chars',
    PAYLOAD_CONFIG_PATH: process.env.PAYLOAD_CONFIG_PATH || 'src/payload.config.ts',
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' '),
  }

  const dnsFallbackModuleUrl = pathToFileURL(
    path.resolve(process.cwd(), 'scripts', 'dns-fallback.mjs'),
  ).href
  const payloadBin = path.resolve(process.cwd(), 'node_modules', 'payload', 'bin.js')
  const result = spawnSync(
    process.execPath,
    ['--import', dnsFallbackModuleUrl, payloadBin, ...payloadSubcommand],
    {
      env,
      stdio: 'inherit',
    },
  )
  process.exit(result.status ?? 1)
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

// Handle Windows drive-letter pathname formatting (`/C:/...` vs `C:\...`)
const currentFileUrl = import.meta.url
const invokedFileUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''

if (isDirectExecution || currentFileUrl === invokedFileUrl) {
  main().catch((err) => {
    console.error('[db:migrate] Unexpected failure:', err)
    process.exit(1)
  })
}
