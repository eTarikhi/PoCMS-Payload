import type pg from 'pg'

import { databaseTarget, number } from './connection'

/**
 * How this Postgres server is configured, and how much of it this database is using.
 *
 * The questions this answers are the ones a database page otherwise cannot: *why did my query get
 * cancelled* (`statement_timeout`), *why does the connection pool refuse new clients*
 * (`max_connections` against the sessions actually open), *why is a sort spilling to disk*
 * (`work_mem`), *is this the pooled endpoint or the direct one* (a `-pooler` host, where the limits
 * below belong to the pooler's target and not to this connection).
 *
 * Everything is read from `pg_settings`, `pg_stat_activity` and `pg_stat_database`. Nothing is
 * changeable here — `ALTER SYSTEM` and `SET` are deliberately absent, because the interesting half
 * of these settings is that they belong to whoever operates the server (Neon's console, a managed
 * Postgres, a `postgresql.conf`), and a web page that could raise `max_connections` would be a
 * worse place to do it than the one that owns the machine.
 *
 * Values arrive the way Postgres stores them: `shared_buffers` in 8 kB blocks, timeouts in
 * milliseconds. `formatSetting` turns those into something a person reads, and it is a pure function
 * so the conversion itself can be tested without a server.
 */

export type ServerSetting = {
  name: string
  /** Postgres' own value, as `pg_settings.setting` gives it. */
  setting: string
  /** The same value in units a person reads (`5 minutes`, `128 MB`, `off`). */
  value: string
  unit: string | null
  /** `default`, `configuration file`, `environment variable`, `session`, … */
  source: string
  /** True when a change is waiting for a restart to take effect. */
  pendingRestart: boolean
  category: string
}

export type ConnectionBreakdown = {
  state: string
  count: number
}

export type ServerSettings = {
  version: string
  database: string
  /** Where this connection goes, without the credentials. */
  target: ReturnType<typeof databaseTarget>
  uptime: string | null
  settings: ServerSetting[]
  /** Settings asked for that this server does not report, so a card can say so instead of lying. */
  absent: string[]
  connections: {
    total: number
    max: number
    /** Slots kept for a superuser, which is why "max" is not the number an application may use. */
    superuserReserved: number
    available: number
    byState: ConnectionBreakdown[]
    byUser: { user: string; count: number }[]
    byApplication: { application: string; count: number }[]
    /** Sessions of *other* databases on this server, which share the same `max_connections`. */
    otherDatabases: number
  }
  /** Cumulative activity for this database, and the moment it started counting. */
  activity: {
    commits: number
    rollbacks: number
    rowsReturned: number
    rowsFetched: number
    tempFiles: number
    tempBytes: number
    deadlocks: number
    cacheHitRatio: number
    since: string | null
  }
}

/**
 * The settings worth showing, grouped the way the questions arrive. A server that does not have one
 * (an older Postgres, a managed one that hides it) is listed in `absent` rather than guessed at.
 */
export const SETTING_GROUPS: readonly { category: string; names: string[] }[] = [
  {
    category: 'Limits that cancel work',
    names: [
      'statement_timeout',
      'idle_in_transaction_session_timeout',
      'lock_timeout',
      'transaction_timeout',
    ],
  },
  {
    category: 'Connections',
    names: ['max_connections', 'superuser_reserved_connections', 'max_prepared_transactions'],
  },
  {
    category: 'Memory',
    names: ['shared_buffers', 'work_mem', 'maintenance_work_mem', 'effective_cache_size', 'temp_buffers'],
  },
  {
    category: 'Autovacuum',
    names: [
      'autovacuum',
      'autovacuum_max_workers',
      'autovacuum_naptime',
      'autovacuum_vacuum_scale_factor',
      'autovacuum_vacuum_threshold',
      'autovacuum_analyze_scale_factor',
      'autovacuum_analyze_threshold',
    ],
  },
  // `TimeZone` is the one setting Postgres spells in mixed case, and `pg_settings` is case-sensitive.
  { category: 'Server', names: ['server_version', 'server_encoding', 'TimeZone', 'data_directory'] },
]

/** Every setting name asked for, in the order the groups list them. */
export const SETTING_NAMES: readonly string[] = SETTING_GROUPS.flatMap((group) => group.names)

const categoryOf = (name: string): string =>
  SETTING_GROUPS.find((group) => group.names.includes(name))?.category ?? 'Server'

/** Bytes, in the units a person reads. */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}

