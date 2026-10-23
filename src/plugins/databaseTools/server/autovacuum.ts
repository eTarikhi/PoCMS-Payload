import type pg from 'pg'

import { DatabaseToolsError, quoteIdent, quoteTable } from './connection'
import { requireTable } from './introspection'
import { parseReloptions } from './bloat'

/**
 * Per-table autovacuum overrides: `ALTER TABLE … SET (autovacuum_*)`.
 *
 * Autovacuum's server-wide trigger is `threshold + scale_factor × rows`, with defaults (50 and 0.2)
 * chosen for an average table. They are wrong for two kinds of table in opposite directions:
 *
 *   - A **hot** table — a queue, a session store, a counter — reaches 20 % dead long after it has
 *     stopped being useful, so it wants a *smaller* factor (`0.01`) and often a smaller cost delay,
 *     which lets its vacuum run more eagerly without waiting for the global naptime to matter.
 *   - An **append-only** table — an audit log, an analytics event — is never updated, so it is never
 *     vacuumed by the delete-driven trigger at all, and its indexes still need the insert-driven one
 *     (`autovacuum_vacuum_insert_scale_factor`).
 *
 * Changing the server setting for one table's sake is not an option on a managed database, and would
 * be wrong anyway; `ALTER TABLE … SET (…)` is per-table, takes effect immediately, needs no restart,
 * and is visible in `pg_class.reloptions` — which is where the bloat card reads it back from.
 *
 * This is the only part of the database tools that writes DDL, so it is built to be boring:
 *
 *   - The parameter names come from `AUTOVACUUM_PARAMETERS` below. Nothing else is accepted, so no
 *     request can reach `SET (session_authorization = …)` or anything else a reloption can carry.
 *   - The values are parsed as numbers or booleans and re-rendered from the parsed value. The string
 *     a caller sent never reaches the statement, so there is nothing to inject into it.
 *   - The table is resolved through the catalog first (`resolveTable`), so the identifier in the
 *     statement is one Postgres already has, quoted by the same helper the rest of the plugin uses.
 *   - `RESET` is offered beside `SET`, because an override somebody forgets is a table that behaves
 *     unlike every other table for no reason anyone can remember.
 */

export type AutovacuumParameterKind = 'boolean' | 'integer' | 'real'

export type AutovacuumParameter = {
  name: string
  kind: AutovacuumParameterKind
  min?: number
  max?: number
  /** What it does, in one line — the form shows it beside the field. */
  description: string
  /** The server-wide default, so a form can say what "no override" means. */
  serverDefault?: string
}

/**
 * The storage parameters this tool will set.
 *
 * Exactly the `autovacuum_*` reloptions PostgreSQL documents for a table, plus
 * `log_autovacuum_min_duration`, which is the one non-`autovacuum_` reloption that exists to make
 * autovacuum's work visible. Bounds are Postgres' own.
 */
