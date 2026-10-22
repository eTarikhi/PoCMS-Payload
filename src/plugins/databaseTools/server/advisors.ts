import type pg from 'pg'

import { number } from './connection'

/**
 * What the catalog says about the indexes, for a human to decide about.
 *
 * Three findings are worth surfacing, and each is hedged the way the statistics deserve:
 *
 *   - **Never scanned.** `pg_stat_user_indexes.idx_scan = 0`, on a table that *has* been read, and
 *     not backing a constraint (a unique index still earns its keep by refusing duplicates). The
 *     counters start when the statistics were last reset, so the report returns that moment and the
 *     page says "since then" rather than claiming the index has never been used.
 *   - **Duplicated.** Two indexes with the same key columns, operator classes and options, neither
 *     partial nor expression-based: the second one only costs writes. Nothing is dropped here.
 *   - **Invalid.** A failed `CREATE INDEX CONCURRENTLY` leaves an index the planner cannot use; the
 *     maintenance card already rebuilds them, and listing them here is how it is noticed.
 *
 * Sizes are the reason the page can rank them: an unused 8 kB index is noise, an unused 8 MB one is
 * a decision. Like the rest of the plugin this is read-only — dropping an index is not a maintenance
 * action, it is a schema change with a migration behind it.
 */

export type IndexFinding = {
  table: string
  index: string
  bytes: number
  scans: number
}

export type DuplicateIndexes = {
  table: string
  /** The index that would stay: the first by name, so the report is stable between refreshes. */
  kept: string
  /** The ones with the same definition. */
  redundant: string[]
  bytes: number
}

export type IndexReport = {
  total: number
  /** Tables that have at least one index. */
  tables: number
  /** When Postgres last reset the statistics the scan counts come from. */
  since: string | null
  unused: IndexFinding[]
  duplicates: DuplicateIndexes[]
  invalid: IndexFinding[]
  /** The biggest indexes, scanned or not, so the card is useful on a fresh database too. */
  largest: IndexFinding[]
}

export const indexReport = async (client: pg.Client): Promise<IndexReport> => {
  // Serial on one connection: pg queues concurrent queries on a client and warns about it.
  // User indexes only: the catalog's own indexes are not the admin's to weigh.
  const totals = await client.query<{ total: number; tables: number }>(
    `select count(*)::int as total, count(distinct relid)::int as tables from pg_stat_user_indexes`,
  )

  // The reset time keeps "never scanned" honest: the counters are only as old as this.
  // Counters also start over when the server restarts, so fall back to the postmaster's start.
  const reset = await client
    .query<{ at: Date | null }>(
      `select coalesce(pg_stat_get_db_stat_reset_time(oid), pg_postmaster_start_time()) as at
         from pg_database where datname = current_database()`,
    )
    .catch(() => ({ rows: [] as { at: Date | null }[] }))

  const unused = await client.query<Record<string, unknown>>(
    `select u.relname as table_name,
            i.relname as index_name,
            pg_relation_size(s.indexrelid)::bigint as bytes,
            s.idx_scan::bigint as scans
       from pg_stat_user_indexes s
       join pg_class i on i.oid = s.indexrelid
       join pg_index x on x.indexrelid = s.indexrelid
       join pg_class u on u.oid = s.relid
       join pg_stat_user_tables t on t.relid = s.relid
       left join pg_constraint c on c.conindid = s.indexrelid
      where x.indisvalid and not x.indisprimary
        and s.idx_scan = 0
        and c.conindid is null
        -- The table has to have been read: 0 scans on an untouched table says nothing.
        and (t.seq_scan + t.idx_scan) > 0
      order by bytes desc
      -- A page shows the biggest few; the rest are counted, not silently dropped.
      limit 200`,
  )

  const invalid = await client.query<Record<string, unknown>>(
    `select t.relname as table_name,
            i.relname as index_name,
            pg_relation_size(x.indexrelid)::bigint as bytes,
            0::bigint as scans
       from pg_index x
       join pg_class i on i.oid = x.indexrelid
       join pg_class t on t.oid = x.indrelid
       join pg_namespace n on n.oid = t.relnamespace
      where not x.indisvalid and n.nspname = 'public'
      order by bytes desc
      limit 20`,
  )

  const duplicates = await client.query<{
    table_name: string
    indexes: string[]
    bytes: number
  }>(
    `select t.relname as table_name,
            array_agg(i.relname::text order by i.relname) as indexes,
            min(pg_relation_size(x.indexrelid))::bigint as bytes
       from pg_index x
       join pg_class i on i.oid = x.indexrelid
       join pg_class t on t.oid = x.indrelid
      where x.indisvalid
        and not x.indisprimary
        and x.indexprs is null
        and x.indpred is null
      group by t.relname, x.indkey::text, x.indclass::text, x.indoption::text, x.indnkeyatts
     having count(*) > 1
      order by bytes desc
      limit 20`,
  )

  const largest = await client.query<Record<string, unknown>>(
    `select s.relname as table_name,
            i.relname as index_name,
            pg_relation_size(s.indexrelid)::bigint as bytes,
            s.idx_scan::bigint as scans
       from pg_stat_user_indexes s
       join pg_class i on i.oid = s.indexrelid
      order by bytes desc
      limit 8`,
  )

  const toFinding = (row: Record<string, unknown>): IndexFinding => ({
    table: String(row.table_name),
    index: String(row.index_name),
    bytes: number(row.bytes),
    scans: number(row.scans),
  })

  return {
    total: number((totals.rows[0] as { total: unknown }).total),
    tables: number((totals.rows[0] as { tables: unknown }).tables),
    since: reset.rows[0]?.at ? new Date(reset.rows[0].at).toISOString() : null,
    unused: unused.rows.map(toFinding),
    invalid: invalid.rows.map(toFinding),
    duplicates: duplicates.rows.map((row) => ({
      table: row.table_name,
      kept: row.indexes[0],
      redundant: row.indexes.slice(1),
      bytes: number(row.bytes),
    })),
    largest: largest.rows.map(toFinding),
  }
}
