import {
  filterParam,
  type RowFilter,
  type SortDirection,
} from '@/plugins/databaseTools/server/filters'

/**
 * The URL of one page of a table, and the API query that mirrors it.
 *
 * Plain functions in their own module because both sides need them: the server component builds the
 * pager and the sort links, and the client filter bar pushes the same shape. Keeping one builder
 * means a filter cannot survive a page change on one side and vanish on the other.
 */

export const tableHref = (
  base: string,
  table: string,
  options: {
    offset?: number
    sort?: string | null
    direction?: SortDirection
    filters?: RowFilter[]
  } = {},
): string => {
  const params = new URLSearchParams()
  params.set('table', table)
  if (options.sort) {
    params.set('sort', options.sort)
    params.set('dir', options.direction ?? 'asc')
  }
  if (options.offset && options.offset > 0) params.set('offset', String(options.offset))
  for (const filter of options.filters ?? []) params.append('f', filterParam(filter))
  return `${base}?${params.toString()}`
}

/** The same filters and sort for the endpoint (`/table?format=csv`). */
export const apiQuery = (
  page: { sort: string | null; direction: SortDirection; filters: RowFilter[] },
  extra: Record<string, string> = {},
): string => {
  const params = new URLSearchParams(extra)
  if (page.sort) {
    params.set('sort', page.sort)
    params.set('dir', page.direction)
  }
  for (const filter of page.filters) params.append('f', filterParam(filter))
  return params.toString()
}