export const AUTOVACUUM_PARAMETERS: readonly AutovacuumParameter[] = [
  {
    name: 'autovacuum_enabled',
    kind: 'boolean',
    description:
      'Whether the autovacuum daemon touches this table at all. Off means this table is never vacuumed automatically — a decision, not a default.',
    serverDefault: 'on',
  },
  {
    name: 'autovacuum_vacuum_threshold',
    kind: 'integer',
    min: 0,
    description:
      'Dead tuples that do not count toward the scale factor: the trigger is this plus the factor times the table’s rows.',
    serverDefault: '50',
  },
  {
    name: 'autovacuum_vacuum_scale_factor',
    kind: 'real',
    min: 0,
    max: 100,
    description:
      'Share of the table’s rows that may be dead before a vacuum starts. Lower for a table written often.',
    serverDefault: '0.2',
  },
  {
    name: 'autovacuum_vacuum_insert_threshold',
    kind: 'integer',
    min: -1,
    description:
      'Inserted tuples that trigger a vacuum of a table nothing deletes from. −1 disables it.',
    serverDefault: '1000',
  },
  {
    name: 'autovacuum_vacuum_insert_scale_factor',
    kind: 'real',
    min: 0,
    max: 100,
    description:
      'Share of the table’s rows that may be newly inserted before an insert-driven vacuum starts.',
    serverDefault: '0.2',
  },
  {
    name: 'autovacuum_analyze_threshold',
    kind: 'integer',
    min: 0,
    description: 'Modified rows that do not count toward the analyze factor.',
    serverDefault: '50',
  },
  {
    name: 'autovacuum_analyze_scale_factor',
    kind: 'real',
    min: 0,
    max: 100,
    description:
      'Share of the table’s rows that may be modified before the planner’s statistics are refreshed.',
    serverDefault: '0.1',
  },
  {
    name: 'autovacuum_vacuum_cost_delay',
    kind: 'real',
    min: -1,
    max: 100,
    description:
      'Milliseconds this table’s vacuum sleeps at each cost limit. Lower is faster and heavier on I/O; −1 means the server setting.',
    serverDefault: '2',
  },
  {
    name: 'autovacuum_vacuum_cost_limit',
    kind: 'integer',
    min: -1,
    max: 10_000,
    description: 'Cost points this table’s vacuum may spend before it pauses. −1 means the server setting.',
    serverDefault: '-1',
  },
  {
    name: 'autovacuum_freeze_max_age',
    kind: 'integer',
    min: 100_000,
    max: 2_000_000_000,
    description:
      'Transaction age at which this table is vacuumed to prevent wraparound, whatever else is going on.',
    serverDefault: '200000000',
  },
  {
    name: 'log_autovacuum_min_duration',
    kind: 'integer',
    min: -1,
    description:
      'Log an autovacuum of this table when it takes at least this many milliseconds. −1 logs none, 0 logs all.',
    serverDefault: '-1 (server setting)',
  },
]

/** Names this tool will set, as a set: the allow-list is the whole defence. */
export const AUTOVACUUM_PARAMETER_NAMES: readonly string[] = AUTOVACUUM_PARAMETERS.map(
  (parameter) => parameter.name,
)

const byName = new Map(AUTOVACUUM_PARAMETERS.map((parameter) => [parameter.name, parameter]))

export type ValidatedSettings = Record<string, string>

export type ValidationResult =
  | { ok: true; settings: ValidatedSettings; unknown: string[] }
  | { ok: false; error: string; hint?: string }

const renderBoolean = (raw: string): string | null => {
  const value = raw.trim().toLowerCase()
  if (['true', 'on', 'yes', '1'].includes(value)) return 'true'
  if (['false', 'off', 'no', '0'].includes(value)) return 'false'
  return null
}

/**
 * Check one value against its parameter's kind and bounds, and return it rendered from the parsed
 * number or boolean — never the string that arrived.
 */
export const validateValue = (
  parameter: AutovacuumParameter,
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } => {
  const text = String(raw ?? '').trim()
  if (!text) return { ok: false, error: `${parameter.name} needs a value.` }

  if (parameter.kind === 'boolean') {
    const value = renderBoolean(text)
    if (value === null) {
      return { ok: false, error: `${parameter.name} takes true or false, not “${text.slice(0, 20)}”.` }
    }
    return { ok: true, value }
  }

  const parsed = Number(text)
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `${parameter.name} takes a number, not “${text.slice(0, 20)}”.` }
  }
  if (parameter.kind === 'integer' && !Number.isInteger(parsed)) {
    return { ok: false, error: `${parameter.name} takes a whole number, not ${text}.` }
  }
  if (parameter.min !== undefined && parsed < parameter.min) {
    return { ok: false, error: `${parameter.name} cannot be below ${parameter.min}.` }
  }
  if (parameter.max !== undefined && parsed > parameter.max) {
    return { ok: false, error: `${parameter.name} cannot be above ${parameter.max}.` }
  }
  return { ok: true, value: String(parsed) }
}

/**
 * Validate a settings object from a request body.
 *
 * A name outside the allow-list is not an error but a report: the form may send a field this version
 * does not know, and refusing the whole request over it would be worse than setting what it can and
 * naming what it left. A *bad value* for a known name is an error, because that is a mistake the
 * caller needs to see.
 */
