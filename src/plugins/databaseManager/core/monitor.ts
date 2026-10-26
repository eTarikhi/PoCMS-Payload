import type { Payload } from 'payload'

import type {
  ConnectionDiagnostics,
  DatabaseVitalStats,
  PayloadHygieneReport,
  SequenceHealthRow,
  TableHealthRow,
} from '../shared'

import {
  createPayloadSqlExecutor,
  quoteIdent,
  resolvePostgresUrls,
  type SqlExecutor,
} from './connection'

const toNum = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const toIsoOrNull = (value: unknown): string | null => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? value : d.toISOString()
  }
  return null
}

/**
 * Inspects every public table column backed by a serial or identity sequence and checks
 * whether `sequence.last_value` is aligned with `MAX(column)`.
 */
export async function inspectSequences(executor: SqlExecutor): Promise<SequenceHealthRow[]> {
  const candidatesRes = await executor.query<{
    table_name: string
    column_name: string
    seq_qualified: string
    seq_name: string
    last_value: string | number | null
  }>(`
    WITH cols AS (
      SELECT
        c.table_name,
        c.column_name,
        pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) AS seq_qualified
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
    )
    SELECT
      cols.table_name,
      cols.column_name,
      cols.seq_qualified,
      s.sequencename AS seq_name,
      s.last_value
    FROM cols
    JOIN pg_sequences s
      ON format('%I.%I', s.schemaname, s.sequencename) = cols.seq_qualified
      OR (s.schemaname = 'public' AND cols.seq_qualified = quote_ident(s.sequencename))
      OR split_part(cols.seq_qualified, '.', 2) = quote_ident(s.sequencename)
      OR split_part(cols.seq_qualified, '.', 2) = s.sequencename
    WHERE cols.seq_qualified IS NOT NULL
    ORDER BY cols.table_name, cols.column_name
  `)

  const results: SequenceHealthRow[] = []
  for (const row of candidatesRes.rows) {
    const tableIdent = quoteIdent(row.table_name)
    const colIdent = quoteIdent(row.column_name)
    const maxRes = await executor.query<{ max_id: string | number | null }>(
      `SELECT COALESCE(MAX(${colIdent}), 0)::bigint AS max_id FROM public.${tableIdent}`,
    )
    const maxId = toNum(maxRes.rows[0]?.max_id, 0)
    const lastValue = toNum(row.last_value, 0)
    const inSync = maxId === 0 || lastValue >= maxId

    results.push({
      tableName: row.table_name,
      columnName: row.column_name,
      sequenceName: row.seq_name,
      lastValue,
      maxId,
      inSync,
    })
  }

  return results
}

/**
 * Collects Tier-1 Standard PostgreSQL health, table bloat, sequence sync, and Payload hygiene metrics.
 */
