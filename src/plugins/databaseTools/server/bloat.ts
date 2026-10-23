import type pg from 'pg'

import { number } from './connection'

/**
 * Bloat and vacuum health: how much of each table is dead rows, and when autovacuum will come.
 *
 * Postgres never updates a row in place. An `UPDATE` writes a new tuple and leaves the old one for
 * the vacuum to collect, so a table that is written a lot grows a tail of dead tuples that occupy
 * disk, slow sequential scans and — once they are a large enough share of the table — hold back the
 * planner's estimates until an `ANALYZE` refreshes them. Autovacuum does this automatically, on a
 * trigger most people have never read:
 *
 *     threshold + scale_factor × reltuples
 *
 * with `threshold` 50 and `scale_factor` 0.2 by default. So a table of 1 000 rows is vacuumed after
 * 250 dead tuples, and a table of 10 million after 2 million — which is why a hot table is often
 * given a per-table override (a smaller factor, or `autovacuum_vacuum_insert_scale_factor` for
 * append-only ones). `reloptions` below is where such an override lives, and the page's *Tune
 * autovacuum* action writes it.
 *
 * What this does **not** do is measure bloat exactly. That needs `pgstattuple`, which is a
 * superuser-only extension and not installed on most managed Postgres (Neon does not offer it), so
 * the estimate here is the arithmetic one: dead tuples times the table's average tuple width. It is
 * a size, not a promise — free space inside a page and fragmented indexes are not counted — and every
 * number carries `estimated: true` to say so. The exact columns (`n_dead_tup`, the vacuum
 * timestamps, `n_mod_since_analyze`) come from `pg_stat_user_tables` and are not estimates.
 */

export type TableBloat = {
  name: string
  /** Rows the planner believes are live (`reltuples`), and the tuples the statistics count. */
  liveTuples: number
  deadTuples: number
  /** Dead over live+dead, 0..1. */
  deadRatio: number
  tableBytes: number
  indexBytes: number
  totalBytes: number
  /** Dead tuples × the table's average tuple width. An estimate, never a measurement. */
  estimatedBloatBytes: number
  estimated: boolean
  lastVacuum: string | null
  lastAutovacuum: string | null
  lastAnalyze: string | null
  lastAutoanalyze: string | null
  vacuumCount: number
  autovacuumCount: number
  analyzeCount: number
  autoanalyzeCount: number
  /** Writes since the last ANALYZE: what makes the planner's estimates go stale. */
  modificationsSinceAnalyze: number
  /** Dead tuples at which autovacuum would fire for this table, with its own overrides applied. */
  autovacuumTrigger: number
  dueForVacuum: boolean
  dueForAnalyze: boolean
  /** Never vacuumed by anything, and big enough to matter. */
  neverVacuumed: boolean
  /** Per-table `autovacuum_*` overrides, as Postgres stores them (`{key=value,…}`). */
  reloptions: Record<string, string>
  /** Seconds since the most recent vacuum of either kind, or null when there never was one. */
  secondsSinceVacuum: number | null
}

export type AutovacuumConfig = {
  enabled: boolean
  maxWorkers: number
  naptime: string | null
  vacuumScaleFactor: number
  vacuumThreshold: number
  analyzeScaleFactor: number
  analyzeThreshold: number
  vacuumCostDelay: number | null
  vacuumCostLimit: number | null
  vacuumInsertScaleFactor: number | null
  vacuumInsertThreshold: number | null
}

export type BloatReport = {
  tables: TableBloat[]
  totals: {
    tables: number
    deadTuples: number
    estimatedBloatBytes: number
    dueForVacuum: number
    dueForAnalyze: number
    neverVacuumed: number
    withOverrides: number
  }
  autovacuum: AutovacuumConfig
  /** True when `pgstattuple` is installed, so an exact measurement would be possible. */
  exactMeasurementAvailable: boolean
  countedAt: string
}

/** How many tables the report carries: enough to act on, not enough to page through. */
export const MAX_BLOAT_TABLES = 60

/** Below this many bytes a table's bloat is not worth a row on the card, whatever its ratio. */
export const SMALL_TABLE_BYTES = 64 * 1024