export const validateSettings = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      error: 'settings must be an object of autovacuum parameter names and values.',
      hint: `For example { "autovacuum_vacuum_scale_factor": 0.01 }. The names are: ${AUTOVACUUM_PARAMETER_NAMES.slice(0, 4).join(', ')}…`,
    }
  }

  const settings: ValidatedSettings = {}
  const unknown: string[] = []

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const name = key.trim().toLowerCase()
    // An empty value means "leave this one alone", which is how a form with untouched fields sends.
    if (value === null || value === undefined || String(value).trim() === '') continue

    const parameter = byName.get(name)
    if (!parameter) {
      unknown.push(name)
      continue
    }
    const validated = validateValue(parameter, value)
    if (!validated.ok) {
      return {
        ok: false,
        error: validated.error,
        hint: parameter.description,
      }
    }
    settings[parameter.name] = validated.value
  }

  return { ok: true, settings, unknown }
}

/**
 * The `SET (…)` or `RESET (…)` clause for a validated set of settings.
 *
 * Built from the validated values, so the only text in the statement is a name from the allow-list
 * and a number or boolean this module rendered itself.
 */
export const alterClause = (settings: ValidatedSettings): string =>
  Object.entries(settings)
    .map(([name, value]) => `${quoteIdent(name)} = ${value}`)
    .join(', ')

/** The whole statement, for a log line and for the audit record. */
export const alterStatement = (
  table: string,
  settings: ValidatedSettings,
  mode: 'set' | 'reset' = 'set',
): string =>
  mode === 'set'
    ? `ALTER TABLE ${quoteTable(table)} SET (${alterClause(settings)});`
    : `ALTER TABLE ${quoteTable(table)} RESET (${Object.keys(settings)
        .map((name) => quoteIdent(name))
        .join(', ')});`

export type TableAutovacuum = {
  table: string
  /** Every reloption on the table, not only the autovacuum ones (`fillfactor` shows up here too). */
  reloptions: Record<string, string>
  /** The autovacuum ones, which is what this tool sets and resets. */
  autovacuum: ValidatedSettings
  /** What the trigger is for this table, with its overrides applied. */
  liveTuples: number
  deadTuples: number
  vacuumTrigger: number
  analyzeTrigger: number
}

/** What a table's own overrides are, and what they move the triggers to. */
export const readTableAutovacuum = async (
  client: pg.Client,
  tableName: string,
): Promise<TableAutovacuum> => {
  // Resolved through the catalog first: the identifier in the statement below is then one Postgres
  // already has, and a name that is not a table is refused here rather than by the ALTER.
  const table = await requireTable(client, tableName)
  const { rows } = await client.query<{ reloptions: string | null; live: number; dead: number }>(
    `select c.reloptions::text as reloptions,
            coalesce(s.n_live_tup, 0)::bigint as live,
            coalesce(s.n_dead_tup, 0)::bigint as dead
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_stat_user_tables s on s.relid = c.oid
      where n.nspname = 'public' and c.relname = $1`,
    [table.name],
  )

  const row = rows[0]
  if (!row) {
    throw new DatabaseToolsError(
      `There is no table called “${tableName}” in this database.`,
      'The table list on this page is read from the catalog a moment ago; refresh it.',
    )
  }

  const reloptions = parseReloptions(row.reloptions)
  const autovacuum: ValidatedSettings = {}
  for (const [name, value] of Object.entries(reloptions)) {
    if (byName.has(name)) autovacuum[name] = value
  }

  // The server-wide settings, so the triggers below mean the same thing the bloat card says.
  const server = await client.query<{
    vac_threshold: number
    vac_scale: number
    ana_threshold: number
    ana_scale: number
  }>(
    `select coalesce((select setting::int from pg_settings where name = 'autovacuum_vacuum_threshold'), 50) as vac_threshold,
            coalesce((select setting::real from pg_settings where name = 'autovacuum_vacuum_scale_factor'), 0.2) as vac_scale,
            coalesce((select setting::int from pg_settings where name = 'autovacuum_analyze_threshold'), 50) as ana_threshold,
            coalesce((select setting::real from pg_settings where name = 'autovacuum_analyze_scale_factor'), 0.1) as ana_scale`,
  )
  const config = server.rows[0]
  const own = (name: string, fallback: number): number => {
    const value = Number(autovacuum[name])
    return Number.isFinite(value) ? value : fallback
  }
  const live = Number(row.live)

  return {
    table: table.name,
    reloptions,
    autovacuum,
    liveTuples: live,
    deadTuples: Number(row.dead),
    vacuumTrigger: Math.round(
      own('autovacuum_vacuum_threshold', Number(config?.vac_threshold ?? 50)) +
        own('autovacuum_vacuum_scale_factor', Number(config?.vac_scale ?? 0.2)) * live,
    ),
    analyzeTrigger: Math.round(
      own('autovacuum_analyze_threshold', Number(config?.ana_threshold ?? 50)) +
        own('autovacuum_analyze_scale_factor', Number(config?.ana_scale ?? 0.1)) * live,
    ),
  }
}

