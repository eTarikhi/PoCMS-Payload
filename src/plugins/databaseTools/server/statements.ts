import type pg from 'pg'

import { number } from './connection'

/**
 * The statements this server has actually run, ranked by what they cost.
 *
 * `pg_stat_statements` is the only place Postgres keeps that history: every distinct normalised
 * statement with its call count, total and mean execution time, rows and block hits. It answers the
 * questions a slow admin panel turns into — *which query is the expensive one*, *is it called a lot
 * or slow once*, *does it ever hit the cache* — and it answers them across restarts of the
 * application, because the counters live in the server.
 *
 * It is an extension, and it only records when it is in `shared_preload_libraries`, which needs a
 * restart and is a setting the operator owns: Neon offers it (enable `pg_stat_statements` in the
 * project settings), most managed Postgres do, a bare local install usually does not. So this module
 * spends its first query finding out, and says so plainly when the answer is no — an empty table
 * would be a lie about the database rather than about the extension.
 *
 * Column names changed in PostgreSQL 13 (`total_time` → `total_exec_time`, `mean_time` →
 * `mean_exec_time`), so the query is built from the columns the view actually has. That choice is a
 * pure function of the catalog, which is why it can be tested without a server that has the
 * extension installed.
 *
 * Query text arrives normalised by Postgres itself: literals are already `$1`, `$2`, so nothing here
 * sees — or logs — the values anybody queried. Text is still truncated to one readable line, because
 * a generated statement can be kilobytes of column list.
 */

export type StatementRow = {
  /** The normalised statement, on one line and truncated. */
  query: string
  calls: number
  totalTimeMs: number
  meanTimeMs: number
  maxTimeMs: number
  minTimeMs: number | null
  rows: number
  /** Shared block hits over hits+reads: how much of it came from cache. */
  cacheHitRatio: number | null
  /** Bytes of temp file a statement wrote, when the server tracks it. */
  tempBytes: number | null
  user: string | null
  database: string | null
}

export type StatementReport = {
  available: boolean
  /** Why it is not, and what would make it so. */
  hint: string | null
  extension: {
    /** Installed in this database (`pg_extension`). */
    installed: boolean
    /** Loaded at server start, without which the view exists but stays empty. */
    preloaded: boolean
    /** Offered by this server's build, so it could be installed. */
    available: boolean
    version: string | null
  }
  since: string | null
  totals: { statements: number; calls: number; timeMs: number } | null
  /** The same rows, three ways round. */
  byTotalTime: StatementRow[]
  byMeanTime: StatementRow[]
  byCalls: StatementRow[]
  countedAt: string
}

/** How many statements each ranking carries. */
export const TOP_STATEMENTS = 15

/** Long enough to recognise a statement, short enough for a card. */
export const QUERY_PREVIEW_LENGTH = 220

/** The columns PostgreSQL 13 renamed, with their older names. */
const TIME_COLUMNS: Record<string, string> = {
  total_exec_time: 'total_time',
  mean_exec_time: 'mean_time',
  max_exec_time: 'max_time',
  min_exec_time: 'min_time',
  stddev_exec_time: 'stddev_time',
}

/**
 * Collapse a statement to one readable line: whitespace runs become single spaces, a trailing
 * semicolon goes, and the rest is cut at `QUERY_PREVIEW_LENGTH` with an ellipsis. Pure, so the
 * truncation cannot be a surprise in a test.
 */
