import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pgClientOptions } from '@/lib/database-readiness'
import {
  alterClause,
  alterStatement,
  applyAutovacuum,
  AUTOVACUUM_PARAMETER_NAMES,
  AUTOVACUUM_PARAMETERS,
  describeSettings,
  readTableAutovacuum,
  validateSettings,
  validateValue,
} from '@/plugins/databaseTools/server/autovacuum'

/**
 * Per-table autovacuum overrides: the only write in the database tools that is DDL.
 *
 * Everything that decides *what may be sent* is a pure function and is tested as one, because that is
 * the whole defence: the parameter names come from an allow-list, the values are parsed and
 * re-rendered from the parsed number or boolean, and the table is resolved through the catalog
 * before it is quoted into a statement. The live tests then prove the statement Postgres accepts is
 * the one intended, and that what comes back is read from `pg_class.reloptions` afterwards rather
 * than assumed from the request.
 */

const SCRATCH = 'tuning_scratch'

describe('the allow-list', () => {
  it('is only autovacuum parameters, each with a kind and a description', () => {
    expect(AUTOVACUUM_PARAMETER_NAMES.length).toBeGreaterThan(5)
    expect(new Set(AUTOVACUUM_PARAMETER_NAMES).size).toBe(AUTOVACUUM_PARAMETER_NAMES.length)
    for (const parameter of AUTOVACUUM_PARAMETERS) {
      // The one exception is the reloption that exists to make autovacuum visible in the log.
      expect(
        parameter.name.startsWith('autovacuum_') || parameter.name === 'log_autovacuum_min_duration',
      ).toBe(true)
      expect(['boolean', 'integer', 'real']).toContain(parameter.kind)
      expect(parameter.description.length).toBeGreaterThan(20)
    }
  })

  it('carries the bounds Postgres documents, so a nonsense value is refused here', () => {
    const factor = AUTOVACUUM_PARAMETERS.find(
      (parameter) => parameter.name === 'autovacuum_vacuum_scale_factor',
    )!
    expect(factor.min).toBe(0)
    expect(factor.max).toBe(100)
    const enabled = AUTOVACUUM_PARAMETERS.find(
      (parameter) => parameter.name === 'autovacuum_enabled',
    )!
    expect(enabled.kind).toBe('boolean')
  })
})

describe('validating one value', () => {
  const parameter = (name: string) => AUTOVACUUM_PARAMETERS.find((entry) => entry.name === name)!

  it('accepts the spellings of a boolean and renders one', () => {
    for (const value of ['true', 'TRUE', 'on', 'yes', '1', true]) {
      expect(validateValue(parameter('autovacuum_enabled'), value)).toEqual({ ok: true, value: 'true' })
    }
    for (const value of ['false', 'off', 'no', '0', false]) {
      expect(validateValue(parameter('autovacuum_enabled'), value)).toEqual({
        ok: true,
        value: 'false',
      })
    }
    expect(validateValue(parameter('autovacuum_enabled'), 'maybe').ok).toBe(false)
  })

  it('parses a number and re-renders it, so the string that arrived never reaches the statement', () => {
    expect(validateValue(parameter('autovacuum_vacuum_scale_factor'), '0.01')).toEqual({
      ok: true,
      value: '0.01',
    })
    expect(validateValue(parameter('autovacuum_vacuum_scale_factor'), 0.01)).toEqual({
      ok: true,
      value: '0.01',
    })
    expect(validateValue(parameter('autovacuum_vacuum_threshold'), ' 10 ')).toEqual({
      ok: true,
      value: '10',
    })
    // An integer parameter does not take a fraction, and nothing takes a string that is not a number.
    expect(validateValue(parameter('autovacuum_vacuum_threshold'), '10.5').ok).toBe(false)
    expect(validateValue(parameter('autovacuum_vacuum_threshold'), 'abc').ok).toBe(false)
    expect(validateValue(parameter('autovacuum_vacuum_threshold'), '').ok).toBe(false)
  })

  it('refuses a value outside the parameter’s bounds', () => {
    expect(validateValue(parameter('autovacuum_vacuum_scale_factor'), 500)).toMatchObject({
      ok: false,
    })
    expect(validateValue(parameter('autovacuum_vacuum_threshold'), -1)).toMatchObject({ ok: false })
    // −1 is legal for the cost delay (it means "the server setting") and illegal for a threshold.
    expect(validateValue(parameter('autovacuum_vacuum_cost_delay'), -1).ok).toBe(true)
    expect(validateValue(parameter('autovacuum_freeze_max_age'), 5).ok).toBe(false)
  })
})

