#!/usr/bin/env node
/**
 * Neon-aware PostgreSQL migration & online optimization runner (`R-06`, `R-08`, `R-09`, `R-10`, `R-13a`).
 *
 * - Installs resilient IPv4-first + `1.1.1.1` / DoH DNS fallback (`scripts/dns-fallback.mjs`) for
 *   Windows / VPN environments where dual-stack `getaddrinfo` (`onlookupall`) hits `EAI_AGAIN`.
 * - Normalizes `sslmode=require|prefer|verify-ca` -> `sslmode=verify-full` to eliminate `pg` v8.20+
 *   deprecation warnings while enforcing full TLS verification.
 * - Prefers `POSTGRES_URL_NON_POOLING` / `DATABASE_URL_UNPOOLED` over `-pooler.` URLs, probes
 *   reachability (TCP 5432 with automatic Neon WebSocket `:443` fallback), and falls back to
 *   `POSTGRES_URL` if the unpooled URL is stale/unreachable.
 * - Preserves Payload 3's native `payload_migrations` `batch = -1` dev-push sentinel untouched so
 *   development `push` mode and production `payload migrate` are never mixed.
 *
 * Usage:
 *   node scripts/migrate-neon.mjs migrate           # Run pending Payload migrations (`src/migrations`)
 *   node scripts/migrate-neon.mjs status            # Show applied/pending migration ledger status
 *   node scripts/migrate-neon.mjs create [name]     # Create a new Payload Drizzle migration
 *   node scripts/migrate-neon.mjs optimize          # Zero-lock online SQL optimizations + heap restore
 */
import { exportDnsPrewarmString, seedDnsCacheEntry } from './dns-fallback.mjs'
import 'dotenv/config'

import { spawnSync } from 'node:child_process'
import dns from 'node:dns'
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
        const phase2And3 = await applyPhase2And3DatabaseOptimizations(db, {
          schemaName: 'public',
        })
        const summary = await applyPhase1DatabaseOptimizations(db, {
          schemaName: 'public',
          concurrent,
        })
        console.log(
          `[db:optimize-indexes] Completed via ${transport.toUpperCase()} (${summary.concurrent ? 'CONCURRENTLY' : 'non-concurrent'}): ` +
            `${summary.createdIndexes.length} index(es) ensured, ${summary.droppedIndexes.length} legacy index(es) pruned; ` +
            `R-10 forms backfilled=${phase2And3.formsBlocks.backfilledFormsCount} (dropped ${phase2And3.formsBlocks.droppedLegacyTables.length} block table(s)); ` +
            `R-13a mail_message_bodies backfilled=${phase2And3.mailBodies.backfilledBodiesCount}; ` +
            `audit_logs heap=${phase2And3.auditLogsHeap.restoredFromPartitioned ? `restored (${phase2And3.auditLogsHeap.preservedRowsCount} row(s) preserved)` : 'standard'}.`,
        )
      },
      { statementTimeoutMs: 300_000 },
    )
    return
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
