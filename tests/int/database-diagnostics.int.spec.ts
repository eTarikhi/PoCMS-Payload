import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pgClientOptions } from '@/lib/database-readiness'
import {
  autovacuumOptions,
  autovacuumTriggerFor,
  analyzeTriggerFor,
  bloatReport,
  describeTable,
  estimateBloatBytes,
  MAX_BLOAT_TABLES,
  parseReloptions,
} from '@/plugins/databaseTools/server/bloat'
import {
  formatBytes,
  formatDuration,
  formatSetting,
  poolNote,
  serverSettings,
  SETTING_GROUPS,
  SETTING_NAMES,
  timeoutSummary,
} from '@/plugins/databaseTools/server/settings'
import {
  normaliseQuery,
  QUERY_PREVIEW_LENGTH,
  statementReport,
  timeColumnsFor,
  unavailabilityHint,
} from '@/plugins/databaseTools/server/statements'

/**
 * The read-only diagnostics: server settings, bloat, and the statement history.
 *
 * The arithmetic here is the part that can be quietly wrong in a way a screenshot never shows — a
 * setting read in 8 kB blocks and printed as bytes is off by four orders of magnitude, an autovacuum
 * trigger computed without a table's own override tells you to vacuum a table that was vacuumed an
 * hour ago, and a bloat estimate that guesses a row width invents a number that looks like a
 * measurement. Those are pure functions, so they are tested as such. The live tests then check that
 * the queries run against a real server and that the report degrades honestly when the server does
 * not have `pg_stat_statements`, which this one does not.
 */

const SCRATCH = 'diagnostics_scratch'

describe('reading a setting the way Postgres stores it', () => {
  it('converts the memory units, including the 8 kB block that is not a byte count', () => {
    expect(formatSetting('shared_buffers', '16384', '8kB')).toBe('128 MB')
    expect(formatSetting('work_mem', '4096', 'kB')).toBe('4.0 MB')
    expect(formatSetting('maintenance_work_mem', '1', 'GB')).toBe('1.0 GB')
    expect(formatSetting('effective_cache_size', '524288', '8kB')).toBe('4.0 GB')
    expect(formatSetting('max_wal_size', '4', '16MB')).toBe('64.0 MB')
  })

  it('reads a timeout of 0 as “no limit”, because that is what Postgres means', () => {
    expect(formatSetting('statement_timeout', '0', 'ms')).toBe('off (no limit)')
    expect(formatSetting('idle_in_transaction_session_timeout', '0', 'ms')).toBe('off (no limit)')
    expect(formatSetting('lock_timeout', '0', 'ms')).toBe('off (no limit)')
    // …and a timeout that is not one of those keeps 0 as a number.
    expect(formatSetting('autovacuum_naptime', '0', 'ms')).toBe('0 ms')
  })

  it('scales time into the unit a person reads', () => {
    expect(formatSetting('statement_timeout', '5000', 'ms')).toBe('5 s')
    expect(formatSetting('autovacuum_naptime', '60000', 'ms')).toBe('1 minutes')
    expect(formatSetting('log_autovacuum_min_duration', '-1', 'ms')).toBe('-1 ms')
    expect(formatDuration(90_000)).toBe('1.5 minutes')
    expect(formatDuration(7_200_000)).toBe('2 hours')
    expect(formatDuration(0, true)).toBe('off (no limit)')
  })

  it('leaves a boolean and an unmodelled unit alone', () => {
    expect(formatSetting('autovacuum', 'on', null)).toBe('on')
    expect(formatSetting('server_version', '16.2', null)).toBe('16.2')
    expect(formatSetting('some_counter', '12', 'widgets')).toBe('12 widgets')
  })

  it('formats bytes without inventing precision', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1536)).toBe('1.5 kB')
    expect(formatBytes(157_286_400)).toBe('150 MB')
  })

  it('asks for every setting in a group, and groups them the way the questions arrive', () => {
    expect(SETTING_NAMES).toContain('statement_timeout')
    expect(SETTING_NAMES).toContain('max_connections')
    expect(SETTING_NAMES).toContain('work_mem')
    expect(SETTING_GROUPS.every((group) => group.names.length > 0)).toBe(true)
    expect(new Set(SETTING_NAMES).size).toBe(SETTING_NAMES.length)
  })
})