const iso = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(String(value)).toISOString()

/**
 * Dead tuples × average tuple width.
 *
 * The width is the heap's own: `pg_relation_size / reltuples`. When the planner has no estimate yet
 * (`reltuples` is 0 or −1, which is what an unanalyzed table holds) there is no width to multiply
 * by, so the answer is 0 and `estimated` stays honest about it — guessing a width would invent a
 * number that looks like a measurement.
 */
export const estimateBloatBytes = ({
  heapBytes,
  liveTuples,
  deadTuples,
}: {
  heapBytes: number
  liveTuples: number
  deadTuples: number
}): number => {
  if (deadTuples <= 0) return 0
  if (liveTuples <= 0 || heapBytes <= 0) return 0
  const averageWidth = heapBytes / liveTuples
  if (!Number.isFinite(averageWidth) || averageWidth <= 0) return 0
  return Math.round(deadTuples * averageWidth)
}

/**
 * Where autovacuum's trigger sits for one table, and how many dead tuples that is.
 *
 * A per-table override wins over the server setting, which is the whole reason overrides exist.
 * Both the `autovacuum_vacuum_threshold` and `autovacuum_vacuum_scale_factor` names are accepted,
 * as Postgres stores them in `pg_class.reloptions`.
 */
export const autovacuumTriggerFor = ({
  liveTuples,
  threshold,
  scaleFactor,
  reloptions = {},
}: {
  liveTuples: number
  threshold: number
  scaleFactor: number
  reloptions?: Record<string, string>
}): number => {
  const ownThreshold = Number(reloptions.autovacuum_vacuum_threshold)
  const ownScale = Number(reloptions.autovacuum_vacuum_scale_factor)
  const effectiveThreshold = Number.isFinite(ownThreshold) ? ownThreshold : threshold
  const effectiveScale = Number.isFinite(ownScale) ? ownScale : scaleFactor
  const tuples = Math.max(0, liveTuples)
  return Math.round(effectiveThreshold + effectiveScale * tuples)
}

/** `n_mod_since_analyze` against the analyze trigger, the same arithmetic with its own setting. */
export const analyzeTriggerFor = ({
  liveTuples,
  threshold,
  scaleFactor,
  reloptions = {},
}: {
  liveTuples: number
  threshold: number
  scaleFactor: number
  reloptions?: Record<string, string>
}): number => {
  const ownThreshold = Number(reloptions.autovacuum_analyze_threshold)
  const ownScale = Number(reloptions.autovacuum_analyze_scale_factor)
  const effectiveThreshold = Number.isFinite(ownThreshold) ? ownThreshold : threshold
  const effectiveScale = Number.isFinite(ownScale) ? ownScale : scaleFactor
  return Math.round(effectiveThreshold + effectiveScale * Math.max(0, liveTuples))
}

/** `{autovacuum_vacuum_scale_factor=0.01,fillfactor=90}` → an object, with the noise left out. */
export const parseReloptions = (raw: string | null): Record<string, string> => {
  if (!raw) return {}
  const text = raw.trim()
  if (!text.startsWith('{') || !text.endsWith('}')) return {}
  const options: Record<string, string> = {}
  for (const entry of text.slice(1, -1).split(',')) {
    const at = entry.indexOf('=')
    if (at <= 0) continue
    options[entry.slice(0, at).trim()] = entry.slice(at + 1).trim()
  }
  return options
}

/** Only the autovacuum-related overrides, which is what the card acts on. */
export const autovacuumOptions = (reloptions: Record<string, string>): Record<string, string> => {
  const own: Record<string, string> = {}
  for (const [key, value] of Object.entries(reloptions)) {
    if (key.startsWith('autovacuum_')) own[key] = value
  }
  return own
}

