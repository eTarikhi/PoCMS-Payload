import type {
  DatabaseAdvisorReport,
  MissingFkIndexItem,
  SlowQueryItem,
  UnusedIndexItem,
} from '../shared'

import { quoteIdent, type SqlExecutor } from './connection'

function buildSafeIndexName(tableName: string, columnName: string): string {
  const raw = `idx_${tableName}_${columnName}`.replace(/[^A-Za-z0-9_]/g, '_')
  if (raw.length <= 60) return raw
  return raw.slice(0, 60)
}

/**
 * Detects foreign key columns in `public` that are not covered by the leading column(s)
 * of any valid PostgreSQL B-tree/hash index.
 */
export async function findMissingForeignKeyIndexes(
  executor: SqlExecutor,
): Promise<MissingFkIndexItem[]> {
  try {
    const res = await executor.query<{
      constraint_name: string
      table_name: string
      column_name: string
      ref_table: string
      row_estimate: string | number
    }>(`
      SELECT
        c.conname AS constraint_name,
        rel.relname AS table_name,
        att.attname AS column_name,
        refrel.relname AS ref_table,
        GREATEST(rel.reltuples, 0)::bigint AS row_estimate
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_class refrel ON refrel.oid = c.confrelid
      JOIN pg_attribute att
        ON att.attrelid = c.conrelid
       AND att.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND nsp.nspname = 'public'
        AND cardinality(c.conkey) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND i.indisvalid
            AND (i.indkey::int2[])[1] = c.conkey[1]
        )
      ORDER BY rel.reltuples DESC, rel.relname ASC, att.attname ASC
    `)

    return res.rows.map((r) => {
      const idxName = buildSafeIndexName(r.table_name, r.column_name)
      return {
        tableName: r.table_name,
        columnName: r.column_name,
        constraintName: r.constraint_name,
        referencedTable: r.ref_table,
        tableRowEstimate: Number(r.row_estimate ?? 0),
        suggestedIndexName: idxName,
        suggestedSql: `CREATE INDEX IF NOT EXISTS ${quoteIdent(idxName)} ON public.${quoteIdent(r.table_name)} (${quoteIdent(r.column_name)});`,
      }
    })
  } catch {
    return []
  }
}

export async function findUnusedIndexes(executor: SqlExecutor): Promise<UnusedIndexItem[]> {
  try {
    const res = await executor.query<{
      table_name: string
      index_name: string
      index_scans: string | number
      size_bytes: string | number
    }>(`
      SELECT
        s.relname AS table_name,
        s.indexrelname AS index_name,
        s.idx_scan AS index_scans,
        pg_relation_size(s.indexrelid)::bigint AS size_bytes
      FROM pg_stat_user_indexes s
      JOIN pg_index i ON i.indexrelid = s.indexrelid
      WHERE s.schemaname = 'public'
        AND NOT i.indisprimary
        AND NOT i.indisunique
        AND s.idx_scan = 0
        AND pg_relation_size(s.indexrelid) >= 16384
      ORDER BY pg_relation_size(s.indexrelid) DESC
      LIMIT 25
    `)

    return res.rows.map((r) => ({
      tableName: r.table_name,
      indexName: r.index_name,
      indexScans: Number(r.index_scans ?? 0),
      sizeBytes: Number(r.size_bytes ?? 0),
    }))
  } catch {
    return []
  }
}

export async function inspectSlowQueries(executor: SqlExecutor): Promise<{
  available: boolean
  items: SlowQueryItem[]
}> {
  try {
    const extRes = await executor.query<{ present: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      ) AS present
    `)
    if (!extRes.rows[0]?.present) {
      return { available: false, items: [] }
    }

    const res = await executor.query<{
      query: string
      calls: string | number
      total_time_ms: string | number
      mean_time_ms: string | number
      rows: string | number
    }>(`
      SELECT
        LEFT(REGEXP_REPLACE(query, '\\s+', ' ', 'g'), 280) AS query,
        calls::bigint AS calls,
        ROUND(total_exec_time::numeric, 2) AS total_time_ms,
        ROUND(mean_exec_time::numeric, 2) AS mean_time_ms,
        rows::bigint AS rows
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY total_exec_time DESC
      LIMIT 10
    `)

    return {
      available: true,
      items: res.rows.map((r) => ({
        query: r.query,
        calls: Number(r.calls ?? 0),
        totalTimeMs: Number(r.total_time_ms ?? 0),
        meanTimeMs: Number(r.mean_time_ms ?? 0),
        rows: Number(r.rows ?? 0),
      })),
    }
  } catch {
    return { available: false, items: [] }
  }
}

export async function countOrphanedMediaRecords(executor: SqlExecutor): Promise<number | null> {
  try {
    const existsRes = await executor.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'media'
      ) AS exists
    `)
    if (!existsRes.rows[0]?.exists) return null

    const fkRefsRes = await executor.query<{ table_name: string; column_name: string }>(`
      SELECT
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'media'
        AND ccu.column_name = 'id'
    `)

    if (fkRefsRes.rows.length === 0) return 0

    const notExistsClauses = fkRefsRes.rows.map(
      (ref) =>
        `NOT EXISTS (SELECT 1 FROM public.${quoteIdent(ref.table_name)} r WHERE r.${quoteIdent(ref.column_name)} = m."id")`,
    )

    const orphanRes = await executor.query<{ orphan_count: string | number }>(`
      SELECT COUNT(*)::int AS orphan_count
      FROM public."media" m
      WHERE ${notExistsClauses.join(' AND ')}
    `)
    return Number(orphanRes.rows[0]?.orphan_count ?? 0)
  } catch {
    return null
  }
}

export async function collectDatabaseAdvisorReport(
  executor: SqlExecutor,
): Promise<DatabaseAdvisorReport> {
  const [missingFkIndexes, unusedIndexes, slowStats, orphanedMediaCount] = await Promise.all([
    findMissingForeignKeyIndexes(executor),
    findUnusedIndexes(executor),
    inspectSlowQueries(executor),
    countOrphanedMediaRecords(executor),
  ])

  const recommendations: string[] = []
  if (missingFkIndexes.length > 0) {
    recommendations.push(
      `${missingFkIndexes.length} foreign-key column(s) lack a leading index — run "Create Missing FK Indexes" in Repair & Maintenance to speed up relational deletes and joins.`,
    )
  }
  if (unusedIndexes.length > 3) {
    recommendations.push(
      `${unusedIndexes.length} non-unique index(es) have 0 index scans since stats reset — review write amplification if tables grow large.`,
    )
  }
  if (typeof orphanedMediaCount === 'number' && orphanedMediaCount > 0) {
    recommendations.push(
      `${orphanedMediaCount} Media asset(s) are not referenced by any foreign key column (note: check Lexical rich-text inline blocks before deleting).`,
    )
  }
  if (!slowStats.available) {
    recommendations.push(
      'Optional extension pg_stat_statements is not active; enable CREATE EXTENSION IF NOT EXISTS pg_stat_statements for live query latency telemetry.',
    )
  }

  return {
    missingFkIndexes,
    unusedIndexes,
    pgStatStatementsAvailable: slowStats.available,
    slowQueries: slowStats.items,
    orphanedMediaCount,
    recommendations,
  }
}