describe('the sentence a settings card ends with', () => {
  const settings = (rows: { name: string; value: string }[]) =>
    ({
      version: '',
      database: '',
      target: { host: '', port: '', database: '', pooled: false, source: 'none' },
      uptime: null,
      settings: rows.map((row) => ({ ...row, setting: '', unit: null, source: '', pendingRestart: false, category: '' })),
      absent: [],
      connections: {
        total: 0,
        max: 0,
        superuserReserved: 0,
        available: 0,
        byState: [],
        byUser: [],
        byApplication: [],
        otherDatabases: 0,
      },
      activity: {
        commits: 0,
        rollbacks: 0,
        rowsReturned: 0,
        rowsFetched: 0,
        tempFiles: 0,
        tempBytes: 0,
        deadlocks: 0,
        cacheHitRatio: 0,
        since: null,
      },
    }) as never

  it('warns when nothing would stop a runaway statement', () => {
    const summary = timeoutSummary(
      settings([
        { name: 'statement_timeout', value: 'off (no limit)' },
        { name: 'idle_in_transaction_session_timeout', value: 'off (no limit)' },
      ]),
    )
    expect(summary).toMatch(/No timeout is set/)
  })

  it('names the limits that are set', () => {
    const summary = timeoutSummary(
      settings([
        { name: 'statement_timeout', value: '30 s' },
        { name: 'idle_in_transaction_session_timeout', value: 'off (no limit)' },
      ]),
    )
    expect(summary).toContain('a statement is cancelled after 30 s')
    expect(summary).toContain('an idle transaction is closed after off (no limit)')
  })

  it('says nothing when the server reported neither', () => {
    expect(timeoutSummary(settings([]))).toBeNull()
  })

  it('explains a pooled connection string only when there is one', () => {
    expect(
      poolNote({ host: 'ep-a-pooler.aws.neon.tech', port: '5432', database: 'app', pooled: true, source: 'POSTGRES_URL' }),
    ).toMatch(/pooler/)
    expect(
      poolNote({ host: '127.0.0.1', port: '5432', database: 'app', pooled: false, source: 'POSTGRES_URL' }),
    ).toBeNull()
  })
})

describe('the arithmetic behind a bloat number', () => {
  it('estimates from the table’s own average row width', () => {
    // 1 000 live rows in 100 kB → 102.4 bytes a row; 250 dead rows ≈ 25 600 bytes.
    expect(
      estimateBloatBytes({ heapBytes: 102_400, liveTuples: 1000, deadTuples: 250 }),
    ).toBe(25_600)
  })

  it('answers 0 rather than guessing when there is nothing to measure against', () => {
    expect(estimateBloatBytes({ heapBytes: 102_400, liveTuples: 1000, deadTuples: 0 })).toBe(0)
    // An unanalyzed table holds reltuples = 0 (or -1): no width, so no invented number.
    expect(estimateBloatBytes({ heapBytes: 102_400, liveTuples: 0, deadTuples: 500 })).toBe(0)
    expect(estimateBloatBytes({ heapBytes: 0, liveTuples: 100, deadTuples: 50 })).toBe(0)
    expect(estimateBloatBytes({ heapBytes: 1024, liveTuples: -1, deadTuples: 50 })).toBe(0)
  })

  it('puts the trigger where Postgres puts it, and lets a table’s own override win', () => {
    // threshold + scale_factor × reltuples, with the server defaults 50 and 0.2.
    expect(autovacuumTriggerFor({ liveTuples: 1000, threshold: 50, scaleFactor: 0.2 })).toBe(250)
    expect(autovacuumTriggerFor({ liveTuples: 0, threshold: 50, scaleFactor: 0.2 })).toBe(50)
    expect(autovacuumTriggerFor({ liveTuples: 10_000_000, threshold: 50, scaleFactor: 0.2 })).toBe(
      2_000_050,
    )
    expect(
      autovacuumTriggerFor({
        liveTuples: 1000,
        threshold: 50,
        scaleFactor: 0.2,
        reloptions: { autovacuum_vacuum_scale_factor: '0.01' },
      }),
    ).toBe(60)
    expect(
      autovacuumTriggerFor({
        liveTuples: 1000,
        threshold: 50,
        scaleFactor: 0.2,
        reloptions: { autovacuum_vacuum_threshold: '0', autovacuum_vacuum_scale_factor: '0.01' },
      }),
    ).toBe(10)
    // An unrelated reloption (fillfactor) changes nothing.
    expect(
      autovacuumTriggerFor({
        liveTuples: 1000,
        threshold: 50,
        scaleFactor: 0.2,
        reloptions: { fillfactor: '90' },
      }),
    ).toBe(250)
  })

  it('computes the analyze trigger from its own pair of settings', () => {
    expect(analyzeTriggerFor({ liveTuples: 1000, threshold: 50, scaleFactor: 0.1 })).toBe(150)
    expect(
      analyzeTriggerFor({
        liveTuples: 1000,
        threshold: 50,
        scaleFactor: 0.1,
        reloptions: { autovacuum_analyze_scale_factor: '0.02' },
      }),
    ).toBe(70)
  })

  it('reads reloptions the way Postgres stores them', () => {
    expect(parseReloptions('{autovacuum_vacuum_scale_factor=0.01,fillfactor=90}')).toEqual({
      autovacuum_vacuum_scale_factor: '0.01',
      fillfactor: '90',
    })
    expect(parseReloptions(null)).toEqual({})
    expect(parseReloptions('')).toEqual({})
    expect(parseReloptions('not an array')).toEqual({})
    expect(autovacuumOptions(parseReloptions('{fillfactor=90,autovacuum_enabled=false}'))).toEqual({
      autovacuum_enabled: 'false',
    })
  })
})

