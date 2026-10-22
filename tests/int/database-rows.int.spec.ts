import pg from 'pg'
import { describe, expect, it } from 'vitest'

import { withDatabase } from '@/plugins/databaseTools/server/connection'
import {
  buildWhere,
  FILTER_OPERATORS,
  filterParam,
  MAX_FILTERS,
  parseDirection,
  parseFilters,
} from '@/plugins/databaseTools/server/filters'
import {
  exportCsv,
  MAX_CSV_ROWS,
  readRows,
  tableColumns,
  tableDdl,
} from '@/plugins/databaseTools/server/introspection'
import {
  cancelQuery,
  listSessions,
  LONG_RUNNING_SECONDS,
  terminateSession,
} from '@/plugins/databaseTools/server/sessions'

/**
 * The read-only browser's filters, sorting and CSV export, and the live session list with its two
 * guarded actions.
 *
 * The SQL runs against this project's database — the point of a filter builder is the query it
 * produces, and the point of `pg_cancel_backend` is that a real backend stops. `articles` is the
 * table under test because the seed fills it with titled rows, which is enough for text, numeric and
 * type-mismatch cases.
 */

const withDb = <T>(fn: (client: pg.Client) => Promise<T>) => withDatabase(fn)

/** The OID of a table, for the catalog helpers. */
const oidOf = async (client: pg.Client, name: string): Promise<number> => {
  const { rows } = await client.query(`select $1::regclass::oid as oid`, [`public."${name}"`])
  return Number((rows[0] as { oid: number }).oid)
}

describe('parseFilters', () => {
  it('reads column:operator:value, and keeps colons that belong to the value', () => {
    expect(parseFilters('title:contains:hello')).toEqual([
      { column: 'title', operator: 'contains', value: 'hello' },
    ])
    expect(parseFilters('title:eq:10:30')).toEqual([
      { column: 'title', operator: 'eq', value: '10:30' },
    ])
  })

  it('takes repeated values, drops malformed ones, and caps the list', () => {
    expect(parseFilters(['title:eq:a', 'nonsense', 'title:like:b', 'bad-name:eq:x'])).toEqual([
      { column: 'title', operator: 'eq', value: 'a' },
    ])
    expect(parseFilters('empty')).toEqual([])
    expect(parseFilters(null)).toEqual([])
    expect(
      parseFilters(Array.from({ length: MAX_FILTERS + 5 }, (_, index) => `col${index}:eq:x`)),
    ).toHaveLength(MAX_FILTERS)
  })

  it('does not need a value for isnull/notnull', () => {
    expect(parseFilters('deletedAt:isnull')).toEqual([
      { column: 'deletedAt', operator: 'isnull', value: undefined },
    ])
    expect(parseFilters('deletedAt:isnull:x')).toEqual([
      { column: 'deletedAt', operator: 'isnull', value: undefined },
    ])
  })

  it('normalises the direction', () => {
    expect(parseDirection('desc')).toBe('desc')
    expect(parseDirection('DESC')).toBe('asc')
    expect(parseDirection(undefined)).toBe('asc')
  })

  it('round-trips a filter through filterParam', () => {
    expect(FILTER_OPERATORS).toHaveLength(10)
    const filter = { column: 'title', operator: 'contains' as const, value: 'a:b' }
    expect(parseFilters(filterParam(filter))).toEqual([filter])
  })
})