/** Milliseconds, in the units a person reads — and `off` for the timeouts where 0 means no limit. */
export const formatDuration = (ms: number, zeroMeansOff = false): string => {
  if (!Number.isFinite(ms)) return ''
  if (ms === 0) return zeroMeansOff ? 'off (no limit)' : '0 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`
  const minutes = seconds / 60
  if (minutes < 60) return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} minutes`
  const hours = minutes / 60
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`
  return `${(hours / 24).toFixed(1)} days`
}

/** The timeouts for which Postgres' `0` means "never" rather than "immediately". */
const ZERO_MEANS_OFF = new Set([
  'statement_timeout',
  'idle_in_transaction_session_timeout',
  'lock_timeout',
  'transaction_timeout',
  'log_min_duration_statement',
])

/**
 * Postgres' stored value into something readable.
 *
 * `pg_settings.unit` says how to read `setting`: memory settings come in `8kB` blocks (the block
 * size, not bytes), `kB`, `MB` or `GB`; time settings in `ms`, `s`, `min` or `h`. A boolean arrives
 * as `on`/`off`, which is already readable.
 */
export const formatSetting = (
  name: string,
  setting: string,
  unit: string | null,
): string => {
  const raw = setting.trim()
  if (!unit) {
    if (raw === 'on' || raw === 'off' || raw === 'true' || raw === 'false') return raw
    return raw
  }

  const asNumber = Number(raw)
  if (!Number.isFinite(asNumber)) return `${raw} ${unit}`

  switch (unit) {
    case '8kB':
      return formatBytes(asNumber * 8 * 1024)
    case '16MB':
      return formatBytes(asNumber * 16 * 1024 * 1024)
    case 'kB':
      return formatBytes(asNumber * 1024)
    case 'MB':
      return formatBytes(asNumber * 1024 * 1024)
    case 'GB':
      return formatBytes(asNumber * 1024 * 1024 * 1024)
    case 'ms':
      return formatDuration(asNumber, ZERO_MEANS_OFF.has(name))
    case 's':
      return formatDuration(asNumber * 1000, ZERO_MEANS_OFF.has(name))
    case 'min':
      return formatDuration(asNumber * 60_000, ZERO_MEANS_OFF.has(name))
    case 'h':
      return formatDuration(asNumber * 3_600_000, ZERO_MEANS_OFF.has(name))
    case 'd':
      return formatDuration(asNumber * 86_400_000, ZERO_MEANS_OFF.has(name))
    default:
      return `${raw} ${unit}`
  }
}

/** One line explaining what a pooled connection string means for the numbers on this card. */
export const poolNote = (target: ReturnType<typeof databaseTarget>): string | null => {
  if (!target.pooled) return null
  return (
    'This connection goes through a pooler (a `-pooler` host), so the limits below are the ' +
    'server’s, and the sessions listed are the ones the pooler holds open — not the number of ' +
    'clients your application has. A direct connection (`DATABASE_DIRECT_URL`) sees its own.'
  )
}

/**
 * Read the server's settings and this database's share of it.
 *
 * Four queries, one after another (pg queues concurrent statements on a single client and warns
 * about it): the settings, the sessions of this database, the sessions of the others that share
 * `max_connections`, and the cumulative counters.
 */
