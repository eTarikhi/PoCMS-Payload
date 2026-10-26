import type { ReadOnlyQueryResult } from '../shared'

import {
  withDirectPostgresClient,
  type DirectClientRunner,
  type SqlExecutor,
} from './connection'
import { splitSqlStatements } from './formats'

const ALLOWED_LEADING_KEYWORDS = /^(SELECT|WITH|EXPLAIN|SHOW|TABLE)\b/i

const FORBIDDEN_WRITE_OR_ADMIN_TOKENS =
  /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|REINDEX|CLUSTER|LOCK|COMMENT|SECURITY\s+LABEL|REFRESH\s+MATERIALIZED|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink)\b/i

const REDACTED_RESULT_COLUMNS = new Set([
  'hash',
  'salt',
  'reset_password_token',
  'api_key',
  'api_key_index',
])

/**
 * Strips single-quoted strings and comments so keyword scanning only inspects actual SQL tokens
 * (so `SELECT 'DROP TABLE' AS example` is allowed while `WITH d AS (DELETE FROM x) SELECT * FROM d` is blocked).
 */
function stripStringLiteralsAndComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
}

export function validateReadOnlySql(rawSql: string): string {
  const trimmed = rawSql.trim()
  if (!trimmed) {
    throw new Error('Enter a SQL query to execute.')
  }
  if (trimmed.length > 20_000) {
    throw new Error('SQL query exceeds the 20,000-character diagnostic limit.')
  }

  const statements = splitSqlStatements(trimmed)
  if (statements.length === 0) {
    throw new Error('SQL query contains only comments or whitespace.')
  }
  if (statements.length > 1) {
    throw new Error(
      'Only a single read-only SQL statement may be executed at a time (multi-statement queries are blocked).',
    )
  }

  const single = statements[0]!
  const unquoted = stripStringLiteralsAndComments(single).trim()

  if (!ALLOWED_LEADING_KEYWORDS.test(unquoted)) {
    throw new Error(
      'Only read-only SELECT, WITH, EXPLAIN, SHOW, or TABLE queries are permitted in the SQL Inspector.',
    )
  }

  if (FORBIDDEN_WRITE_OR_ADMIN_TOKENS.test(unquoted)) {
    throw new Error(
      'Mutating or administrative SQL keywords (INSERT/UPDATE/DELETE/DDL/file functions) are blocked in the Read-Only SQL Inspector.',
    )
  }

  if (/^\s*EXPLAIN\b[^;]*\bANALYZE\b/i.test(unquoted) && FORBIDDEN_WRITE_OR_ADMIN_TOKENS.test(unquoted)) {
    throw new Error('EXPLAIN ANALYZE on mutating queries is forbidden.')
  }

  return single
}

function normalizeRowCells(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (REDACTED_RESULT_COLUMNS.has(k.toLowerCase()) && v !== null && v !== undefined) {
      out[k] = '[REDACTED]'
      continue
    }
    if (v instanceof Date) {
      out[k] = v.toISOString()
    } else if (typeof v === 'bigint') {
      const n = Number(v)
      out[k] = Number.isSafeInteger(n) ? n : v.toString()
    } else if (Buffer.isBuffer(v)) {
      out[k] = `<bytea ${v.length}B>`
    } else {
      out[k] = v
    }
  }
  return out
}

/**
 * Executes a read-only diagnostic SQL query protected by 3 independent layers:
 *   1. Single-statement AST/token allowlist (`SELECT` / `WITH` / `EXPLAIN` / `SHOW` / `TABLE`)
 *   2. PostgreSQL kernel `BEGIN READ ONLY` + `SET LOCAL statement_timeout = '8000ms'` + `ROLLBACK`
 *   3. Row cap (`maxRows`, default 250, max 1000) + automatic auth-hash column masking
 */
export async function executeReadOnlyDiagnosticQuery(
  rawSql: string,
  options: {
    explain?: boolean
    maxRows?: number
    timeoutMs?: number
    env?: NodeJS.ProcessEnv
    executor?: SqlExecutor | null
    directRunner?: DirectClientRunner
  } = {},
): Promise<ReadOnlyQueryResult> {
  const validatedSql = validateReadOnlySql(rawSql)
  const maxRows = Math.max(1, Math.min(1000, options.maxRows ?? 250))
  const timeoutMs = Math.max(500, Math.min(20_000, options.timeoutMs ?? 8_000))
  const isAlreadyExplain = /^\s*EXPLAIN\b/i.test(validatedSql)
  const explainMode = Boolean(options.explain) || isAlreadyExplain

  const finalSql =
    options.explain && !isAlreadyExplain
      ? `EXPLAIN (VERBOSE, COSTS, FORMAT TEXT) ${validatedSql}`
      : validatedSql

  const runOnExecutor = async (exec: SqlExecutor): Promise<ReadOnlyQueryResult> => {
    const started = Date.now()
    await exec.query('BEGIN READ ONLY')
    try {
      await exec.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`)
      const res = await exec.query<Record<string, unknown>>(finalSql)
      const durationMs = Date.now() - started

      const allRows = res.rows ?? []
      const truncated = allRows.length > maxRows
      const sliced = (truncated ? allRows.slice(0, maxRows) : allRows).map((r) =>
        normalizeRowCells(r),
      )

      const columns =
        sliced[0] !== undefined
          ? Object.keys(sliced[0])
          : allRows[0] !== undefined
            ? Object.keys(allRows[0])
            : []

      return {
        columns,
        rows: sliced,
        rowCount: sliced.length,
        truncated,
        durationMs,
        explainMode,
        executedSql: finalSql,
      }
    } finally {
      await exec.query('ROLLBACK').catch(() => undefined)
    }
  }

  if (options.executor) {
    return runOnExecutor(options.executor)
  }

  const runner = options.directRunner ?? withDirectPostgresClient
  return runner(
    async (exec) => runOnExecutor(exec),
    { env: options.env ?? process.env, preferUnpooled: false, statementTimeoutMs: timeoutMs },
  )
}