describe('buildWhere', () => {
  const columns = [
    { name: 'title', type: 'character varying' },
    { name: 'views', type: 'integer' },
  ]

  it('casts a value to the column type and parameterises it', () => {
    expect(buildWhere([{ column: 'views', operator: 'gt', value: '10' }], columns)).toEqual({
      clause: 'where "views" > $1::integer',
      params: ['10'],
      ignored: [],
    })
  })

  it('uses the text form for contains and starts, case-insensitively', () => {
    expect(
      buildWhere([{ column: 'title', operator: 'contains', value: 'a%b' }], columns).clause,
    ).toBe(`where "title"::text ilike '%' || $1 || '%'`)
    expect(buildWhere([{ column: 'title', operator: 'starts', value: 'a' }], columns).clause).toBe(
      `where "title"::text ilike $1 || '%'`,
    )
  })

  it('ignores a name that is not a column, and never interpolates it', () => {
    const result = buildWhere(
      [{ column: 'title; drop table users', operator: 'eq', value: 'x' }],
      columns,
    )
    expect(result.clause).toBe('')
    expect(result.ignored).toEqual(['title; drop table users'])
  })

  it('joins several conditions with and', () => {
    const result = buildWhere(
      [
        { column: 'title', operator: 'contains', value: 'a' },
        { column: 'views', operator: 'gte', value: '5' },
      ],
      columns,
    )
    expect(result.clause).toBe(
      `where "title"::text ilike '%' || $1 || '%' and "views" >= $2::integer`,
    )
    expect(result.params).toEqual(['a', '5'])
  })
})