export type AutovacuumResult = {
  table: string
  statements: string[]
  /** The overrides after the change, read back from the catalog rather than assumed. */
  reloptions: Record<string, string>
  autovacuum: ValidatedSettings
  vacuumTrigger: number
  analyzeTrigger: number
  /** Parameter names the request sent that this tool does not set. */
  unknown: string[]
}

/**
 * Set or reset a table's autovacuum overrides, and read the catalog back afterwards.
 *
 * `ALTER TABLE … SET (reloption)` takes a brief `ACCESS EXCLUSIVE` lock — long enough to rewrite a
 * catalog row, not long enough to matter for a table nobody is waiting on, and it never rewrites the
 * table's data. Reading `reloptions` back is the part that makes the result trustworthy: what the
 * statement asked for and what Postgres stored are usually the same, and when they are not (a name
 * this version spells differently, a value it rounded) the card shows what is true.
 */
export const applyAutovacuum = async (
  client: pg.Client,
  tableName: string,
  settings: ValidatedSettings,
  options: { mode?: 'set' | 'reset' } = {},
): Promise<AutovacuumResult> => {
  const mode = options.mode ?? 'set'
  const names = Object.keys(settings)
  if (names.length === 0) {
    throw new DatabaseToolsError(
      'There is nothing to change: no autovacuum parameter was given a value.',
      'Set a value for at least one parameter, or name one to reset.',
    )
  }
  for (const name of names) {
    if (!byName.has(name)) {
      throw new DatabaseToolsError(
        `“${name}” is not an autovacuum parameter this tool sets.`,
        `The names it sets are: ${AUTOVACUUM_PARAMETER_NAMES.join(', ')}.`,
      )
    }
  }

  const table = await requireTable(client, tableName)
  // A reset only needs the names; a set needs the validated values, re-checked here so a caller
  // that built the object by hand cannot smuggle an unvalidated string into the statement.
  const clause =
    mode === 'set'
      ? alterClause(validateOrThrow(settings))
      : names.map((name) => quoteIdent(name)).join(', ')
  const statement =
    mode === 'set'
      ? `ALTER TABLE ${quoteTable(table.name)} SET (${clause})`
      : `ALTER TABLE ${quoteTable(table.name)} RESET (${clause})`

  await client.query(statement)
  const after = await readTableAutovacuum(client, table.name)

  return {
    table: table.name,
    statements: [`${statement};`],
    reloptions: after.reloptions,
    autovacuum: after.autovacuum,
    vacuumTrigger: after.vacuumTrigger,
    analyzeTrigger: after.analyzeTrigger,
    unknown: [],
  }
}

/** The last line of defence: values reaching the statement are ones this module validated. */
const validateOrThrow = (settings: ValidatedSettings): ValidatedSettings => {
  const result = validateSettings(settings)
  if (!result.ok) {
    throw new DatabaseToolsError(result.error, result.hint)
  }
  return result.settings
}

/** One line describing an override, for a log and an audit record. */
export const describeSettings = (settings: ValidatedSettings): string =>
  Object.entries(settings)
    .map(([name, value]) => `${name} = ${value}`)
    .join(', ')