describe('validating a request body', () => {
  it('keeps the names it knows, reports the ones it does not, and skips empty fields', () => {
    const result = validateSettings({
      autovacuum_vacuum_scale_factor: '0.01',
      autovacuum_vacuum_threshold: 10,
      autovacuum_enabled: 'on',
      fillfactor: 90,
      session_authorization: 'postgres',
      autovacuum_analyze_scale_factor: '',
      autovacuum_analyze_threshold: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.settings).toEqual({
      autovacuum_vacuum_scale_factor: '0.01',
      autovacuum_vacuum_threshold: '10',
      autovacuum_enabled: 'true',
    })
    // A name outside the allow-list is reported, not set — and never reaches a statement.
    expect(result.unknown).toEqual(['fillfactor', 'session_authorization'])
  })

  it('refuses a bad value for a known name, with the parameter’s description as the hint', () => {
    const result = validateSettings({ autovacuum_vacuum_scale_factor: 'often' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/takes a number/)
    expect(result.hint).toMatch(/scale factor|Share of the table/)
  })

  it('refuses a body that is not an object of settings', () => {
    for (const body of ['autovacuum_enabled=true', ['autovacuum_enabled'], null, 42]) {
      expect(validateSettings(body).ok).toBe(false)
    }
  })
})

describe('the statement it would run', () => {
  it('quotes the names and renders the validated values', () => {
    expect(alterClause({ autovacuum_vacuum_scale_factor: '0.01', autovacuum_enabled: 'true' })).toBe(
      '"autovacuum_vacuum_scale_factor" = 0.01, "autovacuum_enabled" = true',
    )
    expect(alterStatement('articles', { autovacuum_vacuum_threshold: '10' })).toBe(
      'ALTER TABLE "public"."articles" SET ("autovacuum_vacuum_threshold" = 10);',
    )
    expect(alterStatement('articles', { autovacuum_vacuum_threshold: '10' }, 'reset')).toBe(
      'ALTER TABLE "public"."articles" RESET ("autovacuum_vacuum_threshold");',
    )
    expect(describeSettings({ autovacuum_enabled: 'false' })).toBe('autovacuum_enabled = false')
  })

  it('quotes a table name that would otherwise end the statement', () => {
    // The name is resolved through the catalog before this is ever called, so it cannot reach
    // Postgres — but the quoting is the reason a mistake here is not a second statement.
    expect(alterStatement('odd"name', { autovacuum_enabled: 'true' })).toContain('"odd""name"')
  })
})

describe('against the real database', () => {
  let client: pg.Client

  beforeAll(async () => {
    client = new pg.Client(pgClientOptions(process.env.POSTGRES_URL as string))
    await client.connect()
    await client.query(`drop table if exists ${SCRATCH} cascade`)
    await client.query(`create table ${SCRATCH} (id serial primary key, note text)`)
    await client.query(
      `insert into ${SCRATCH} (note) select 'row ' || g from generate_series(1, 200) g`,
    )
    await client.query(`analyze ${SCRATCH}`)
  }, 60_000)

  afterAll(async () => {
    await client.query(`drop table if exists ${SCRATCH} cascade`).catch(() => undefined)
    await client.end()
  })

  it('reads a table with no overrides, and says what the server would do', async () => {
    const current = await readTableAutovacuum(client, SCRATCH)
    expect(current.table).toBe(SCRATCH)
    expect(current.autovacuum).toEqual({})
    expect(current.vacuumTrigger).toBeGreaterThan(0)
    // threshold + 0.2 × rows, for 200 rows: 50 + 40.
    expect(current.vacuumTrigger).toBe(90)
    expect(current.analyzeTrigger).toBe(70)
  })

  it('sets an override, reads it back from the catalog, and moves the trigger', async () => {
    const validated = validateSettings({
      autovacuum_vacuum_scale_factor: '0.01',
      autovacuum_vacuum_threshold: '10',
    })
    expect(validated.ok).toBe(true)
    if (!validated.ok) return

    const result = await applyAutovacuum(client, SCRATCH, validated.settings)
    expect(result.table).toBe(SCRATCH)
    expect(result.statements).toHaveLength(1)
    expect(result.statements[0]).toBe(
      `ALTER TABLE "public"."${SCRATCH}" SET ("autovacuum_vacuum_scale_factor" = 0.01, "autovacuum_vacuum_threshold" = 10);`,
    )
    // Read back from pg_class.reloptions, not echoed from the request.
    expect(result.autovacuum).toEqual({
      autovacuum_vacuum_scale_factor: '0.01',
      autovacuum_vacuum_threshold: '10',
    })
    expect(result.vacuumTrigger).toBe(12)
    expect(result.analyzeTrigger).toBe(70)

    // The catalog agrees, on a fresh read.
    const current = await readTableAutovacuum(client, SCRATCH)
    expect(current.reloptions).toMatchObject({ autovacuum_vacuum_scale_factor: '0.01' })
    expect(current.vacuumTrigger).toBe(12)
  })

  it('resets an override, and the table follows the server setting again', async () => {
    const current = await readTableAutovacuum(client, SCRATCH)
    const result = await applyAutovacuum(client, SCRATCH, current.autovacuum, { mode: 'reset' })
    expect(result.statements[0]).toContain('RESET')
    expect(result.autovacuum).toEqual({})
    expect(result.vacuumTrigger).toBe(90)
    expect((await readTableAutovacuum(client, SCRATCH)).reloptions).toEqual({})
  })

  it('refuses a name outside the allow-list even when it is handed one directly', async () => {
    await expect(
      // Not reachable through the endpoint — `validateSettings` drops unknown names first — but the
      // function is exported, so it defends itself.
      applyAutovacuum(client, SCRATCH, { fillfactor: '90' } as never),
    ).rejects.toThrow(/not an autovacuum parameter/)
    await expect(applyAutovacuum(client, SCRATCH, {})).rejects.toThrow(/nothing to change/i)
  })

  it('refuses a table that is not there, rather than running DDL against a name', async () => {
    await expect(
      readTableAutovacuum(client, 'no_such_table'),
    ).rejects.toThrow(/no table called/i)
    await expect(
      applyAutovacuum(client, 'no_such_table', { autovacuum_enabled: 'true' }),
    ).rejects.toThrow(/no table called/i)
    // A name that is not even an identifier is refused by the same catalog lookup.
    await expect(
      applyAutovacuum(client, 'articles"; drop table users; --', {
        autovacuum_enabled: 'true',
      }),
    ).rejects.toThrow(/no table called/i)
    const still = await client.query<{ n: number }>(
      `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'users'`,
    )
    expect(still.rows[0]?.n).toBe(1)
  })
})