export const serverSettings = async (client: pg.Client): Promise<ServerSettings> => {
  const settingsRows = await client.query<{
    name: string
    setting: string
    unit: string | null
    source: string
    pending_restart: boolean
  }>(
    `select name, setting, unit, source, pending_restart
       from pg_settings
      where name = any($1)
      order by name`,
    [[...SETTING_NAMES]],
  )

  const byName = new Map(settingsRows.rows.map((row) => [row.name, row]))
  const settings: ServerSetting[] = []
  const absent: string[] = []
  for (const name of SETTING_NAMES) {
    const row = byName.get(name)
    if (!row) {
      absent.push(name)
      continue
    }
    settings.push({
      name,
      setting: row.setting,
      value: formatSetting(name, row.setting, row.unit),
      unit: row.unit,
      source: row.source,
      pendingRestart: row.pending_restart === true,
      category: categoryOf(name),
    })
  }

  const version = await client.query<{ version: string; database: string; uptime: string }>(
    `select version() as version,
            current_database() as database,
            (now() - pg_postmaster_start_time())::text as uptime`,
  )

  // The coalesces below mean these three are never null, so the row type says so: a Map key that
  // could be null would make every reader of the breakdown defend against a case the SQL excludes.
  const own = await client.query<{ state: string; user: string; app: string; n: number }>(
    `select coalesce(state, 'background') as state,
            coalesce(usename, 'system') as "user",
            coalesce(nullif(application_name, ''), '(unnamed)') as app,
            count(*)::int as n
       from pg_stat_activity
      where datname = current_database()
      group by 1, 2, 3
      order by n desc`,
  )

  const elsewhere = await client.query<{ n: number }>(
    `select count(*)::int as n from pg_stat_activity
      where datname is not null and datname <> current_database()`,
  )

  const limits = await client.query<{ max_connections: number; reserved: number }>(
    `select (select setting::int from pg_settings where name = 'max_connections') as max_connections,
            (select coalesce(setting::int, 0) from pg_settings
              where name = 'superuser_reserved_connections') as reserved`,
  )

  const activity = await client.query<{
    commits: number
    rollbacks: number
    returned: number
    fetched: number
    temp_files: number
    temp_bytes: number
    deadlocks: number
    blks_hit: number
    blks_read: number
    since: string | null
  }>(
    `select coalesce(xact_commit, 0)::bigint as commits,
            coalesce(xact_rollback, 0)::bigint as rollbacks,
            coalesce(tup_returned, 0)::bigint as returned,
            coalesce(tup_fetched, 0)::bigint as fetched,
            coalesce(temp_files, 0)::bigint as temp_files,
            coalesce(temp_bytes, 0)::bigint as temp_bytes,
            coalesce(deadlocks, 0)::bigint as deadlocks,
            coalesce(blks_hit, 0)::bigint as blks_hit,
            coalesce(blks_read, 0)::bigint as blks_read,
            coalesce(stats_reset, pg_postmaster_start_time())::text as since
       from pg_stat_database
      where datname = current_database()`,
  )

  const stateCounts = new Map<string, number>()
  const userCounts = new Map<string, number>()
  const appCounts = new Map<string, number>()
  let total = 0
  for (const row of own.rows) {
    total += row.n
    stateCounts.set(row.state, (stateCounts.get(row.state) ?? 0) + row.n)
    userCounts.set(row.user, (userCounts.get(row.user) ?? 0) + row.n)
    appCounts.set(row.app, (appCounts.get(row.app) ?? 0) + row.n)
  }

  const max = number(limits.rows[0]?.max_connections)
  const reserved = number(limits.rows[0]?.reserved)
  const counters = activity.rows[0]
  const hit = number(counters?.blks_hit)
  const read = number(counters?.blks_read)
  const versionRow = version.rows[0]

  return {
    version: String(versionRow?.version ?? ''),
    database: String(versionRow?.database ?? ''),
    target: databaseTarget(),
    uptime: versionRow?.uptime ? String(versionRow.uptime) : null,
    settings,
    absent,
    connections: {
      total,
      max,
      superuserReserved: reserved,
      // The slots an ordinary role may actually use: the reserved ones are not available to it.
      available: Math.max(0, max - reserved - total),
      byState: [...stateCounts.entries()]
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state)),
      byUser: [...userCounts.entries()]
        .map(([user, count]) => ({ user, count }))
        .sort((a, b) => b.count - a.count || a.user.localeCompare(b.user)),
      byApplication: [...appCounts.entries()]
        .map(([application, count]) => ({ application, count }))
        .sort((a, b) => b.count - a.count || a.application.localeCompare(b.application)),
      otherDatabases: number(elsewhere.rows[0]?.n),
    },
    activity: {
      commits: number(counters?.commits),
      rollbacks: number(counters?.rollbacks),
      rowsReturned: number(counters?.returned),
      rowsFetched: number(counters?.fetched),
      tempFiles: number(counters?.temp_files),
      tempBytes: number(counters?.temp_bytes),
      deadlocks: number(counters?.deadlocks),
      cacheHitRatio: hit + read > 0 ? hit / (hit + read) : 0,
      since: counters?.since ? new Date(String(counters.since)).toISOString() : null,
    },
  }
}

/**
 * The two numbers that explain a cancelled query, in one sentence. `null` when neither is set, so a
 * card can stay quiet instead of saying "no limit" about a server it could not read.
 */
export const timeoutSummary = (settings: ServerSettings): string | null => {
  const statement = settings.settings.find((row) => row.name === 'statement_timeout')
  const idle = settings.settings.find((row) => row.name === 'idle_in_transaction_session_timeout')
  if (!statement && !idle) return null

  const parts: string[] = []
  if (statement) parts.push(`a statement is cancelled after ${statement.value}`)
  if (idle) parts.push(`an idle transaction is closed after ${idle.value}`)
  const joined = parts.join(', and ')
  const capped = parts.length > 0 && parts.every((part) => part.endsWith('(no limit)'))
  return capped
    ? 'No timeout is set: a runaway statement runs until something else stops it.'
    : `This server enforces ${joined}.`
}