const BLOAT_QUERY = `
  select c.relname as name,
         c.reltuples::bigint as reltuples,
         coalesce(s.n_live_tup, 0)::bigint as live_tup,
         coalesce(s.n_dead_tup, 0)::bigint as dead_tup,
         coalesce(s.n_mod_since_analyze, 0)::bigint as mod_since_analyze,
         pg_relation_size(c.oid)::bigint as table_bytes,
         pg_indexes_size(c.oid)::bigint as index_bytes,
         pg_total_relation_size(c.oid)::bigint as total_bytes,
         c.reloptions::text as reloptions,
         s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze,
         coalesce(s.vacuum_count, 0)::bigint as vacuum_count,
         coalesce(s.autovacuum_count, 0)::bigint as autovacuum_count,
         coalesce(s.analyze_count, 0)::bigint as analyze_count,
         coalesce(s.autoanalyze_count, 0)::bigint as autoanalyze_count,
         -- greatest() ignores NULLs, so a table never vacuumed yields NULL here rather than the
         -- -infinity sentinel that now() minus a timestamp would refuse to subtract.
         extract(epoch from now() - greatest(coalesce(s.last_vacuum, s.last_autovacuum),
                                             coalesce(s.last_autovacuum, s.last_vacuum)))::bigint
           as seconds_since_vacuum
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
   where n.nspname = 'public' and c.relkind = 'r'
   order by coalesce(s.n_dead_tup, 0) desc, pg_total_relation_size(c.oid) desc
   limit $1`

const SETTINGS_QUERY = `
  select (select setting from pg_settings where name = 'autovacuum') as enabled,
         (select coalesce(setting::int, 3) from pg_settings where name = 'autovacuum_max_workers') as workers,
         (select setting from pg_settings where name = 'autovacuum_naptime') as naptime,
         (select coalesce(setting::real, 0.2) from pg_settings where name = 'autovacuum_vacuum_scale_factor') as vac_scale,
         (select coalesce(setting::int, 50) from pg_settings where name = 'autovacuum_vacuum_threshold') as vac_threshold,
         (select coalesce(setting::real, 0.1) from pg_settings where name = 'autovacuum_analyze_scale_factor') as ana_scale,
         (select coalesce(setting::int, 50) from pg_settings where name = 'autovacuum_analyze_threshold') as ana_threshold,
         (select setting::real from pg_settings where name = 'autovacuum_vacuum_cost_delay') as cost_delay,
         (select setting::int from pg_settings where name = 'autovacuum_vacuum_cost_limit') as cost_limit,
         (select setting::real from pg_settings where name = 'autovacuum_vacuum_insert_scale_factor') as insert_scale,
         (select setting::int from pg_settings where name = 'autovacuum_vacuum_insert_threshold') as insert_threshold`

/**
 * Read the bloat of every user table, worst first.
 *
 * Read-only: `pg_stat_user_tables` and the size functions, nothing that touches a table's rows. The
 * maintenance action beside this card (`VACUUM (ANALYZE)`) is the part that does, and it lives in
 * `maintenance.ts` where its own guards are.
 */