describe('reading pg_stat_statements when it is not there', () => {
  it('picks the column names the server’s version actually has', () => {
    // PostgreSQL 13 renamed them; a query written for one version errors on the other.
    expect(
      timeColumnsFor(['total_exec_time', 'mean_exec_time', 'max_exec_time', 'min_exec_time']),
    ).toEqual({
      total_exec_time: 'total_exec_time',
      mean_exec_time: 'mean_exec_time',
      max_exec_time: 'max_exec_time',
      min_exec_time: 'min_exec_time',
    })
    expect(timeColumnsFor(['total_time', 'mean_time', 'max_time'])).toEqual({
      total_exec_time: 'total_time',
      mean_exec_time: 'mean_time',
      max_exec_time: 'max_time',
    })
    expect(timeColumnsFor(['query', 'calls'])).toEqual({})
  })

  it('tells the two kinds of unavailable apart', () => {
    expect(
      unavailabilityHint({ installed: true, preloaded: false, available: true }),
    ).toMatch(/not loaded when the server started/)
    expect(
      unavailabilityHint({ installed: false, preloaded: false, available: true }),
    ).toMatch(/CREATE EXTENSION/)
    expect(
      unavailabilityHint({ installed: false, preloaded: false, available: false }),
    ).toMatch(/does not offer/)
  })

  it('makes a statement readable on one line without keeping anyone’s values', () => {
    expect(normaliseQuery('SELECT  *  FROM\n  "articles"\n;')).toBe('SELECT * FROM "articles"')
    // Postgres normalises literals to $1 before this ever sees them.
    expect(normaliseQuery('SELECT $1 FROM t WHERE id = $2')).toBe('SELECT $1 FROM t WHERE id = $2')
    const long = `select ${'a_very_long_column_name, '.repeat(40)} from t`
    const preview = normaliseQuery(long)
    expect(preview.length).toBeLessThanOrEqual(QUERY_PREVIEW_LENGTH + 1)
    expect(preview.endsWith('…')).toBe(true)
    // Cut on a word boundary, not mid-identifier: the character before the ellipsis is punctuation
    // or the end of a word, never the space the cut happened at.
    expect(preview.slice(0, -1).endsWith(' ')).toBe(false)
    expect(preview.slice(0, -1)).toMatch(/[A-Za-z0-9_,)"]$/)
  })
})

describe('against the real database', () => {
  let client: pg.Client

  beforeAll(async () => {
    client = new pg.Client(pgClientOptions(process.env.POSTGRES_URL as string))
    await client.connect()
    await client.query(`drop table if exists ${SCRATCH} cascade`)
    await client.query(`create table ${SCRATCH} (id serial primary key, note text)`)
    await client.query(`insert into ${SCRATCH} (note) select 'row ' || g from generate_series(1, 50) g`)
  }, 60_000)

  afterAll(async () => {
    await client.query(`drop table if exists ${SCRATCH} cascade`).catch(() => undefined)
    await client.end()
  })

  it('reads the server’s settings, the sessions and the counters', async () => {
    const report = await serverSettings(client)

    expect(report.version).toMatch(/PostgreSQL/)
    expect(report.database.length).toBeGreaterThan(0)
    expect(report.target.host.length).toBeGreaterThan(0)
    expect(report.target.database).toBe(report.database)
    // The credential never reaches a card.
    expect(JSON.stringify(report.target)).not.toMatch(/password|:[^@/]*@/)

    const byName = new Map(report.settings.map((setting) => [setting.name, setting]))
    expect(byName.get('max_connections')?.value).toMatch(/^\d+$/)
    expect(byName.get('shared_buffers')?.value).toMatch(/(kB|MB|GB)$/)
    expect(byName.get('statement_timeout')).toBeDefined()
    expect(byName.get('autovacuum')?.value).toMatch(/^(on|off)$/)
    expect(report.connections.max).toBeGreaterThan(0)
    // This client is one of them, and it is running a statement while it reads.
    expect(report.connections.total).toBeGreaterThanOrEqual(1)
    expect(report.connections.byState.map((row) => row.state)).toContain('active')
    expect(report.connections.available).toBeGreaterThanOrEqual(0)
    expect(report.activity.commits).toBeGreaterThanOrEqual(0)
    expect(report.activity.cacheHitRatio).toBeGreaterThanOrEqual(0)
    expect(report.activity.cacheHitRatio).toBeLessThanOrEqual(1)
    // A setting this server does not have is named, not guessed at.
    expect(Array.isArray(report.absent)).toBe(true)
    expect(typeof timeoutSummary(report)).toBe('string')
  })

  it('reports the bloat of every table, worst first, with the autovacuum settings in force', async () => {
    const report = await bloatReport(client, { limit: 200 })

    expect(report.tables.length).toBeGreaterThan(0)
    expect(report.tables.length).toBeLessThanOrEqual(200)
    expect(MAX_BLOAT_TABLES).toBe(60)

    const scratch = report.tables.find((table) => table.name === SCRATCH)
    expect(scratch).toBeDefined()
    expect(scratch?.totalBytes).toBeGreaterThan(0)
    expect(scratch?.estimated).toBe(true)
    expect(describeTable(scratch!)).toContain(SCRATCH)

    // Worst first: dead tuples, then size.
    const dead = report.tables.map((table) => table.deadTuples)
    expect(dead).toEqual([...dead].sort((a, b) => b - a))

    expect(report.autovacuum.vacuumScaleFactor).toBeGreaterThan(0)
    expect(report.autovacuum.vacuumThreshold).toBeGreaterThanOrEqual(0)
    expect(report.totals.tables).toBe(report.tables.length)
    expect(report.totals.deadTuples).toBe(
      report.tables.reduce((sum, table) => sum + table.deadTuples, 0),
    )
    // The estimate is never a measurement, and the card says which kind of number it shows.
    expect(typeof report.exactMeasurementAvailable).toBe('boolean')
    expect(report.countedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('sees a per-table autovacuum override, and the trigger it moves', async () => {
    await client.query(
      `alter table ${SCRATCH} set (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 10)`,
    )
    const tuned = (await bloatReport(client, { limit: 200 })).tables.find(
      (table) => table.name === SCRATCH,
    )
    expect(tuned?.reloptions).toEqual({
      autovacuum_vacuum_scale_factor: '0.01',
      autovacuum_vacuum_threshold: '10',
    })
    expect(tuned?.autovacuumTrigger).toBe(
      autovacuumTriggerFor({
        liveTuples: tuned!.liveTuples,
        threshold: 50,
        scaleFactor: 0.2,
        reloptions: tuned!.reloptions,
      }),
    )
    expect(tuned!.autovacuumTrigger).toBeLessThan(60)

    await client.query(`alter table ${SCRATCH} reset (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold)`)
    const reset = (await bloatReport(client, { limit: 200 })).tables.find(
      (table) => table.name === SCRATCH,
    )
    expect(reset?.reloptions).toEqual({})
  })

  it('says why there is no statement history on a server without the extension', async () => {
    const report = await statementReport(client)

    // This sandbox's Postgres has no pg_stat_statements; the honest answer is the reason, not an
    // empty table that looks like a quiet database.
    if (!report.available) {
      expect(report.hint).toMatch(/pg_stat_statements/)
      expect(report.byTotalTime).toEqual([])
      expect(report.byMeanTime).toEqual([])
      expect(report.byCalls).toEqual([])
      expect(report.totals).toBeNull()
      expect(report.extension.installed).toBe(false)
      return
    }

    // Where it is available (Neon offers it), the rankings are populated and consistent.
    expect(report.hint).toBeNull()
    expect(report.totals).not.toBeNull()
    expect(report.byTotalTime.length).toBeGreaterThan(0)
    expect(report.byCalls.length).toBeGreaterThan(0)
    const totals = report.byTotalTime.map((row) => row.totalTimeMs)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
    expect(report.byTotalTime.every((row) => row.query.length > 0)).toBe(true)
    expect(report.byCalls.every((row) => row.calls > 0)).toBe(true)
  }, 60_000)
})