export const normaliseQuery = (text: string, limit = QUERY_PREVIEW_LENGTH): string => {
  // Collapse first, then strip the semicolon *and* the whitespace around it: a statement that ends
  // in `\n;` would otherwise keep a trailing space and read like a truncation.
  const oneLine = text.replace(/\s+/g, ' ').replace(/[\s;]+$/, '').replace(/^[\s;]+/, '')
  if (oneLine.length <= limit) return oneLine
  // Cut on a word boundary where there is one, so the preview does not end mid-identifier.
  const cut = oneLine.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut}…`
}

/**
 * Which time columns this server's view has.
 *
 * PostgreSQL 13 renamed them; a query written for one version fails on the other with
 * `column "total_exec_time" does not exist`, which reads like a bug in this code rather than a
 * version difference.
 */
export const timeColumnsFor = (available: string[]): Record<string, string> => {
  const columns = new Set(available)
  const chosen: Record<string, string> = {}
  for (const [modern, legacy] of Object.entries(TIME_COLUMNS)) {
    if (columns.has(modern)) chosen[modern] = modern
    else if (columns.has(legacy)) chosen[modern] = legacy
  }
  return chosen
}

/**
 * The report to give when the extension cannot answer.
 *
 * Two different situations, two different sentences: not installed at all, and installed but not
 * loaded at server start (where the view exists and stays empty, which is the confusing one).
 */
export const unavailabilityHint = ({
  installed,
  preloaded,
  available,
}: {
  installed: boolean
  preloaded: boolean
  available: boolean
}): string => {
  if (installed && !preloaded) {
    return (
      'pg_stat_statements is installed in this database but not loaded when the server started, so ' +
      'the view is empty. It has to be in shared_preload_libraries — a restart-level setting the ' +
      'operator owns (on Neon, the project’s extension settings; elsewhere, postgresql.conf).'
    )
  }
  if (!installed && available) {
    return (
      'pg_stat_statements is not installed here. `CREATE EXTENSION pg_stat_statements` needs the ' +
      'server to load it at start, so this is an operator change, not a database one — and on a ' +
      'managed server it is a console setting.'
    )
  }
  return (
    'This server does not offer pg_stat_statements, so there is no statement history to read. ' +
    'The query plan of one statement (the Plan button beside a table) and the sessions card are ' +
    'what is available instead.'
  )
}

/**
 * Read the statement history, or explain why there is none.
 *
 * Three queries when it is there: what the view has, the extension's state, and the rows. One when
 * it is not — the availability check runs first and the ranking is skipped entirely, because a query
 * against a view that does not exist is an error, not an empty list.
 */
export const statementReport = async (
  client: pg.Client,
  options: { limit?: number } = {},
): Promise<StatementReport> => {
  const limit = Math.max(1, Math.min(options.limit ?? TOP_STATEMENTS, 100))
  const countedAt = new Date().toISOString()

  const state = await client.query<{
    installed: number
    version: string | null
    offered: number
    preloaded: string | null
    view: number
  }>(`select (select count(*)::int from pg_extension where extname = 'pg_stat_statements') as installed,
            (select extversion from pg_extension where extname = 'pg_stat_statements' limit 1) as version,
            (select count(*)::int from pg_available_extensions where name = 'pg_stat_statements') as offered,
            (select setting from pg_settings where name = 'shared_preload_libraries') as preloaded,
            (select count(*)::int from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'pg_stat_statements') as view`)

  const row = state.rows[0]
  const installed = number(row?.installed) > 0
  const offered = number(row?.offered) > 0
  const viewExists = number(row?.view) > 0
  const preloadedLibraries = String(row?.preloaded ?? '')
  const preloaded = preloadedLibraries
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .includes('pg_stat_statements')

  const extension = {
    installed,
    preloaded,
    available: offered,
    version: row?.version ? String(row.version) : null,
  }

  // Installed but not loaded means the view exists and never fills: same answer, different reason.
  if (!installed || !viewExists || !preloaded) {
    return {
      available: false,
      hint: unavailabilityHint({ installed, preloaded, available: offered }),
      extension,
      since: null,
      totals: null,
      byTotalTime: [],
      byMeanTime: [],
      byCalls: [],
      countedAt,
    }
  }

  const columns = await client.query<{ name: string }>(
    `select a.attname as name
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'pg_stat_statements' and a.attnum > 0`,
  )
  const time = timeColumnsFor(columns.rows.map((column) => column.name))
  const total = time.total_exec_time ?? 'total_time'
  const mean = time.mean_exec_time ?? 'mean_time'
  const max = time.max_exec_time ?? 'max_time'
  const min = time.min_exec_time ?? 'min_time'
  const hasTemp = columns.rows.some((column) => column.name === 'temp_blks_written')
  const hasUserId = columns.rows.some((column) => column.name === 'userid')

  const rows = await client.query<Record<string, unknown>>(
    `select s.query,
            s.calls::bigint as calls,
            s.${total}::double precision as total_time,
            s.${mean}::double precision as mean_time,
            s.${max}::double precision as max_time,
            ${min ? `s.${min}::double precision as min_time,` : 'null::double precision as min_time,'}
            s.rows::bigint as rows,
            (s.shared_blks_hit + s.shared_blks_read) as blocks,
            s.shared_blks_hit::bigint as hits,
            ${hasTemp ? 's.temp_blks_written::bigint as temp_blocks,' : 'null::bigint as temp_blocks,'}
            ${hasUserId ? 'r.rolname as "user",' : 'null::text as "user",'}
            d.datname as database
       from pg_stat_statements s
       left join pg_database d on d.oid = s.dbid
       ${hasUserId ? 'left join pg_roles r on r.oid = s.userid' : ''}
      order by s.${total} desc
      limit $1`,
    [limit * 4],
  )

  const totals = await client.query<{ statements: number; calls: number; time: number; reset: string | null }>(
    `select count(*)::int as statements,
            coalesce(sum(s.calls), 0)::bigint as calls,
            coalesce(sum(s.${total}), 0)::double precision as time,
            (select stats_reset::text from pg_stat_statements_info limit 1) as reset
       from pg_stat_statements s`,
  ).catch(() => ({
    rows: [{ statements: 0, calls: 0, time: 0, reset: null }] as {
      statements: number
      calls: number
      time: number
      reset: string | null
    }[],
  }))

  const statements: StatementRow[] = rows.rows.map((statement) => {
    const blocks = number(statement.blocks)
    const hits = number(statement.hits)
    return {
      query: normaliseQuery(String(statement.query ?? '')),
      calls: number(statement.calls),
      totalTimeMs: Number(statement.total_time ?? 0),
      meanTimeMs: Number(statement.mean_time ?? 0),
      maxTimeMs: Number(statement.max_time ?? 0),
      minTimeMs: statement.min_time === null ? null : Number(statement.min_time),
      rows: number(statement.rows),
      cacheHitRatio: blocks > 0 ? hits / blocks : null,
      tempBytes: statement.temp_blocks === null ? null : number(statement.temp_blocks) * 8 * 1024,
      user: statement.user === null ? null : String(statement.user),
      database: statement.database === null ? null : String(statement.database),
    }
  })

  const by = (compare: (a: StatementRow, b: StatementRow) => number): StatementRow[] =>
    [...statements].sort(compare).slice(0, limit)

  const totalRow = totals.rows[0]

  return {
    available: true,
    hint: null,
    extension,
    since: totalRow?.reset ? new Date(String(totalRow.reset)).toISOString() : null,
    totals: {
      statements: number(totalRow?.statements),
      calls: number(totalRow?.calls),
      timeMs: Number(totalRow?.time ?? 0),
    },
    byTotalTime: by((a, b) => b.totalTimeMs - a.totalTimeMs),
    byMeanTime: by((a, b) => b.meanTimeMs - a.meanTimeMs),
    byCalls: by((a, b) => b.calls - a.calls),
    countedAt,
  }
}

/** Milliseconds, in the units a card reads. */
export const formatMs = (ms: number): string => {
  if (!Number.isFinite(ms)) return ''
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  return `${(seconds / 60).toFixed(1)} min`
}
