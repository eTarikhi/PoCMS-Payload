import type { Payload, PayloadRequest } from 'payload'

export type RawSqlResult<T = Record<string, unknown>> = {
  rows: T[]
  rowCount: number | null
}

export type QueryClientLike = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows?: unknown[]; rowCount?: number | null }>
}

const SAFE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/

export function quoteSqlIdent(identifier: string): string {
  if (!identifier || identifier.includes('\0') || identifier.length > 128) {
    throw new Error(`Unsafe SQL identifier: "${identifier}"`)
  }
  if (!SAFE_IDENT_RE.test(identifier) && !/^[A-Za-z0-9_$-]+$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: "${identifier}"`)
  }
  return `"${identifier.replace(/"/g, '""')}"`
}

export function resolvePayloadSchemaName(payload?: Payload | null): string {
  const raw = (payload?.db as { schemaName?: unknown } | undefined)?.schemaName
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const trimmed = raw.trim()
    quoteSqlIdent(trimmed)
    return trimmed
  }
  return 'public'
}

export function qualifiedPayloadTable(
  payload: Payload | null | undefined,
  tableName: string,
): string {
  return `${quoteSqlIdent(resolvePayloadSchemaName(payload))}.${quoteSqlIdent(tableName)}`
}

type InternalDbShape = {
  pool?: QueryClientLike
  primaryDrizzle?: {
    $client?: QueryClientLike
  }
  drizzle?: {
    $client?: QueryClientLike
    $primary?: {
      $client?: QueryClientLike
    }
  }
  sessions?: Record<
    string,
    | {
        db?: {
          session?: {
            client?: QueryClientLike
          }
        }
      }
    | undefined
  >
}

/**
 * Resolves the primary pooled query client from either `@payloadcms/db-postgres` (`db.pool`)
 * or `@payloadcms/db-vercel-postgres` (`db.drizzle.$client` / `db.primaryDrizzle.$client`).
 *
 * When `readReplicas` (`withReplicas`) is active, this deliberately resolves the **primary**
 * client (`primaryDrizzle.$client` or `drizzle.$primary.$client`) so `UPDATE`, `INSERT`, and
 * `SELECT pg_notify(...)` never target a read-only replica endpoint.
 */
export function resolvePayloadPoolClient(payload?: Payload | null): QueryClientLike | null {
  const db = (payload?.db ?? null) as InternalDbShape | null
  if (!db) return null

  const candidates: Array<QueryClientLike | undefined> = [
    db.pool,
    db.primaryDrizzle?.$client,
    db.drizzle?.$primary?.$client,
    db.drizzle?.$client,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate.query === 'function') {
      return candidate
    }
  }

  return null
}

/**
 * Resolves a transaction-aware query client:
 * - If `req.transactionID` references an open Payload interactive transaction in `db.sessions`,
 *   returns that transaction's checked-out `PoolClient` so queries see uncommitted writes and never
 *   pin a second PgBouncer backend slot or self-deadlock on row locks.
 * - Otherwise falls back to Payload's primary pooled client (`resolvePayloadPoolClient`).
 */
export async function resolvePayloadQueryClient(
  payload?: Payload | null,
  req?: PayloadRequest | null,
): Promise<QueryClientLike | null> {
  const db = (payload?.db ?? null) as InternalDbShape | null
  if (!db) return null

  if (req?.transactionID !== undefined && req?.transactionID !== null) {
    try {
      const txId = await req.transactionID
      if (txId !== undefined && txId !== null) {
        const txClient = db.sessions?.[String(txId)]?.db?.session?.client
        if (txClient && typeof txClient.query === 'function') {
          return txClient
        }
      }
    } catch {
      // Fall back to pooled client if transaction promise rejected or already closed.
    }
  }

  return resolvePayloadPoolClient(payload)
}

/**
 * Executes a parameterized SQL statement against Payload's active transaction or connection pool.
 * Returns `null` when `payload.db` is uninitialized (e.g., in-memory unit-test harnesses).
 */
export async function executePayloadSql<T = Record<string, unknown>>(
  payload: Payload | null | undefined,
  text: string,
  values?: unknown[],
  req?: PayloadRequest | null,
): Promise<RawSqlResult<T> | null> {
  const client = await resolvePayloadQueryClient(payload, req)
  if (!client) return null

  const res = await client.query(text, values)
  return {
    rows: (res?.rows ?? []) as T[],
    rowCount: res?.rowCount ?? null,
  }
}
