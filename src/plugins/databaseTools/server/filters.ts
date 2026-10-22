/**
 * The read-only browser's filters and sort, as query-string values.
 *
 * A filter is `column:operator:value`; the value may itself contain colons (`title:contains:10:30`),
 * so only the first two separators are significant. Parsing is separated from SQL building because
 * the operators and their meanings are a fixed list while the columns and their types come from the
 * catalogs — a name that is not a column is ignored rather than interpolated.
 */

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'starts',
  'gt',
  'gte',
  'lt',
  'lte',
  'isnull',
  'notnull',
] as const

export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export type RowFilter = { column: string; operator: FilterOperator; value?: string }

/** What the UI calls each operator, and whether it takes a value. */
export const FILTER_LABELS: Record<FilterOperator, { label: string; needsValue: boolean }> = {
  eq: { label: 'is', needsValue: true },
  neq: { label: 'is not', needsValue: true },
  contains: { label: 'contains', needsValue: true },
  starts: { label: 'starts with', needsValue: true },
  gt: { label: 'greater than', needsValue: true },
  gte: { label: 'greater or equal', needsValue: true },
  lt: { label: 'less than', needsValue: true },
  lte: { label: 'less or equal', needsValue: true },
  isnull: { label: 'is empty', needsValue: false },
  notnull: { label: 'is not empty', needsValue: false },
}

/** At most this many filters per request: a link with more is a mistake, not a query plan. */
export const MAX_FILTERS = 8

const isOperator = (value: string): value is FilterOperator =>
  (FILTER_OPERATORS as readonly string[]).includes(value)

/**
 * Parse repeated `f=` values. Anything malformed is dropped: a hand-edited URL should narrow the
 * table, not fail the page. The caller decides whether to tell the user what was ignored.
 */
export const parseFilters = (raw: string | string[] | null | undefined): RowFilter[] => {
  const entries = raw === null || raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
  const filters: RowFilter[] = []
  for (const entry of entries.slice(0, MAX_FILTERS)) {
    const [column, operator, ...rest] = String(entry).split(':')
    if (!column || !operator || !isOperator(operator)) continue
    if (!/^[a-zA-Z0-9_]{1,63}$/.test(column)) continue
    const value = rest.join(':')
    if (FILTER_LABELS[operator].needsValue && value.length === 0) continue
    filters.push({ column, operator, value: FILTER_LABELS[operator].needsValue ? value : undefined })
  }
  return filters
}

export type SortDirection = 'asc' | 'desc'

export const parseDirection = (raw: unknown): SortDirection =>
  raw === 'desc' || raw === 'descending' ? 'desc' : 'asc'

export type SqlFilter = {
  /** `where` body with `$1…` placeholders that start at `params.length + 1`. */
  clause: string
  params: string[]
  /** The filters that named a column this table does not have. */
  ignored: string[]
}

/**
 * Build a parameterised `where` from the parsed filters.
 *
 * The column list comes from the catalogs, so a filter can only name a column that exists; the type
 * comes from `format_type` and is what the parameter is cast to, which is what makes `createdAt >
 * $1` compare dates rather than strings. `contains`/`starts` compare the column's text form, which
 * is the only sensible reading for a `jsonb` or an enum. A value that does not parse as the
 * column's type is a Postgres error the caller turns into a sentence.
 */
export const buildWhere = (
  filters: RowFilter[],
  columns: { name: string; type: string }[],
): SqlFilter => {
  const byName = new Map(columns.map((column) => [column.name, column]))
  const clauses: string[] = []
  const params: string[] = []
  const ignored: string[] = []

  for (const filter of filters) {
    const column = byName.get(filter.column)
    if (!column) {
      ignored.push(filter.column)
      continue
    }
    const ident = `"${column.name.replace(/"/g, '""')}"`
    const param = (value: string): string => {
      params.push(value)
      return `$${params.length}`
    }

    switch (filter.operator) {
      case 'isnull':
        clauses.push(`${ident} is null`)
        break
      case 'notnull':
        clauses.push(`${ident} is not null`)
        break
      case 'contains':
        clauses.push(`${ident}::text ilike '%' || ${param(filter.value ?? '')} || '%'`)
        break
      case 'starts':
        clauses.push(`${ident}::text ilike ${param(filter.value ?? '')} || '%'`)
        break
      default: {
        const operator = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[
          filter.operator
        ]
        // The cast is to the column's own type, so one code path compares numbers, dates, uuids…
        clauses.push(`${ident} ${operator} ${param(filter.value ?? '')}::${column.type}`)
      }
    }
  }

  return { clause: clauses.length > 0 ? `where ${clauses.join(' and ')}` : '', params, ignored }
}

/** A filter back to the query-string form, so a link can keep the others. */
export const filterParam = (filter: RowFilter): string =>
  [filter.column, filter.operator, filter.value ?? ''].join(':')
