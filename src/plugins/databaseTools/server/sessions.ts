import type pg from 'pg'

import { DatabaseToolsError, number } from './connection'

/**
 * What Postgres is doing right now: connections, long-running statements, idle-in-transaction
 * sessions and who is blocking whom.
 *
 * Everything here reads `pg_stat_activity` and `pg_blocking_pids()` — the documented way to find a
 * blocker (`pg_blocking_pids(pid)` returns the PIDs holding a lock the session waits for). The two
 * actions map to the documented signalling functions:
 *
 *   - **cancel** (`pg_cancel_backend`) stops the running statement and keeps the connection. The
 *     client sees the error for that one query and can retry. This is the first move.
 *   - **terminate** (`pg_terminate_backend`) ends the session, rolling back its transaction and
 *     releasing its locks. It is the only move that helps an `idle in transaction` session, since
 *     there is no statement to cancel.
 *
 * Visibility is part of the result, not a surprise: a non-superuser only sees other roles' query
 * text as NULL unless it has `pg_read_all_stats`, and can only signal backends of its own role
 * unless it is a superuser. The page says which case it is in instead of showing empty rows.
 */

export type SessionInfo = {
  pid: number
  user: string | null
  application: string | null
  client: string | null
  /** active, idle, idle in transaction, idle in transaction (aborted), … */
  state: string
  /** `Lock: relation`, `IO: DataFileRead`, … or null when not waiting. */
  wait: string | null
  /** True for the session running this page's own query. Actions never target it. */
  own: boolean
  /** Seconds in the current state: since the query began, else since the transaction began. */
  seconds: number
  backendStartedAt: string | null
  queryStartedAt: string | null
  transactionStartedAt: string | null
  /** One line, capped — enough to recognise the statement without dumping the SQL. */
  query: string | null
  /** PIDs this session is waiting for. */
  blockedBy: number[]
}

export type SessionOverview = {
  role: string
  isSuperuser: boolean
  /** True when another role's query text is visible (`pg_read_all_stats` or superuser). */
  canSeeAllQueries: boolean
  sessions: SessionInfo[]
  active: number
  idle: number
  idleInTransaction: number
  blocked: number
  /** The statement that has been running longest, if it has been running for a while. */
  longest: { pid: number; seconds: number; query: string } | null
}

/** Long enough to be worth surfacing on the card. */
export const LONG_RUNNING_SECONDS = 30

const firstLine = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > 240 ? `${text.slice(0, 240)}…` : text
}

const iso = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(String(value)).toISOString()

/**
 * Read the sessions of this database.
 *
 * The page's own connection is included once, flagged `own`, so the table explains the connection
 * that is reading it; the actions refuse to target it. Rows are ordered so the interesting ones are
 * on top: blocked first, then active, then by age.
 */
export const listSessions = async (client: pg.Client): Promise<SessionOverview> => {
  const who = await client.query(
    `select
       current_user as role,
       r.rolsuper as superuser,
       r.rolsuper or pg_has_role(current_user, 'pg_read_all_stats', 'member') as sees_all
     from pg_roles r where r.rolname = current_user`,
  )
  const identity = who.rows[0] as
    | { role: string; superuser: boolean; sees_all: boolean }
    | undefined

  const { rows } = await client.query(`
    select
      a.pid,
      a.usename as "user",
      a.application_name as application,
      a.client_addr::text as client,
      a.state,
      case
        when a.wait_event_type is null then null
        else a.wait_event_type || coalesce(': ' || a.wait_event, '')
      end as wait,
      a.backend_type::text as backend_type,
      a.backend_start,
      a.query_start,
      a.xact_start,
      a.query,
      pg_blocking_pids(a.pid) as blocked_by,
      greatest(
        0,
        extract(epoch from (now() - coalesce(a.query_start, a.xact_start, a.backend_start)))
      )::int as seconds,
      a.pid = pg_backend_pid() as own
    from pg_stat_activity a
    where a.datname = current_database()
    order by
      (cardinality(pg_blocking_pids(a.pid)) > 0) desc,
      (a.state = 'active') desc,
      coalesce(a.query_start, a.xact_start, a.backend_start) asc
  `)

  const sessions = (rows as Record<string, unknown>[]).map<SessionInfo>((row) => ({
    pid: number(row.pid),
    user: row.user === null ? null : String(row.user),
    application: row.application === null ? null : String(row.application),
    client: row.client === null ? null : String(row.client),
    state: String(row.state ?? 'unknown'),
    wait: row.wait === null ? null : String(row.wait),
    own: row.own === true,
    seconds: number(row.seconds),
    backendStartedAt: iso(row.backend_start),
    queryStartedAt: iso(row.query_start),
    transactionStartedAt: iso(row.xact_start),
    query: firstLine(row.query),
    blockedBy: Array.isArray(row.blocked_by) ? (row.blocked_by as number[]).map(Number) : [],
  }))

  const active = sessions.filter((session) => session.state === 'active' && !session.own)
  const longest = active
    .filter((session) => session.seconds >= LONG_RUNNING_SECONDS)
    .sort((a, b) => b.seconds - a.seconds)[0]

  return {
    role: String(identity?.role ?? 'unknown'),
    isSuperuser: identity?.superuser === true,
    canSeeAllQueries: identity?.sees_all === true,
    sessions,
    active: active.length,
    idle: sessions.filter((session) => session.state === 'idle').length,
    idleInTransaction: sessions.filter((session) => session.state.startsWith('idle in transaction'))
      .length,
    blocked: sessions.filter((session) => session.blockedBy.length > 0).length,
    longest: longest
      ? { pid: longest.pid, seconds: longest.seconds, query: longest.query ?? '' }
      : null,
  }
}

