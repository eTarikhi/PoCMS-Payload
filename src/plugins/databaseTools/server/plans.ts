import type pg from 'pg'

import { quoteTable } from './connection'
import { buildWhere, type RowFilter, type SortDirection } from './filters'
import {
  requireTable,
  ROW_LIMIT_MAX,
  ROW_PAGE_SIZE,
  sortClause,
  tableColumns,
} from './introspection'

/**
 * `EXPLAIN` for exactly the query the browser runs, so "why is this page slow?" has an answer
 * without a terminal.
 *
 * `EXPLAIN` without `ANALYZE` only asks the planner: nothing is executed, no row is read and no
 * lock beyond the catalog's is taken. The output is the planner's *estimate*, which is why the
 * notes below describe what the plan says rather than promising a speed-up — a sequential scan of a
 * 40-row table is the right plan, and an index hint would make it worse.
 *
 * The SQL is the page's own: same `where`, same `order by` (with the `ctid` tie-break), same
 * `limit`/`offset`, and the same catalog check on every column name. Values stay parameters.
 */

export type PlanNode = {
  depth: number
  /** `Seq Scan`, `Index Scan`, `Sort`, … */
  type: string
  relation: string | null
  index: string | null
  /** The planner's estimated rows out of this node. */
  rows: number
  /** Total cost in Postgres's arbitrary units, for comparing plans of the same query. */
  cost: number
  /** The node's condition or key, trimmed to something a table cell can show. */
  detail: string | null
}

export type QueryPlan = {
  table: string
  sql: string
  nodes: PlanNode[]
  totalCost: number
  rows: number
  /** `Seq Scan → Sort → Limit`, the shape in one line. */
  headline: string
  /** What the plan says about this query, in plain sentences. */
  notes: string[]
}

type RawPlan = Record<string, unknown> & { Plans?: RawPlan[] }

const DETAIL_KEYS = ['Index Cond', 'Filter', 'Sort Key', 'Hash Cond', 'Join Filter', 'Merge Cond']

const detailOf = (node: RawPlan): string | null => {
  for (const key of DETAIL_KEYS) {
    const value = node[key]
    if (typeof value === 'string' && value.length > 0) {
      return value.length > 160 ? `${value.slice(0, 157)}…` : value
    }
    if (Array.isArray(value) && value.length > 0) return value.join(', ')
  }
  return null
}

const flatten = (node: RawPlan, depth: number, nodes: PlanNode[]): void => {
  nodes.push({
    depth,
    type: String(node['Node Type'] ?? 'Unknown'),
    relation: typeof node['Relation Name'] === 'string' ? node['Relation Name'] : null,
    index: typeof node['Index Name'] === 'string' ? node['Index Name'] : null,
    rows: Math.round(Number(node['Plan Rows'] ?? 0)),
    cost: Number(Number(node['Total Cost'] ?? 0).toFixed(2)),
    detail: detailOf(node),
  })
  for (const child of node.Plans ?? []) flatten(child, depth + 1, nodes)
}

const notesFor = (nodes: PlanNode[], rows: number): string[] => {
  const notes: string[] = []
  for (const node of nodes) {
    if (node.type === 'Seq Scan' && node.relation) {
      notes.push(
        node.detail
          ? `Seq Scan on ${node.relation}: the whole table is read and the condition applied to every row, so the filter has no index it can use.`
          : `Seq Scan on ${node.relation}: the whole table is read. Right for a small table, and what the planner picks when no index helps.`,
      )
    }
    if (
      node.type === 'Index Scan' ||
      node.type === 'Index Only Scan' ||
      node.type === 'Bitmap Index Scan'
    ) {
      const target = node.index ?? node.relation ?? 'an index'
      notes.push(`${node.type} on ${target}: the index is what narrows the rows down.`)
    }
    // The browser's default order is physical (`ctid`); a Sort for it is expected, not a finding.
    if (node.type === 'Sort' && node.detail && node.detail !== 'ctid') {
      notes.push(`Sort on ${node.detail}: no index provides this order, so the rows are sorted.`)
    }
  }
  if (nodes.length > 0 && nodes[0].type === 'Limit' && rows <= ROW_PAGE_SIZE) {
    notes.push(`Limit ${rows}: only one page is requested, so the work stops early.`)
  }
  return notes.slice(0, 6)
}

export const explainRows = async (
  client: pg.Client,
  name: string,
  options: {
    limit?: number
    offset?: number
    sort?: string | null
    direction?: SortDirection
    filters?: RowFilter[]
  } = {},
): Promise<QueryPlan> => {
  const table = await requireTable(client, name)
  const limit = Math.min(Math.max(1, options.limit ?? ROW_PAGE_SIZE), ROW_LIMIT_MAX)
  const offset = Math.max(0, options.offset ?? 0)
  const columns = await tableColumns(client, table.oid)
  const where = buildWhere(options.filters ?? [], columns)
  const sql =
    `select * from ${quoteTable(table.name)} ${where.clause} ` +
    `${sortClause(options.sort, options.direction ?? 'asc', columns)} limit ${limit} offset ${offset}`

  // No ANALYZE: the statement is planned, never run. Parameters still need their values.
  const { rows } = await client.query<{ 'QUERY PLAN': { Plan: RawPlan }[] }>(
    `explain (format json) ${sql}`,
    where.params,
  )
  const root = rows[0]?.['QUERY PLAN']?.[0]?.Plan
  if (!root) {
    return {
      table: table.name,
      sql,
      nodes: [],
      totalCost: 0,
      rows: 0,
      headline: 'No plan',
      notes: [],
    }
  }

  const nodes: PlanNode[] = []
  flatten(root, 0, nodes)
  const headline = nodes
    .filter((node, index) => index === 0 || node.depth > 0)
    .slice(0, 5)
    .map((node) =>
      node.relation && node.type !== 'Seq Scan' ? `${node.type} ${node.relation}` : node.type,
    )
    .join(' → ')

  return {
    table: table.name,
    sql,
    nodes: nodes.slice(0, 24),
    totalCost: Number(Number(root['Total Cost'] ?? 0).toFixed(2)),
    rows: Math.round(Number(root['Plan Rows'] ?? 0)),
    headline,
    notes: notesFor(nodes, limit),
  }
}
