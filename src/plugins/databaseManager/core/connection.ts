import { sql } from '@payloadcms/db-vercel-postgres'
import pg from 'pg'
import type { Payload } from 'payload'

import { parsePostgresDiagnostics, type ConnectionDiagnostics } from '../shared'

export type SqlQueryResult<T = Record<string, unknown>> = {
  rows: T[]
  rowCount?: number | null
}

export interface SqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<SqlQueryResult<T>>
}

const SAFE_SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/

/**
 * Validates and double-quotes a PostgreSQL identifier (`schema`, `table`, `column`, `sequence`).
 * Rejects control characters or NUL bytes so dynamic DDL/maintenance statements (`VACUUM`, `REINDEX`,
 * `TRUNCATE`, `INSERT`) are immune to SQL injection.
 */
export function quoteIdent(identifier: string): string {
  if (!identifier || identifier.includes('\0') || identifier.length > 128) {
    throw new Error(`Unsafe SQL identifier: "${identifier}"`)
  }
  if (!SAFE_SQL_IDENTIFIER.test(identifier)) {
    // Allow Payload hyphenated internal names if any exist, escaping embedded double quotes.
    if (!/^[A-Za-z0-9_$-]+$/.test(identifier)) {
      throw new Error(`Invalid characters in SQL identifier: "${identifier}"`)
    }
  }
  return `"${identifier.replace(/"/g, '""')}"`
}

export function resolvePostgresUrls(env: NodeJS.ProcessEnv = process.env): {
  pooledUrl: string
  unpooledUrl: string
  diagnostics: ConnectionDiagnostics
} {
  const pooledUrl = env.POSTGRES_URL?.trim() ?? ''
  const unpooledUrl =
    (env.POSTGRES_URL_NON_POOLING ?? env.DATABASE_URL_UNPOOLED)?.trim() ?? ''
  const diagnostics = parsePostgresDiagnostics(pooledUrl, unpooledUrl)
  return { pooledUrl, unpooledUrl, diagnostics }
}

/**
 * Wraps Payload's active database pool / Drizzle instance as a `SqlExecutor` for zero-overhead
 * monitoring queries, falling back to a short-lived `pg.Client` if Payload's pool isn't initialized.
 */
export function createPayloadSqlExecutor(
  payload: Payload,
  env: NodeJS.ProcessEnv = process.env,
): SqlExecutor | null {
  const dbRecord = (payload?.db ?? {}) as {
    pool?: {
      query?: (text: string, values?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number | null }>
    }
    drizzle?: {
      execute?: (query: unknown) => Promise<{ rows?: unknown[]; rowCount?: number | null }>
    }
  }

  if (typeof dbRecord.pool?.query === 'function') {
    const pool = dbRecord.pool
    return {
      async query<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ): Promise<SqlQueryResult<T>> {
        const res = await pool.query!(text, values)
        return {
          rows: (res?.rows ?? []) as T[],
          rowCount: res?.rowCount ?? null,
        }
      },
    }
  }

  if (typeof dbRecord.drizzle?.execute === 'function') {
    const drizzle = dbRecord.drizzle
    return {
      async query<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ): Promise<SqlQueryResult<T>> {
        if (values && values.length > 0) {
          return withDirectPostgresClient((client) => client.query<T>(text, values), { env })
        }
        const res = await drizzle.execute!(sql.raw(text))
        return {
          rows: (res?.rows ?? []) as T[],
          rowCount: res?.rowCount ?? null,
        }
      },
    }
  }

  const { pooledUrl, unpooledUrl } = resolvePostgresUrls(env)
  if (!pooledUrl && !unpooledUrl) return null

  return {
    async query<T extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<SqlQueryResult<T>> {
      return withDirectPostgresClient((client) => client.query<T>(text, values), { env })
    },
  }
}

export type DirectClientContext = {
  usedUnpooledConnection: boolean
  diagnostics: ConnectionDiagnostics
}

export type DirectClientRunner = <T>(
  fn: (executor: SqlExecutor, context: DirectClientContext) => Promise<T>,
  options?: {
    env?: NodeJS.ProcessEnv
    preferUnpooled?: boolean
    statementTimeoutMs?: number
  },
) => Promise<T>

/**
 * Opens a dedicated `pg.Client` preferring `POSTGRES_URL_NON_POOLING` / `DATABASE_URL_UNPOOLED`
 * so maintenance commands (`VACUUM`, `REINDEX`), advisory locks, and multi-statement transactional
 * restores bypass Neon's `-pooler` PgBouncer transaction-mode restrictions whenever possible.
 */
export const withDirectPostgresClient: DirectClientRunner = async (fn, options = {}) => {
  const { env = process.env, preferUnpooled = true, statementTimeoutMs = 55_000 } = options
  const { pooledUrl, unpooledUrl, diagnostics } = resolvePostgresUrls(env)

  const chosenUrl = preferUnpooled && unpooledUrl ? unpooledUrl : pooledUrl || unpooledUrl
  if (!chosenUrl) {
    throw new Error('POSTGRES_URL is not configured.')
  }

  const usedUnpooledConnection = Boolean(
    (preferUnpooled && unpooledUrl) || (!diagnostics.pooled && pooledUrl),
  )

  const client = new pg.Client({
    connectionString: chosenUrl,
    connectionTimeoutMillis: 8_000,
    statement_timeout: statementTimeoutMs,
  })

  await client.connect()
  try {
    const executor: SqlExecutor = {
      async query<R extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ): Promise<SqlQueryResult<R>> {
        const res = await client.query(text, values)
        return {
          rows: (res.rows ?? []) as R[],
          rowCount: res.rowCount ?? null,
        }
      },
    }
    return await fn(executor, { usedUnpooledConnection, diagnostics })
  } finally {
    await client.end().catch(() => undefined)
  }
}