/** A target the actions may signal. Anything else is refused with a sentence, not an SQL error. */
const targetSession = async (
  client: pg.Client,
  pid: unknown,
): Promise<{ pid: number; own: boolean; state: string; user: string | null; backendType: string }> => {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    throw new DatabaseToolsError('That is not a session id.')
  }
  const { rows } = await client.query(
    `select
       a.pid,
       a.pid = pg_backend_pid() as own,
       a.state,
       a.usename as "user",
       a.backend_type::text as backend_type,
       a.datname = current_database() as same_database
     from pg_stat_activity a
     where a.pid = $1`,
    [pid],
  )
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row || row.same_database !== true) {
    throw new DatabaseToolsError(
      'There is no session with that id in this database. It may have ended — reload the page.',
    )
  }
  if (row.own === true) {
    throw new DatabaseToolsError(
      'That is this page’s own connection. Reload instead: cancelling it would end the page.',
    )
  }
  return {
    pid,
    own: false,
    state: String(row.state),
    user: row.user === null ? null : String(row.user),
    backendType: String(row.backend_type),
  }
}

const signal = async (
  client: pg.Client,
  pid: number,
  action: 'cancel' | 'terminate',
): Promise<boolean> => {
  const fn = action === 'cancel' ? 'pg_cancel_backend' : 'pg_terminate_backend'
  const { rows } = await client.query(`select ${fn}($1) as ok`, [pid])
  return (rows[0] as { ok: boolean | null } | undefined)?.ok === true
}

/**
 * Stop the statement a session is running, keeping its connection. Refused for a session that is
 * not running one: `idle in transaction` has nothing to cancel, and only terminating helps.
 */
export const cancelQuery = async (client: pg.Client, pid: unknown): Promise<void> => {
  const target = await targetSession(client, pid)
  if (target.backendType !== 'client backend') {
    throw new DatabaseToolsError('That is a background process, not a session. Nothing to cancel.')
  }
  if (target.state !== 'active') {
    throw new DatabaseToolsError(
      `That session is “${target.state}” — it is not running a statement. Terminate it if it is holding a transaction open.`,
    )
  }
  if (!(await signal(client, target.pid, 'cancel'))) {
    throw new DatabaseToolsError(
      'Postgres refused the cancel. The connection role can only signal sessions of its own role; a superuser can signal the rest.',
    )
  }
}

/** End a session: roll back its transaction, release its locks, close its connection. */
export const terminateSession = async (client: pg.Client, pid: unknown): Promise<void> => {
  const target = await targetSession(client, pid)
  if (target.backendType !== 'client backend') {
    throw new DatabaseToolsError(
      'That is a background process, not a session. Terminating it would stop part of the server.',
    )
  }
  if (!(await signal(client, target.pid, 'terminate'))) {
    throw new DatabaseToolsError(
      'Postgres refused the termination. The connection role can only signal sessions of its own role; a superuser can signal the rest.',
    )
  }
}