export const bloatReport = async (
  client: pg.Client,
  options: { limit?: number } = {},
): Promise<BloatReport> => {
  const limit = Math.max(1, Math.min(options.limit ?? MAX_BLOAT_TABLES, 500))

  const rows = await client.query<Record<string, unknown>>(BLOAT_QUERY, [limit])
  const settings = (await client.query<Record<string, unknown>>(SETTINGS_QUERY)).rows[0]

  // Whether an exact measurement is even possible, so the card can say which kind of number it shows.
  const exact = await client
    .query<{ n: number }>(
      `select count(*)::int as n from pg_available_extensions where name = 'pgstattuple'`,
    )
    .catch(() => ({ rows: [{ n: 0 }] }))

  const autovacuum: AutovacuumConfig = {
    enabled: String(settings?.enabled ?? 'off') === 'on',
    maxWorkers: number(settings?.workers),
    naptime: settings?.naptime ? String(settings.naptime) : null,
    vacuumScaleFactor: Number(settings?.vac_scale ?? 0.2),
    vacuumThreshold: number(settings?.vac_threshold) || 50,
    analyzeScaleFactor: Number(settings?.ana_scale ?? 0.1),
    analyzeThreshold: number(settings?.ana_threshold) || 50,
    vacuumCostDelay: settings?.cost_delay === null ? null : Number(settings?.cost_delay),
    vacuumCostLimit: settings?.cost_limit === null ? null : number(settings?.cost_limit),
    vacuumInsertScaleFactor:
      settings?.insert_scale === null ? null : Number(settings?.insert_scale),
    vacuumInsertThreshold: settings?.insert_threshold === null ? null : number(settings?.insert_threshold),
  }

  const tables: TableBloat[] = rows.rows.map((row) => {
    const reloptions = parseReloptions(row.reloptions === null ? null : String(row.reloptions))
    const liveTuples = number(row.live_tup)
    const deadTuples = number(row.dead_tup)
    const tableBytes = number(row.table_bytes)
    const indexBytes = number(row.index_bytes)
    const totalBytes = number(row.total_bytes)
    const trigger = autovacuumTriggerFor({
      liveTuples,
      threshold: autovacuum.vacuumThreshold,
      scaleFactor: autovacuum.vacuumScaleFactor,
      reloptions,
    })
    const analyzeTrigger = analyzeTriggerFor({
      liveTuples,
      threshold: autovacuum.analyzeThreshold,
      scaleFactor: autovacuum.analyzeScaleFactor,
      reloptions,
    })
    const vacuumed =
      number(row.vacuum_count) + number(row.autovacuum_count) +
      (row.last_vacuum ? 1 : 0) + (row.last_autovacuum ? 1 : 0)
    const secondsSinceVacuum = row.seconds_since_vacuum === null ? null : number(row.seconds_since_vacuum)

    return {
      name: String(row.name),
      liveTuples,
      deadTuples,
      deadRatio: liveTuples + deadTuples > 0 ? deadTuples / (liveTuples + deadTuples) : 0,
      tableBytes,
      indexBytes,
      totalBytes,
      estimatedBloatBytes: estimateBloatBytes({ heapBytes: tableBytes, liveTuples, deadTuples }),
      estimated: true,
      lastVacuum: iso(row.last_vacuum),
      lastAutovacuum: iso(row.last_autovacuum),
      lastAnalyze: iso(row.last_analyze),
      lastAutoanalyze: iso(row.last_autoanalyze),
      vacuumCount: number(row.vacuum_count),
      autovacuumCount: number(row.autovacuum_count),
      analyzeCount: number(row.analyze_count),
      autoanalyzeCount: number(row.autoanalyze_count),
      modificationsSinceAnalyze: number(row.mod_since_analyze),
      autovacuumTrigger: trigger,
      dueForVacuum: autovacuum.enabled && deadTuples >= trigger && deadTuples > 0,
      dueForAnalyze: autovacuum.enabled && number(row.mod_since_analyze) >= analyzeTrigger,
      neverVacuumed: vacuumed === 0 && totalBytes > SMALL_TABLE_BYTES,
      reloptions: autovacuumOptions(reloptions),
      secondsSinceVacuum:
        secondsSinceVacuum === null || !Number.isFinite(secondsSinceVacuum) || secondsSinceVacuum < 0
          ? null
          : secondsSinceVacuum,
    }
  })

  return {
    tables,
    totals: {
      tables: tables.length,
      deadTuples: tables.reduce((sum, table) => sum + table.deadTuples, 0),
      estimatedBloatBytes: tables.reduce((sum, table) => sum + table.estimatedBloatBytes, 0),
      dueForVacuum: tables.filter((table) => table.dueForVacuum).length,
      dueForAnalyze: tables.filter((table) => table.dueForAnalyze).length,
      neverVacuumed: tables.filter((table) => table.neverVacuumed).length,
      withOverrides: tables.filter((table) => Object.keys(table.reloptions).length > 0).length,
    },
    autovacuum,
    exactMeasurementAvailable: number(exact.rows[0]?.n) > 0,
    countedAt: new Date().toISOString(),
  }
}

/** One line for a table, in the shape the maintenance card and a log want. */
export const describeTable = (table: TableBloat): string => {
  const dead = `${table.deadTuples.toLocaleString('en')} dead of ${(table.liveTuples + table.deadTuples).toLocaleString('en')}`
  const vacuum = table.lastVacuum ?? table.lastAutovacuum
  return `${table.name}: ${dead}${vacuum ? `, last vacuum ${new Date(vacuum).toISOString().slice(0, 10)}` : ', never vacuumed'}`
}