export async function collectCorePostgresHealth(
  payload: Payload,
  options: {
    executor?: SqlExecutor | null
    env?: NodeJS.ProcessEnv
  } = {},
): Promise<{
  connection: ConnectionDiagnostics
  vitals: DatabaseVitalStats
  tables: TableHealthRow[]
  sequences: SequenceHealthRow[]
  hygiene: PayloadHygieneReport
}> {
  const env = options.env ?? process.env
  const { diagnostics: connection } = resolvePostgresUrls(env)

  const emptyHygiene: PayloadHygieneReport = {
    staleLocksCount: 0,
    failedJobsCount: 0,
    missingOrderRanks: [],
    outOfSyncSequencesCount: 0,
    bloatedTablesCount: 0,
  }

  if (!connection.configured && !options.executor) {
    return {
      connection,
      vitals: {
        status: 'not-configured',
        latencyMs: null,
        serverVersion: null,
        databaseSizeBytes: null,
        cacheHitRatio: null,
        transactionsCommitted: null,
        transactionsRolledBack: null,
        deadlocks: null,
        statsResetAt: null,
        connections: null,
        migrations: null,
        errorMessage: null,
      },
      tables: [],
      sequences: [],
      hygiene: emptyHygiene,
    }
  }

  const executor =
    options.executor !== undefined ? options.executor : createPayloadSqlExecutor(payload, env)

  if (!executor) {
    return {
      connection,
      vitals: {
        status: 'not-configured',
        latencyMs: null,
        serverVersion: null,
        databaseSizeBytes: null,
        cacheHitRatio: null,
        transactionsCommitted: null,
        transactionsRolledBack: null,
        deadlocks: null,
        statsResetAt: null,
        connections: null,
        migrations: null,
        errorMessage: null,
      },
      tables: [],
      sequences: [],
      hygiene: emptyHygiene,
    }
  }

  const startedAt = Date.now()
  try {
    const vitalsRes = await executor.query<{
      server_version: string
      db_size_bytes: string | number
      xact_commit: string | number
      xact_rollback: string | number
      deadlocks: string | number
      stats_reset: Date | string | null
      cache_hit_ratio: string | number
      max_connections: string | number
    }>(`
      SELECT
        version() AS server_version,
        pg_database_size(current_database())::bigint AS db_size_bytes,
        COALESCE(d.xact_commit, 0)::bigint AS xact_commit,
        COALESCE(d.xact_rollback, 0)::bigint AS xact_rollback,
        COALESCE(d.deadlocks, 0)::bigint AS deadlocks,
        d.stats_reset,
        CASE
          WHEN (COALESCE(d.blks_hit, 0) + COALESCE(d.blks_read, 0)) > 0
            THEN ROUND(
              (d.blks_hit::numeric / (d.blks_hit + d.blks_read)::numeric) * 100,
              2
            )
          ELSE 100
        END AS cache_hit_ratio,
        current_setting('max_connections')::int AS max_connections
      FROM pg_stat_database d
      WHERE d.datname = current_database()
      LIMIT 1
    `)
    const latencyMs = Date.now() - startedAt
    const vRow = vitalsRes.rows[0]

    const [activityRes, tablesRes] = await Promise.all([
      executor
        .query<{
          total: number | string
          active: number | string
          idle: number | string
          idle_in_tx: number | string
        }>(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE state = 'active')::int AS active,
            COUNT(*) FILTER (WHERE state = 'idle')::int AS idle,
            COUNT(*) FILTER (WHERE state LIKE 'idle in transaction%')::int AS idle_in_tx
          FROM pg_stat_activity
          WHERE datname = current_database()
        `)
        .catch(() => ({ rows: [] })),
      executor
        .query<{
          table_name: string
          live_rows: string | number
          dead_tuples: string | number
          table_bytes: string | number
          index_bytes: string | number
          total_bytes: string | number
          seq_scans: string | number
          idx_scans: string | number
          last_vacuum: Date | string | null
          last_autovacuum: Date | string | null
          last_analyze: Date | string | null
          last_autoanalyze: Date | string | null
        }>(`
          SELECT
            relname AS table_name,
            COALESCE(n_live_tup, 0)::bigint AS live_rows,
            COALESCE(n_dead_tup, 0)::bigint AS dead_tuples,
            pg_table_size(relid)::bigint AS table_bytes,
            pg_indexes_size(relid)::bigint AS index_bytes,
            pg_total_relation_size(relid)::bigint AS total_bytes,
            COALESCE(seq_scan, 0)::bigint AS seq_scans,
            COALESCE(idx_scan, 0)::bigint AS idx_scans,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze
          FROM pg_stat_user_tables
          WHERE schemaname = 'public'
          ORDER BY pg_total_relation_size(relid) DESC, relname ASC
        `)
        .catch(() => ({ rows: [] })),
    ])

    const tables: TableHealthRow[] = tablesRes.rows.map((r) => {
      const live = toNum(r.live_rows, 0)
      const dead = toNum(r.dead_tuples, 0)
      const denom = live + dead
      const bloatRatioPercent =
        denom > 0 ? Math.round((dead / denom) * 1000) / 10 : 0
      return {
        tableName: r.table_name,
        estimatedLiveRows: live,
        deadTuples: dead,
        bloatRatioPercent,
        tableBytes: toNum(r.table_bytes, 0),
        indexBytes: toNum(r.index_bytes, 0),
        totalBytes: toNum(r.total_bytes, 0),
        seqScans: toNum(r.seq_scans, 0),
        idxScans: toNum(r.idx_scans, 0),
        lastVacuum: toIsoOrNull(r.last_vacuum),
        lastAutovacuum: toIsoOrNull(r.last_autovacuum),
        lastAnalyze: toIsoOrNull(r.last_analyze),
        lastAutoanalyze: toIsoOrNull(r.last_autoanalyze),
      }
    })

    const tableNameSet = new Set(tables.map((t) => t.tableName))
    const sequences = await inspectSequences(executor).catch(() => [])

    // Migrations check
    let migrations: DatabaseVitalStats['migrations'] = null
    if (tableNameSet.has('payload_migrations')) {
      try {
        const migRes = await executor.query<{ count: string | number; latest: string | null }>(`
          SELECT
            COUNT(*)::int AS count,
            (SELECT name FROM public."payload_migrations" ORDER BY created_at DESC LIMIT 1) AS latest
          FROM public."payload_migrations"
        `)
        if (migRes.rows[0]) {
          migrations = {
            applied: toNum(migRes.rows[0].count, 0),
            latest: migRes.rows[0].latest ?? null,
          }
        }
      } catch {
        migrations = null
      }
    }

    // Payload Hygiene checks
    let staleLocksCount = 0
    if (tableNameSet.has('payload_locked_documents')) {
      try {
        const lockRes = await executor.query<{ cnt: string | number }>(`
          SELECT COUNT(*)::int AS cnt
          FROM public."payload_locked_documents"
          WHERE updated_at < NOW() - INTERVAL '2 hours'
        `)
        staleLocksCount = toNum(lockRes.rows[0]?.cnt, 0)
      } catch {
        staleLocksCount = 0
      }
    }

    let failedJobsCount = 0
    if (tableNameSet.has('payload_jobs')) {
      try {
        const jobRes = await executor.query<{ cnt: string | number }>(`
          SELECT COUNT(*)::int AS cnt
          FROM public."payload_jobs"
          WHERE has_error = true
        `)
        failedJobsCount = toNum(jobRes.rows[0]?.cnt, 0)
      } catch {
        failedJobsCount = 0
      }
    }

    const missingOrderRanks: PayloadHygieneReport['missingOrderRanks'] = []
    const orderableCollections = (payload?.config?.collections ?? []).filter(
      (c) => Boolean((c as { orderable?: boolean }).orderable),
    )
    for (const col of orderableCollections) {
      const candidateTable = col.slug.replace(/-/g, '_')
      if (!tableNameSet.has(candidateTable)) continue
      try {
        const orderRes = await executor.query<{ cnt: string | number }>(
          `SELECT COUNT(*)::int AS cnt FROM public.${quoteIdent(candidateTable)} WHERE "_order" IS NULL OR "_order" = ''`,
        )
        const cnt = toNum(orderRes.rows[0]?.cnt, 0)
        if (cnt > 0) {
          missingOrderRanks.push({
            collection: col.slug,
            tableName: candidateTable,
            missingCount: cnt,
          })
        }
      } catch {
        // Ignore if _order column does not exist on custom table name.
      }
    }

    const outOfSyncSequencesCount = sequences.filter((s) => !s.inSync).length
    const bloatedTablesCount = tables.filter(
      (t) => t.deadTuples >= 100 && t.bloatRatioPercent >= 15,
    ).length

    const aRow = activityRes.rows[0]
    const rawVersion = vRow?.server_version ?? null
    const serverVersion = rawVersion ? rawVersion.split(',')[0]?.trim() ?? rawVersion : null

    return {
      connection,
      vitals: {
        status: 'connected',
        latencyMs,
        serverVersion,
        databaseSizeBytes: vRow ? toNum(vRow.db_size_bytes, 0) : null,
        cacheHitRatio: vRow ? toNum(vRow.cache_hit_ratio, 100) : null,
        transactionsCommitted: vRow ? toNum(vRow.xact_commit, 0) : null,
        transactionsRolledBack: vRow ? toNum(vRow.xact_rollback, 0) : null,
        deadlocks: vRow ? toNum(vRow.deadlocks, 0) : null,
        statsResetAt: toIsoOrNull(vRow?.stats_reset),
        connections: aRow
          ? {
              total: toNum(aRow.total, 0),
              active: toNum(aRow.active, 0),
              idle: toNum(aRow.idle, 0),
              idleInTransaction: toNum(aRow.idle_in_tx, 0),
              maxConnections: vRow ? toNum(vRow.max_connections, 0) || null : null,
            }
          : null,
        migrations,
        errorMessage: null,
      },
      tables,
      sequences,
      hygiene: {
        staleLocksCount,
        failedJobsCount,
        missingOrderRanks,
        outOfSyncSequencesCount,
        bloatedTablesCount,
      },
    }
  } catch (error) {
    return {
      connection,
      vitals: {
        status: 'unreachable',
        latencyMs: Date.now() - startedAt,
        serverVersion: null,
        databaseSizeBytes: null,
        cacheHitRatio: null,
        transactionsCommitted: null,
        transactionsRolledBack: null,
        deadlocks: null,
        statsResetAt: null,
        connections: null,
        migrations: null,
        errorMessage: error instanceof Error ? error.message : 'Database query failed',
      },
      tables: [],
      sequences: [],
      hygiene: emptyHygiene,
    }
  }
}
