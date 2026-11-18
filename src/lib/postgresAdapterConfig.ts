import type { VercelPostgresAdapterArgs } from '@payloadcms/db-vercel-postgres'

import { phase1BeforeSchemaInit } from './postgresSchemaHooks'

const LOCAL_POSTGRES_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'])

const SERVERLESS_AUTOSCALING_HOST_PATTERNS = [
  '.neon.tech',
  'vercel-storage.com',
  'prisma-data.net',
  '.db.prisma.io',
] as const

function parseHostname(connectionString: string): string | null {
  const trimmed = connectionString.trim()
  if (!trimmed) return null
  try {
    const normalized = trimmed.replace(/^postgres(?:ql)?:\/\//i, 'https://')
    return new URL(normalized).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isLocalPostgresUrl(connectionString?: string | null): boolean {
  const trimmed = (connectionString ?? '').trim()
  if (!trimmed) return true
  const host = parseHostname(trimmed)
  if (!host) return false
  return LOCAL_POSTGRES_HOSTS.has(host)
}

export function isServerlessAutoscalingPostgresUrl(connectionString?: string | null): boolean {
  const host = parseHostname(connectionString ?? '')
  if (!host) return false
  return SERVERLESS_AUTOSCALING_HOST_PATTERNS.some((suffix) => host.includes(suffix))
}

/**
 * Hostnames `@payloadcms/db-vercel-postgres` itself recognises as local.
 *
 * Kept separate from `LOCAL_POSTGRES_HOSTS` on purpose. `connect.js` hardcodes exactly
 * `['127.0.0.1', 'localhost']` when choosing between node-postgres and the Neon serverless
 * driver, while `LOCAL_POSTGRES_HOSTS` is our wider notion of "local" used for pool sizing. That
 * wider set must stay wider; the gap between them is the drift this module already contained.
 */
const ADAPTER_NATIVE_LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

/**
 * Detects the driver-selection drift between this repository and
 * `@payloadcms/db-vercel-postgres`.
 *
 * `connect.js` only builds a `pg.Pool` when the hostname is `127.0.0.1` or `localhost`. Every other
 * hostname — including the Docker Compose service alias `postgres` — is handed to `VercelPool`,
 * which is `@neondatabase/serverless`'s `Pool` and tunnels over a WebSocket to `wss://<host>/v2`
 * instead of opening plain TCP 5432. A stock PostgreSQL container is therefore unreachable under
 * the `postgres` alias even though `isLocalPostgresUrl()` correctly reports it as local.
 *
 * @returns `true` when the URL is local by our definition but the adapter would not treat it as
 *          local.
 */
export function usesDriftedLocalHost(connectionString?: string | null): boolean {
  const trimmed = (connectionString ?? '').trim()
  if (!trimmed || !isLocalPostgresUrl(trimmed)) return false
  const host = parseHostname(trimmed)
  if (!host) return false
  return !ADAPTER_NATIVE_LOCAL_HOSTS.has(host)
}

/**
 * Rewrites a drifted local URL so the adapter's own hostname check recognises it as local.
 *
 * Only the hostname is substituted: `127.0.0.1` replaces the alias, and a non-default port is
 * carried over as a query parameter. This works because `pg.Pool` honours
 * `options.port ?? options.connectionString.port` (see `pg/lib/connection-parameters.js`), so
 * `postgres://user:pass@127.0.0.1:5432/db?port=5433` still connects over plain TCP to port 5433.
 *
 * `connect.js` takes its connection string from `poolOptions.connectionString`, so the adapter
 * must be given this rewritten value in `pool`. The adapter's top-level `connectionString` argument
 * is never read, and `forceUseVercelPostgres: true` has the *opposite* effect to the one this bug
 * needs (it forces the serverless driver).
 *
 * @returns the rewritten URL, or `undefined` when no rewrite is needed or possible.
 */
export function resolveLocalDriverConnectionString(
  connectionString?: string | null,
): string | undefined {
  const trimmed = (connectionString ?? '').trim()
  if (!trimmed || !usesDriftedLocalHost(trimmed)) return undefined

  let parsed: URL
  try {
    parsed = new URL(trimmed.replace(/^postgres(ql)?:\/\//i, 'https://'))
  } catch {
    return undefined
  }

  const nonDefaultPort = parsed.port && parsed.port !== '5432' ? parsed.port : undefined
  const search = new URLSearchParams(parsed.search)
  if (nonDefaultPort) {
    if (!search.has('port')) search.set('port', nonDefaultPort)
  } else {
    search.delete('port')
  }

  const scheme = trimmed.slice(0, trimmed.indexOf('://'))
  const credentials = parsed.username
    ? `${decodeURIComponent(parsed.username)}${parsed.password ? `:${decodeURIComponent(parsed.password)}` : ''}@`
    : ''
  const query = search.toString()

  return `${scheme}://${credentials}127.0.0.1:5432${parsed.pathname}` + (query ? `?${query}` : '')
}

function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return fallback
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export type ResolvedPostgresPoolConfig = NonNullable<VercelPostgresAdapterArgs['pool']> & {
  /**
   * Always present at runtime: `resolvePostgresPoolOptions` sets it from `POSTGRES_URL`, which may
   * legitimately be an empty string. The adapter's own type marks it optional.
   */
  connectionString: string
  max: number
  idleTimeoutMillis: number
  connectionTimeoutMillis: number
  maxUses: number
}

/**
 * Computes host-aware PostgreSQL pool sizing for `@payloadcms/db-vercel-postgres`:
 * - Remote / Neon serverless hosts default to `max: 4` and `idleTimeoutMillis: 5_000` so concurrent
 *   serverless isolates never exhaust PgBouncer / Neon compute slots and release idle WebSocket
 *   connections promptly for `suspend_timeout_seconds` scale-to-zero.
 * - Local development (`localhost` / `127.0.0.1` / `postgres`) defaults to `max: 10` and `30_000` ms.
 */
export function resolvePostgresPoolOptions(
  env: Record<string, string | undefined> = process.env,
): ResolvedPostgresPoolConfig {
  const connectionString = (env.POSTGRES_URL ?? '').trim()
  const isLocal = isLocalPostgresUrl(connectionString)

  const max = parseBoundedInt(env.POSTGRES_POOL_MAX, isLocal ? 10 : 4, 1, 100)
  const idleTimeoutMillis = parseBoundedInt(
    env.POSTGRES_POOL_IDLE_TIMEOUT_MS,
    isLocal ? 30_000 : 5_000,
    1_000,
    300_000,
  )
  const connectionTimeoutMillis = parseBoundedInt(
    env.POSTGRES_POOL_CONNECTION_TIMEOUT_MS,
    isLocal ? 10_000 : 30_000,
    1_000,
    120_000,
  )
  const maxUses = parseBoundedInt(env.POSTGRES_POOL_MAX_USES, 7_500, 1, 1_000_000)

  return {
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    maxUses,
  }
}

/**
 * Parses optional comma-separated zero-copy Neon read-replica URLs (`POSTGRES_READ_REPLICA_URLS`
 * or `POSTGRES_READ_REPLICA_URL`), deduplicating and excluding the primary `POSTGRES_URL`.
 */
export function resolveReadReplicaUrls(
  env: Record<string, string | undefined> = process.env,
): string[] | undefined {
  const primary = (env.POSTGRES_URL ?? '').trim()
  const combined = [env.POSTGRES_READ_REPLICA_URLS ?? '', env.POSTGRES_READ_REPLICA_URL ?? '']
    .join(',')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => Boolean(entry) && entry !== primary)

  const unique = Array.from(new Set(combined))
  return unique.length > 0 ? unique : undefined
}

/**
 * Pool options for the adapter, with the local driver drift closed.
 *
 * `connect.js` reads `poolOptions.connectionString` and will only build a plain `pg.Pool` for
 * `127.0.0.1`/`localhost`. For drifted local hosts (notably the Compose alias `postgres`) the
 * connection string is rewritten to loopback so the plain driver is selected. For every other host —
 * all remote/Vercel URLs — the resolved options are returned unchanged, so production behaviour is
 * byte-identical to before.
 */
export function resolvePoolOptions(
  env: Record<string, string | undefined> = process.env,
): ResolvedPostgresPoolConfig {
  const pool = resolvePostgresPoolOptions(env)
  const localDriverUrl = resolveLocalDriverConnectionString(pool.connectionString)
  return localDriverUrl ? { ...pool, connectionString: localDriverUrl } : pool
}

export function buildPostgresAdapterArgs(
  env: Record<string, string | undefined> = process.env,
): VercelPostgresAdapterArgs {
  const readReplicas = resolveReadReplicaUrls(env)
  return {
    // R-10: Collapse polymorphic `_blocks_*` tables (`forms_blocks_*`) into inline `jsonb`,
    // eliminating 8-way `LEFT JOIN LATERAL` reads and child-table delete/re-insert churn.
    blocksAsJSON: true,
    // Skip interactive drizzle-kit schema introspection/prompts during automated Vitest runs
    // (`NODE_ENV === 'test'`) unless explicitly requested via `PAYLOAD_DB_PUSH=true`.
    push: env.NODE_ENV === 'test' ? env.PAYLOAD_DB_PUSH === 'true' : undefined,
    beforeSchemaInit: [phase1BeforeSchemaInit],
    pool: resolvePoolOptions(env),
    ...(readReplicas ? { readReplicas } : {}),
  }
}