describe('readRows with filters and sort', () => {
  it('counts what it filters, and pages within that', async () => {
    const all = await withDb((client) => readRows(client, 'articles', { limit: 1 }))
    expect(all.total).toBeGreaterThan(1)

    const filtered = await withDb((client) =>
      readRows(client, 'articles', {
        limit: 100,
        filters: [{ column: 'title', operator: 'contains', value: String(all.rows[0].title) }],
      }),
    )
    expect(filtered.total).toBeLessThan(all.total)
    expect(filtered.total).toBeGreaterThan(0)
    expect(filtered.filters).toHaveLength(1)
    expect(filtered.ignoredFilters).toEqual([])
  })

  it('sorts the way the header asks, and keeps a sort only when the column exists', async () => {
    const ascending = await withDb((client) =>
      readRows(client, 'articles', { limit: 100, sort: 'title', direction: 'asc' }),
    )
    const titles = ascending.rows.map((row) => String(row.title))
    expect(titles).toEqual([...titles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    expect(ascending.sort).toBe('title')
    expect(ascending.direction).toBe('asc')

    const descending = await withDb((client) =>
      readRows(client, 'articles', { limit: 1, sort: 'title', direction: 'desc' }),
    )
    expect(descending.rows[0].title).toBe(titles[titles.length - 1])

    const bogus = await withDb((client) =>
      readRows(client, 'articles', { limit: 1, sort: 'not_a_column', direction: 'asc' }),
    )
    expect(bogus.sort).toBeNull()
  })

  it('filters on a typed column through the cast', async () => {
    const page = await withDb((client) =>
      readRows(client, 'articles', {
        limit: 100,
        filters: [{ column: 'id', operator: 'lte', value: '2' }],
      }),
    )
    expect(page.rows.every((row) => Number(row.id) <= 2)).toBe(true)
  })

  it('reports an unknown filter rather than failing', async () => {
    const page = await withDb((client) =>
      readRows(client, 'articles', {
        limit: 1,
        filters: [{ column: 'nope', operator: 'eq', value: 'x' }],
      }),
    )
    expect(page.ignoredFilters).toEqual(['nope'])
    expect(page.total).toBeGreaterThan(0)
  })

  it('turns a value that is not the column type into a readable error', async () => {
    await expect(
      withDb((client) =>
        readRows(client, 'articles', {
          limit: 1,
          filters: [{ column: 'id', operator: 'gt', value: 'not-a-number' }],
        }),
      ),
    ).rejects.toThrow(/invalid input syntax/i)
  })

  it('lists the columns a filter may name', async () => {
    const columns = await withDb(async (client) => tableColumns(client, await oidOf(client, 'articles')))
    expect(columns.map((column) => column.name)).toContain('title')
    expect(columns.find((column) => column.name === 'id')?.type).toBe('integer')
  })
})

describe('tableDdl', () => {
  it('describes the table with its own types, defaults, keys and indexes', async () => {
    const result = await withDb((client) => tableDdl(client, 'articles'))
    expect(result.table).toBe('articles')
    expect(result.sql).toMatch(/create table "public"\."articles" \(/)
    expect(result.sql).toContain('"id" integer not null default nextval')
    expect(result.sql).toContain('constraint "articles_pkey" PRIMARY KEY (id)')
    expect(result.sql).toContain('FOREIGN KEY (image_id) REFERENCES media(id)')
    expect(result.sql).toMatch(/^CREATE (UNIQUE )?INDEX/m)
    // The enum the table uses is named, and said not to be part of this file.
    expect(result.unsignedTypes.join(' ')).toContain('enum_articles_status')
    expect(result.sql).toContain('-- not defined here:')
  })

  it('answers with the same shape for a table without indexes or foreign keys', async () => {
    const result = await withDb((client) => tableDdl(client, 'payload_migrations'))
    expect(result.sql).toMatch(/create table "public"\."payload_migrations"/)
    expect(result.sql.trimEnd().endsWith(';')).toBe(true)
  })

  it('refuses a table that does not exist', async () => {
    await expect(withDb((client) => tableDdl(client, 'nope_not_here'))).rejects.toThrow(
      /no table called/i,
    )
  })
})

describe('exportCsv', () => {
  it('writes a header and one line per row', async () => {
    const result = await withDb((client) =>
      exportCsv(client, 'articles', { maxRows: 100, sort: 'title', direction: 'asc' }),
    )
    const lines = result.csv.split('\r\n').filter(Boolean)
    expect(lines[0]).toMatch(/^id,title,/)
    expect(lines).toHaveLength(result.rows + 1)
    expect(result.filename).toMatch(/^pocms-articles-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(result.truncated).toBe(false)
  })

  it('respects the filters and the row cap', async () => {
    const none = await withDb((client) =>
      exportCsv(client, 'articles', {
        maxRows: 100,
        filters: [{ column: 'title', operator: 'contains', value: 'zzz-no-such-title' }],
      }),
    )
    expect(none.rows).toBe(0)
    expect(none.csv.split('\r\n').filter(Boolean)).toHaveLength(1)

    const capped = await withDb((client) => exportCsv(client, 'articles', { maxRows: 2 }))
    expect(capped.rows).toBe(2)
    expect(capped.truncated).toBe(true)
  })

  it('never exports more than the hard cap, whatever the request asks', async () => {
    const result = await withDb((client) =>
      exportCsv(client, 'articles', { maxRows: MAX_CSV_ROWS * 2 }),
    )
    expect(result.rows).toBeLessThanOrEqual(MAX_CSV_ROWS)
  })

  it('escapes a value that contains a comma, a quote or a newline', async () => {
    const result = await withDb(async (client) => {
      await client.query('begin')
      try {
        await client.query(
          `insert into "articles" ("title", "slug", "excerpt", "_status")
           values ($1, $2, $3, 'published')`,
          ['A, "quoted"\nline', `csv-test-${Date.now()}`, 'x'],
        )
        return await exportCsv(client, 'articles', {
          filters: [{ column: 'title', operator: 'contains', value: 'quoted' }],
        })
      } finally {
        await client.query('rollback')
      }
    })
    expect(result.rows).toBe(1)
    expect(result.csv).toContain('"A, ""quoted""\nline"')
  })
})

describe('listSessions', () => {
  it('reports the page’s own session and this role’s visibility', async () => {
    const overview = await withDb((client) => listSessions(client))
    expect(overview.role).toBe('postgres')
    expect(overview.isSuperuser).toBe(true)
    expect(overview.canSeeAllQueries).toBe(true)
    expect(overview.sessions.some((session) => session.own)).toBe(true)
    expect(overview.sessions.every((session) => Number.isInteger(session.pid))).toBe(true)
    expect(overview.longest).toBeNull()
    expect(LONG_RUNNING_SECONDS).toBeGreaterThan(0)
  })

  it('sees a second connection, with no blockers on an idle server', async () => {
    const other = new pg.Client({ connectionString: process.env.POSTGRES_URL })
    await other.connect()
    try {
      const overview = await withDb((client) => listSessions(client))
      const ids = overview.sessions.map((session) => session.pid)
      expect(ids).toContain((other as unknown as { processID: number }).processID)
      expect(new Set(ids).size).toBe(ids.length)
      expect(overview.sessions.every((session) => session.blockedBy.length === 0)).toBe(true)
    } finally {
      await other.end()
    }
  })

  it('counts a session blocked by another one', async () => {
    const holder = new pg.Client({ connectionString: process.env.POSTGRES_URL })
    await holder.connect()
    try {
      await holder.query('begin')
      await holder.query(`select * from "articles" order by id limit 1 for update`)

      const waiter = new pg.Client({ connectionString: process.env.POSTGRES_URL })
      await waiter.connect()
      try {
        // This statement waits for the holder's lock; catch it below once the check has read it.
        const blocked = waiter
          .query(`select * from "articles" order by id limit 1 for update`)
          .catch(() => undefined)

        const overview = await withDb((client) => listSessions(client))
        const waiting = overview.sessions.find(
          (session) =>
            session.pid === (waiter as unknown as { processID: number }).processID &&
            session.blockedBy.length > 0,
        )
        expect(overview.blocked).toBeGreaterThanOrEqual(1)
        expect(waiting).toBeDefined()
        expect(waiting?.blockedBy).toContain((holder as unknown as { processID: number }).processID)
        expect(waiting?.wait).toMatch(/Lock/)

        await holder.query('rollback')
        await blocked
      } finally {
        await waiter.end()
      }
    } finally {
      await holder.end().catch(() => undefined)
    }
  })

  it('refuses to signal this page’s own session, or an id that is not a session', async () => {
    await expect(withDb((client) => cancelQuery(client, 'nope'))).rejects.toThrow(
      /not a session id/i,
    )
    await expect(withDb((client) => terminateSession(client, 999_999))).rejects.toThrow(
      /no session with that id/i,
    )
    await expect(
      withDb(async (client) => {
        const { rows } = await client.query('select pg_backend_pid() as pid')
        return cancelQuery(client, (rows[0] as { pid: number }).pid)
      }),
    ).rejects.toThrow(/own connection/i)
  })

  it('cancels a running statement without closing the connection', async () => {
    const victim = new pg.Client({ connectionString: process.env.POSTGRES_URL })
    await victim.connect()
    try {
      // A statement long enough to be caught mid-flight, cancelled from the page's connection.
      const running = victim.query('select pg_sleep(10)').catch((error: Error) => error)
      await new Promise((resolve) => setTimeout(resolve, 300))

      await withDb((client) =>
        cancelQuery(client, (victim as unknown as { processID: number }).processID),
      )
      const outcome = await running
      expect(outcome).toBeInstanceOf(Error)
      expect(String((outcome as Error).message)).toMatch(/canceling statement/i)

      // The connection survives a cancel, which is the difference from terminate.
      const alive = await victim.query('select 1 as ok')
      expect((alive.rows[0] as { ok: number }).ok).toBe(1)
    } finally {
      await victim.end()
    }
  })

  it('terminates a session, rolling its transaction back', async () => {
    const victim = new pg.Client({ connectionString: process.env.POSTGRES_URL })
    // The server ends the socket, so pg emits `error` with no query waiting: expected here.
    victim.on('error', () => undefined)
    await victim.connect()
    try {
      await withDb((client) =>
        terminateSession(client, (victim as unknown as { processID: number }).processID),
      )
      await expect(victim.query('select 1')).rejects.toThrow(/terminating|terminated|not queryable/i)

      const overview = await withDb((client) => listSessions(client))
      expect(overview.sessions.map((session) => session.pid)).not.toContain(
        (victim as unknown as { processID: number }).processID,
      )
    } finally {
      await victim.end().catch(() => undefined)
    }
  })
})
