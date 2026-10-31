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
    10_000,
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

export function buildPostgresAdapterArgs(
  env: Record<string, string | undefined> = process.env,
): VercelPostgresAdapterArgs {
  const readReplicas = resolveReadReplicaUrls(env)
  return {
    // Skip interactive drizzle-kit schema introspection/prompts during automated Vitest runs
    // (`NODE_ENV === 'test'`) unless explicitly requested via `PAYLOAD_DB_PUSH=true`.
    push: env.NODE_ENV === 'test' ? env.PAYLOAD_DB_PUSH === 'true' : undefined,
    beforeSchemaInit: [phase1BeforeSchemaInit],
    pool: resolvePostgresPoolOptions(env),
    ...(readReplicas ? { readReplicas } : {}),
  }
}
