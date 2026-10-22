import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import {
  ActivityIcon,
  ArrowLeftIcon,
  DatabaseIcon,
  FileCode2Icon,
  GitBranchIcon,
  HardDriveDownloadIcon,
  InfoIcon,
  LayersIcon,
  ShieldCheckIcon,
  SproutIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { buttonVariants } from '@/components/admin/elements/Button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/admin/elements/Card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import {
  databaseTarget,
  isServerless,
  withDatabase,
} from '@/plugins/databaseTools/server/connection'
import {
  parseDirection,
  parseFilters,
  type RowFilter,
  type SortDirection,
} from '@/plugins/databaseTools/server/filters'
import {
  overview,
  readRows,
  ROW_PAGE_SIZE,
  resolveTable,
  tableDetail,
  tableDdl,
} from '@/plugins/databaseTools/server/introspection'
import { explainRows } from '@/plugins/databaseTools/server/plans'
import { indexReport } from '@/plugins/databaseTools/server/advisors'
import { NeonClient, neonConsoleUrl } from '@/plugins/databaseTools/server/neon'
import { runRepairChecks } from '@/plugins/databaseTools/server/repair'
import {
  listSessions,
  LONG_RUNNING_SECONDS,
  type SessionOverview,
} from '@/plugins/databaseTools/server/sessions'
import {
  neonOptions,
  resolveOptions,
  type ResolvedDatabaseToolsOptions,
} from '@/plugins/databaseTools/options'
import { formatBytes } from '@/system/status'

import {
  DatabaseToolsApi,
  MaintenanceButtons,
  NeonBackupForm,
  NeonDeleteBranch,
  NeonRestoreForm,
  RepairAllButton,
  RepairButton,
  RestorePanel,
  SeedPanel,
} from './Actions'
import { SessionsPanel } from './Sessions'
import { TableBrowser } from './TableBrowser'

/**
 * `/admin/database` (the database-tools plugin's view): the tables, a logical backup and restore,
 * the maintenance Postgres can do itself, the repairs that are safe to automate, and the Neon
 * branch operations that SQL cannot express.
 *
 * The component is a server component and the plugin passes it the resolved options as
 * `serverProps.databaseTools` — the same object the endpoints closed over, so the access rule, the
 * paths, the migration list and the Neon settings cannot drift apart between the page, the link and
 * the API. Everything it hands to the client components is serialisable; the functions stay here.
 *
 * The page states its own limits instead of hiding them: a read-only table browser (content goes
 * through the collections, so hooks and access rules still apply), a `.sql`/`.json` backup that is
 * logical rather than a byte-for-byte copy, maintenance that is not `VACUUM FULL`, and a Neon card
 * that is either live or explains the settings that make it live.
 */

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="acn:rounded-sm acn:bg-muted acn:px-1.5 acn:py-0.5 acn:font-mono acn:text-xs acn:text-foreground">
    {children}
  </code>
)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="acn:grid acn:grid-cols-[10rem_1fr] acn:gap-3 acn:py-1.5">
      <dt className="acn:m-0 acn:text-muted-foreground">{label}</dt>
      <dd className="acn:m-0 acn:min-w-0 acn:break-words">{children}</dd>
    </div>
  )
}

const TONE = { ok: 'secondary', warn: 'outline', error: 'destructive' } as const

/** What a Neon timestamp input needs: `YYYY-MM-DDTHH:mm:ss` in the admin's browser, UTC here. */
const nowForInput = (): string => new Date().toISOString().slice(0, 19)

/**
 * Everything the page reads, in one connection. Each part degrades on its own: a table name that
 * does not exist shows the list with a notice instead of failing the whole page, and the repair
 * checks run whether or not a table was selected.
 */
async function readDatabase(request: {
  table: string | null
  offset: number
  sort: string | null
  direction: SortDirection
  filters: RowFilter[]
  migrationNames: string[]
  sessions: boolean
}) {
  return withDatabase(async (client) => {
    const summary = await overview(client)
    let detail = null
    let ddl = null
    let page = null
    let plan = null
    let tableError: string | null = null
    if (request.table) {
      const found = await resolveTable(client, request.table)
      if (found) {
        detail = await tableDetail(client, found.name)
        ddl = await tableDdl(client, found.name)
        page = await readRows(client, found.name, {
          limit: ROW_PAGE_SIZE,
          offset: request.offset,
          sort: request.sort,
          direction: request.direction,
          filters: request.filters,
        })
        // A plan the planner refuses (an exotic cast, a bug in our SQL) must not take the page down.
        plan = await explainRows(client, found.name, {
          limit: ROW_PAGE_SIZE,
          offset: request.offset,
          sort: request.sort,
          direction: request.direction,
          filters: request.filters,
        }).catch(() => null)
      } else {
        tableError = `There is no table called “${request.table}” in the public schema.`
      }
    }
    const repairs = await runRepairChecks(client, request.migrationNames)
    const indexes = await indexReport(client)
    const sessions = request.sessions ? await listSessions(client) : null
    return { summary, detail, ddl, page, plan, tableError, repairs, sessions, indexes }
  })
}

type NeonState =
  | { configured: false }
  | { configured: true; ok: false; error: string }
  | {
      configured: true
      ok: true
      projectId: string
      projectName: string
      branchId: string
      branches: Awaited<ReturnType<NeonClient['branches']>>
    }

async function readNeon(options: ResolvedDatabaseToolsOptions): Promise<NeonState> {
  if (options.neon === false) return { configured: false }
  const client = new NeonClient(neonOptions(options))
  if (!client.configured) return { configured: false }
  try {
    const resolved = await client.resolve()
    return {
      configured: true,
      ok: true,
      projectId: resolved.projectId,
      projectName: resolved.projectName,
      branchId: resolved.branchId,
      branches: await client.branches(),
    }
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function DatabaseView({
  databaseTools,
  i18n,
  initPageResult,
  params,
  payload,
  searchParams,
  user,
  viewActions,
}: AdminViewServerProps & { databaseTools?: ResolvedDatabaseToolsOptions }) {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = payload.config.routes.admin
  // Registered by the plugin with the resolved options; the fallback (defaults, this checkout's
  // migrations) keeps the component usable if it is ever mounted by hand.
  const options = databaseTools ?? resolveOptions()
  const pageHref = `${adminRoute}${options.pagePath}`

  if (!req.user) {
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(pageHref)}`)
  }
  // The same function the endpoints call, with the same request. A throw or a rejection means no.
  let allowed = false
  try {
    allowed = Boolean(await options.access({ req }))
  } catch (error) {
    payload.logger.error({ msg: 'Database tools access check failed', err: error })
  }
  if (!allowed) notFound()

  const rawTable = typeof searchParams?.table === 'string' ? searchParams.table : null
  const table = rawTable && /^[a-zA-Z0-9_-]{1,63}$/.test(rawTable) ? rawTable : null
  const offset = Math.max(0, Number(searchParams?.offset ?? 0) || 0)
  // One filter (`f=`) is repeated for each condition; a hand-edited value that does not parse is
  // dropped here and reported by the table when it turns out to name no column.
  const rawFilters = searchParams?.f
  const filters = parseFilters(
    Array.isArray(rawFilters) ? rawFilters : rawFilters ? [rawFilters] : [],
  )
  const rawSort = typeof searchParams?.sort === 'string' ? searchParams.sort : null
  const sort = rawSort && /^[a-zA-Z0-9_]{1,63}$/.test(rawSort) ? rawSort : null
  const direction = parseDirection(searchParams?.dir)
  const target = databaseTarget()

  let data: Awaited<ReturnType<typeof readDatabase>> | null = null
  let databaseError: string | null = null
  try {
    data = await readDatabase({
      table,
      offset,
      sort,
      direction,
      filters,
      migrationNames: options.migrations,
      sessions: options.sessions,
    })
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error)
  }

  const neon = await readNeon(options)
  const fixable = data?.repairs.checks.filter((check) => check.fixable) ?? []
  // Payload mounts the plugin's endpoints under the API route (`/api` by default).
  const apiBase = `${payload.config.routes.api}${options.apiBasePath}`
  const backupQuery = (extra: string) => `${apiBase}/backup?${extra}`

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      viewActions={viewActions}
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <Gutter>
        <SetStepNav nav={[{ label: options.title }]} />
        <DatabaseToolsApi apiBase={apiBase}>
          <div data-testid="database" className="acn:space-y-6 acn:pt-6 acn:pb-16">
            <header className="acn:space-y-1">
              <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">
                {options.title}
              </h1>
              <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
                The tables behind the content, a logical backup you can restore into an empty
                database, the maintenance Postgres can run on itself, the repairs that are safe to
                automate, and — on Neon — branches and point-in-time restore. Every action passes
                the plugin’s access rule and is written to the audit log.
              </p>
            </header>

            {databaseError ? (
              <div className="acn:flex acn:items-start acn:gap-2 acn:rounded-lg acn:border acn:border-destructive/30 acn:bg-destructive/10 acn:p-4 acn:text-sm acn:text-destructive-emphasis">
                <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-4 acn:shrink-0" />
                <div>
                  <p className="acn:m-0 acn:font-medium">The database could not be read.</p>
                  <p className="acn:m-0 acn:mt-1 acn:text-xs">{databaseError}</p>
                  <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                    The connection comes from <Code>DATABASE_DIRECT_URL</Code> or{' '}
                    <Code>POSTGRES_URL</Code>; it is not shown here.
                  </p>
                </div>
              </div>
            ) : null}

            {data ? (
              <>
                <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                          <DatabaseIcon
                            aria-hidden
                            className="acn:size-4 acn:text-muted-foreground"
                          />
                          Connection
                        </h2>
                      </CardTitle>
                      <CardDescription>
                        {target.host}:{target.port}/{target.database} · from{' '}
                        <Code>{target.source}</Code>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <dl className="acn:m-0 acn:divide-y acn:divide-border">
                        <Row label="Server">
                          <span className="acn:text-xs">{data.summary.version.split(',')[0]}</span>
                        </Row>
                        <Row label="Size">
                          {formatBytes(data.summary.sizeBytes)} across {data.summary.tables.length}{' '}
                          tables
                        </Row>
                        <Row label="Connections">
                          {data.summary.connections} of {data.summary.maxConnections}
                        </Row>
                        <Row label="Cache hit">
                          {(data.summary.cacheHitRatio * 100).toFixed(1)}% ·{' '}
                          {data.summary.uptime ?? '–'} uptime
                        </Row>
                        <Row label="Endpoint">
                          {target.pooled ? (
                            <span className="acn:flex acn:flex-col acn:gap-1">
                              <Badge variant="outline">Pooled</Badge>
                              <span className="acn:text-xs acn:text-muted-foreground">
                                The app connects through PgBouncer. Maintenance and dumps here use
                                the same URL; set <Code>DATABASE_DIRECT_URL</Code> (the endpoint
                                without <Code>-pooler</Code>) when a long export is cut off.
                              </span>
                            </span>
                          ) : isServerless() ? (
                            <Badge variant="outline">Direct (serverless)</Badge>
                          ) : (
                            <Badge variant="outline">Direct</Badge>
                          )}
                        </Row>
                        <Row label="Migrations">
                          {data.summary.migrations.length} applied
                          {fixable.length > 0 ? ` · ${fixable.length} repair(s) available` : ''}
                        </Row>
                      </dl>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                          <HardDriveDownloadIcon
                            aria-hidden
                            className="acn:size-4 acn:text-muted-foreground"
                          />
                          Backup
                        </h2>
                      </CardTitle>
                      <CardDescription>
                        A logical dump: types, tables, keys, data, indexes. Restores into an empty
                        database with <Code>psql -f</Code> or the restore card below.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="acn:space-y-3">
                      <div className="acn:flex acn:flex-wrap acn:gap-2">
                        <a
                          className={buttonVariants({ size: 'sm' })}
                          href={backupQuery('format=sql')}
                        >
                          <HardDriveDownloadIcon aria-hidden />
                          Download SQL
                        </a>
                        {table ? (
                          <a
                            className={buttonVariants({ size: 'sm', variant: 'outline' })}
                            href={backupQuery(`format=sql&tables=${encodeURIComponent(table)}`)}
                          >
                            This table only
                          </a>
                        ) : null}
                        <a
                          className={buttonVariants({ size: 'sm', variant: 'outline' })}
                          href={backupQuery('format=sql&schemaOnly=1')}
                        >
                          Schema only
                        </a>
                        <a
                          className={buttonVariants({ size: 'sm', variant: 'outline' })}
                          href={backupQuery('format=json')}
                        >
                          JSON
                        </a>
                      </div>
                      <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                        Includes every <Code>public</Code> table except Payload’s internal
                        bookkeeping (migrations, locks, preferences, jobs). Row values are rendered
                        by Postgres with <Code>format(’%L’, …)</Code>, so enums, timestamps,{' '}
                        <Code>jsonb</Code> and <Code>bytea</Code> round-trip exactly. Capped at{' '}
                        {options.backup.maxRowsPerTable.toLocaleString('en')} rows per table; for a
                        byte-exact copy use a Neon branch.
                      </p>
                    </CardContent>
                  </Card>

                  {options.snapshots !== false ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                            <FileCode2Icon
                              aria-hidden
                              className="acn:size-4 acn:text-muted-foreground"
                            />
                            From this database
                          </h2>
                        </CardTitle>
                        <CardDescription>
                          Two files read out of{' '}
                          {target.host ? (
                            <Code>
                              {target.database ? `${target.host}/${target.database}` : target.host}
                            </Code>
                          ) : (
                            'this database'
                          )}
                          : a Payload migration written from the catalogs, and a content seed for a
                          local database.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="acn:space-y-3">
                        <div className="acn:flex acn:flex-wrap acn:gap-2">
                          <a
                            className={buttonVariants({ size: 'sm' })}
                            href={`${apiBase}/migration?mode=guarded`}
                          >
                            <FileCode2Icon aria-hidden />
                            Migration (.ts)
                          </a>
                          <a
                            className={buttonVariants({ size: 'sm', variant: 'outline' })}
                            href={`${apiBase}/migration?mode=fresh`}
                          >
                            From-scratch mode
                          </a>
                          <a
                            className={buttonVariants({ size: 'sm', variant: 'outline' })}
                            href={`${apiBase}/seed`}
                          >
                            <SproutIcon aria-hidden />
                            Seed (.json)
                          </a>
                          {table ? (
                            <a
                              className={buttonVariants({ size: 'sm', variant: 'outline' })}
                              href={`${apiBase}/seed?tables=${encodeURIComponent(table)}`}
                            >
                              This table only
                            </a>
                          ) : null}
                        </div>
                        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                          <strong className="acn:font-medium acn:text-foreground">
                            The migration
                          </strong>{' '}
                          is every statement Postgres itself deparses for the tables here — types,
                          sequences, columns, keys, indexes, foreign keys. Guarded mode (the
                          default) wraps each one so running it twice changes nothing, which is what
                          makes it safe to commit next to the migrations you have. From-scratch mode
                          emits plain <Code>CREATE</Code>s with a <Code>down</Code> that drops them,
                          for a file that defines a database on its own. Neither carries rows,
                          ownership, grants or extensions.
                        </p>
                        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                          <strong className="acn:font-medium acn:text-foreground">The seed</strong>{' '}
                          holds the collections this config defines — never users, roles, jobs, the
                          audit log or Payload’s own tables — parents before children, capped at{' '}
                          {options.snapshots.maxRowsPerTable.toLocaleString('en')} rows per table,
                          with the sequence values to set afterwards so the next insert does not
                          collide. <Code>pnpm db:seed-from --from neon</Code> writes the same file
                          into the checkout; <Code>--apply</Code> loads it into the local database.
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                        <DatabaseIcon
                          aria-hidden
                          className="acn:size-4 acn:text-muted-foreground"
                        />
                        Tables
                      </h2>
                    </CardTitle>
                    <CardDescription>
                      {table
                        ? 'One table: columns, indexes and a read-only page of rows.'
                        : `All ${data.summary.tables.length} tables in the public schema, largest first.`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.tableError ? (
                      <p className="acn:m-0 acn:mb-3 acn:flex acn:items-center acn:gap-1.5 acn:text-xs acn:text-destructive">
                        <TriangleAlertIcon aria-hidden className="acn:size-3.5" />
                        {data.tableError}
                      </p>
                    ) : null}
                    {data.detail && data.page ? (
                      <div className="acn:space-y-4">
                        <Link
                          className="acn:inline-flex acn:items-center acn:gap-1 acn:text-xs acn:text-primary acn:hover:underline"
                          href={pageHref}
                        >
                          <ArrowLeftIcon aria-hidden className="acn:size-3.5" />
                          All tables
                        </Link>
                        <TableBrowser
                          detail={data.detail}
                          ddl={data.ddl}
                          plan={data.plan}
                          page={data.page}
                          adminRoute={adminRoute}
                          apiBase={apiBase}
                        />
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Table</TableHead>
                            <TableHead className="acn:text-right">Rows (estimate)</TableHead>
                            <TableHead className="acn:text-right">Size</TableHead>
                            <TableHead className="acn:text-right">Dead</TableHead>
                            <TableHead>Last vacuum</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.summary.tables.map((entry) => (
                            <TableRow key={entry.name}>
                              <TableCell className="acn:font-mono acn:text-xs">
                                {entry.name}
                              </TableCell>
                              <TableCell className="acn:text-right acn:tabular-nums">
                                {entry.rows.toLocaleString('en')}
                              </TableCell>
                              <TableCell className="acn:text-right acn:tabular-nums">
                                {formatBytes(entry.bytes)}
                              </TableCell>
                              <TableCell className="acn:text-right acn:tabular-nums">
                                {entry.deadRows > 0 ? entry.deadRows.toLocaleString('en') : '–'}
                              </TableCell>
                              <TableCell className="acn:text-xs acn:text-muted-foreground">
                                {entry.lastVacuum
                                  ? new Date(entry.lastVacuum).toLocaleString('en')
                                  : 'never'}
                              </TableCell>
                              <TableCell className="acn:text-right">
                                <Link
                                  className={buttonVariants({ size: 'xs', variant: 'outline' })}
                                  href={`${pageHref}?table=${encodeURIComponent(entry.name)}`}
                                >
                                  Browse
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                        <LayersIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                        Indexes
                      </h2>
                    </CardTitle>
                    <CardDescription>
                      {data.indexes.total} indexes across {data.indexes.tables} tables ·{' '}
                      {data.indexes.unused.length} never scanned, {data.indexes.duplicates.length}{' '}
                      duplicated, {data.indexes.invalid.length} invalid
                      {data.indexes.since
                        ? ` · counting since ${new Date(data.indexes.since).toLocaleString('en')}`
                        : ''}
                      . Nothing is dropped from here: removing an index is a schema change.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="acn:space-y-3">
                    {data.indexes.invalid.length > 0 ? (
                      <div>
                        <p className="acn:m-0 acn:text-sm acn:font-medium">Invalid: rebuild them</p>
                        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                          A failed <Code>CREATE INDEX CONCURRENTLY</Code> leaves an index the
                          planner cannot use. <strong>Reindex invalid indexes</strong> in
                          Maintenance rebuilds them.
                        </p>
                        <ul className="acn:m-0 acn:mt-1 acn:space-y-0.5 acn:text-xs">
                          {data.indexes.invalid.map((index) => (
                            <li key={index.index} className="acn:flex acn:items-center acn:gap-2">
                              <TriangleAlertIcon
                                aria-hidden
                                className="acn:size-3.5 acn:text-destructive"
                              />
                              <span className="acn:font-mono">
                                {index.table}.{index.index}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {data.indexes.duplicates.length > 0 ? (
                      <div>
                        <p className="acn:m-0 acn:text-sm acn:font-medium">Duplicated</p>
                        <ul className="acn:m-0 acn:mt-1 acn:space-y-0.5 acn:text-xs">
                          {data.indexes.duplicates.map((duplicate) => (
                            <li key={`${duplicate.table}-${duplicate.kept}`}>
                              <span className="acn:font-mono">{duplicate.table}</span>: keep{' '}
                              <span className="acn:font-mono">{duplicate.kept}</span>, drop{' '}
                              <span className="acn:font-mono">
                                {duplicate.redundant.join(', ')}
                              </span>{' '}
                              <span className="acn:text-muted-foreground">
                                ({formatBytes(duplicate.bytes)} each)
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {data.indexes.unused.length > 0 ? (
                      <div>
                        <p className="acn:m-0 acn:text-sm acn:font-medium">Never scanned</p>
                        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                          Zero scans since the counters last started, on tables that have been read.
                          A hint, not a verdict: a small site scans little, and an index that serves
                          one admin query a week still earns its space.
                        </p>
                        <ul className="acn:m-0 acn:mt-1 acn:space-y-0.5 acn:text-xs">
                          {data.indexes.unused.slice(0, 8).map((index) => (
                            <li key={index.index} className="acn:flex acn:flex-wrap acn:gap-2">
                              <span className="acn:font-mono">
                                {index.table}.{index.index}
                              </span>
                              <span className="acn:text-muted-foreground">
                                {formatBytes(index.bytes)} · {index.scans} scans
                              </span>
                            </li>
                          ))}
                          {data.indexes.unused.length > 8 ? (
                            <li className="acn:text-muted-foreground">
                              and {data.indexes.unused.length - 8} more…
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}

                    {data.indexes.unused.length === 0 &&
                    data.indexes.duplicates.length === 0 &&
                    data.indexes.invalid.length === 0 ? (
                      <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                        Nothing stands out: every index has been scanned, none is duplicated and
                        none is invalid.
                      </p>
                    ) : null}

                    <div>
                      <p className="acn:m-0 acn:text-sm acn:font-medium">Largest</p>
                      <ul className="acn:m-0 acn:mt-1 acn:space-y-0.5 acn:text-xs">
                        {data.indexes.largest.map((index) => (
                          <li key={index.index} className="acn:flex acn:flex-wrap acn:gap-2">
                            <span className="acn:font-mono">
                              {index.table}.{index.index}
                            </span>
                            <span className="acn:text-muted-foreground">
                              {formatBytes(index.bytes)} · {index.scans.toLocaleString('en')} scans
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                          <ShieldCheckIcon
                            aria-hidden
                            className="acn:size-4 acn:text-muted-foreground"
                          />
                          Maintenance
                        </h2>
                      </CardTitle>
                      <CardDescription>
                        Postgres’ own upkeep, on demand. <Code>VACUUM FULL</Code> is deliberately
                        not offered: it locks the table for the whole rewrite.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <MaintenanceButtons table={table ?? undefined} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                          <WrenchIcon
                            aria-hidden
                            className="acn:size-4 acn:text-muted-foreground"
                          />
                          Health and repair
                        </h2>
                      </CardTitle>
                      <CardDescription>
                        {data.repairs.checks.filter((check) => check.status !== 'ok').length === 0
                          ? 'Every check passes.'
                          : `${data.repairs.checks.filter((check) => check.status !== 'ok').length} check(s) need attention.`}{' '}
                        Read at {new Date(data.repairs.checkedAt).toLocaleTimeString('en')}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="acn:space-y-3">
                      {fixable.length > 0 ? (
                        <div className="acn:flex acn:justify-end">
                          <RepairAllButton count={fixable.length} />
                        </div>
                      ) : null}
                      <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:divide-y acn:divide-border acn:p-0">
                        {data.repairs.checks.map((check) => (
                          <li
                            key={check.id}
                            className="acn:flex acn:items-start acn:justify-between acn:gap-3 acn:py-2.5"
                          >
                            <div className="acn:min-w-0">
                              <p className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-sm acn:font-medium">
                                {check.title}
                                <Badge variant={TONE[check.status]}>
                                  {check.status === 'ok'
                                    ? 'OK'
                                    : check.status === 'warn'
                                      ? 'Check'
                                      : 'Fix'}
                                </Badge>
                              </p>
                              <p className="acn:m-0 acn:mt-0.5 acn:text-xs acn:text-muted-foreground">
                                {check.summary}
                              </p>
                              {check.details.length > 0 ? (
                                <ul className="acn:m-0 acn:mt-1 acn:list-disc acn:space-y-0.5 acn:pl-4 acn:text-xs acn:text-muted-foreground">
                                  {check.details.slice(0, 5).map((detail) => (
                                    <li key={detail} className="acn:break-words">
                                      {detail}
                                    </li>
                                  ))}
                                  {check.details.length > 5 ? (
                                    <li>and {check.details.length - 5} more…</li>
                                  ) : null}
                                </ul>
                              ) : null}
                            </div>
                            {check.fixable ? (
                              <RepairButton
                                check={check.id}
                                label={
                                  check.id === 'sequences'
                                    ? 'Fix sequences'
                                    : check.id === 'orphans'
                                      ? 'Delete orphans'
                                      : check.id === 'indexes'
                                        ? 'Rebuild'
                                        : 'Analyze'
                                }
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                        Fixes are narrow and idempotent: <Code>setval</Code> to the highest id,{' '}
                        <Code>DELETE</Code> of rows whose parent is gone,{' '}
                        <Code>REINDEX CONCURRENTLY</Code> and <Code>ANALYZE</Code>. Nothing rewrites
                        content.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {options.sessions && data.sessions ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                          <ActivityIcon
                            aria-hidden
                            className="acn:size-4 acn:text-muted-foreground"
                          />
                          Sessions and locks
                        </h2>
                      </CardTitle>
                      <CardDescription>
                        What is connected right now, what has been running for longer than{' '}
                        {LONG_RUNNING_SECONDS} s, and who is waiting for whom. Cancel stops one
                        statement and keeps the connection; ending a session rolls its transaction
                        back.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <SessionsPanel
                        overview={data.sessions as SessionOverview}
                        longRunningSeconds={LONG_RUNNING_SECONDS}
                      />
                    </CardContent>
                  </Card>
                ) : null}

                {options.neon !== false ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                          <GitBranchIcon
                            aria-hidden
                            className="acn:size-4 acn:text-muted-foreground"
                          />
                          Neon branches and point-in-time restore
                        </h2>
                      </CardTitle>
                      <CardDescription>
                        A branch and its history live in the project’s storage, not in a table: only
                        the Neon API can create one or move a branch in time. SQL tools cannot do
                        it.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="acn:space-y-4">
                      {!neon.configured ? (
                        <div className="acn:flex acn:items-start acn:gap-2 acn:rounded-lg acn:bg-muted acn:p-3 acn:text-sm">
                          <InfoIcon
                            aria-hidden
                            className="acn:mt-0.5 acn:size-4 acn:shrink-0 acn:text-muted-foreground"
                          />
                          <div className="acn:space-y-1">
                            <p className="acn:m-0 acn:font-medium">Not connected to the Neon API</p>
                            <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                              Set <Code>NEON_API_KEY</Code> (Neon console → Account settings → API
                              keys) to create branches and restore this project to a point in time
                              from here. <Code>NEON_PROJECT_ID</Code> and{' '}
                              <Code>NEON_BRANCH_ID</Code> skip the discovery request. Until then the{' '}
                              <a
                                className="acn:text-primary acn:underline-offset-4 acn:hover:underline"
                                href={neonConsoleUrl()}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Neon console
                              </a>{' '}
                              does the same thing.
                            </p>
                          </div>
                        </div>
                      ) : !neon.ok ? (
                        <div className="acn:flex acn:items-start acn:gap-2 acn:rounded-lg acn:border acn:border-destructive/30 acn:bg-destructive/10 acn:p-3 acn:text-sm">
                          <TriangleAlertIcon
                            aria-hidden
                            className="acn:mt-0.5 acn:size-4 acn:shrink-0"
                          />
                          <div>
                            <p className="acn:m-0 acn:font-medium">
                              The Neon API refused the request.
                            </p>
                            <p className="acn:m-0 acn:mt-1 acn:text-xs">{neon.error}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2 acn:text-xs">
                            <Badge variant="secondary">Connected</Badge>
                            <span className="acn:text-muted-foreground">
                              Project <strong>{neon.projectName}</strong> · branch{' '}
                              <Code>{neon.branchId}</Code> ·{' '}
                              <a
                                className="acn:text-primary acn:hover:underline"
                                href={neonConsoleUrl(neon.projectId)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open the console
                              </a>
                            </span>
                          </div>

                          <div className="acn:space-y-4 acn:rounded-lg acn:border acn:border-border acn:p-3">
                            <div>
                              <h3 className="acn:m-0 acn:text-sm acn:font-medium">
                                Backup: a branch at this moment
                              </h3>
                              <p className="acn:m-0 acn:mb-2 acn:text-xs acn:text-muted-foreground">
                                Copy-on-write, so it only costs the data that later changes.
                                Restoring it is instant.
                              </p>
                              <NeonBackupForm
                                defaultName={`backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`}
                              />
                            </div>

                            <div className="acn:border-t acn:border-border acn:pt-3">
                              <h3 className="acn:m-0 acn:text-sm acn:font-medium">
                                Point-in-time restore
                              </h3>
                              <p className="acn:m-0 acn:mb-2 acn:text-xs acn:text-muted-foreground">
                                Replaces every table with the branch’s state at the chosen time.
                                Neon keeps the history for the project’s retention window (a day on
                                the free plan). The current state is kept as a branch, and branches
                                created from this one move with it.
                              </p>
                              <NeonRestoreForm latest={nowForInput()} />
                            </div>
                          </div>

                          <div>
                            <h3 className="acn:m-0 acn:mb-2 acn:text-sm acn:font-medium">
                              Branches{' '}
                              <span className="acn:font-normal acn:text-muted-foreground">
                                ({neon.branches.length})
                              </span>
                            </h3>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Name</TableHead>
                                  <TableHead>State</TableHead>
                                  <TableHead>Created</TableHead>
                                  <TableHead className="acn:text-right"> </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {neon.branches.map((branch) => (
                                  <TableRow key={branch.id}>
                                    <TableCell className="acn:text-xs">
                                      <span className="acn:font-medium">{branch.name}</span>
                                      {branch.default ? (
                                        <Badge variant="secondary" className="acn:ml-1.5">
                                          primary
                                        </Badge>
                                      ) : null}
                                      <span className="acn:mt-0.5 acn:block acn:font-mono acn:text-muted-foreground">
                                        {branch.id}
                                      </span>
                                    </TableCell>
                                    <TableCell className="acn:text-xs">{branch.state}</TableCell>
                                    <TableCell className="acn:text-xs acn:text-muted-foreground">
                                      {branch.createdAt
                                        ? new Date(branch.createdAt).toLocaleString('en')
                                        : '–'}
                                    </TableCell>
                                    <TableCell className="acn:text-right">
                                      {branch.default || branch.protected ? (
                                        <span className="acn:text-xs acn:text-muted-foreground">
                                          {branch.protected ? 'protected' : 'primary'}
                                        </span>
                                      ) : (
                                        <NeonDeleteBranch branchId={branch.id} name={branch.name} />
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : null}

                {options.restore !== false ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                          <ShieldCheckIcon
                            aria-hidden
                            className="acn:size-4 acn:text-muted-foreground"
                          />
                          Restore from a file
                        </h2>
                      </CardTitle>
                      <CardDescription>
                        Check the file first, then confirm. The database must be empty unless you
                        type the confirmation — and the server checks that again. Up to{' '}
                        {Math.round(options.restore.maxBytes / 1024 / 1024)} MB.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RestorePanel />
                    </CardContent>
                  </Card>
                ) : null}

                {options.snapshots !== false && options.snapshots.apply ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                          <SproutIcon
                            aria-hidden
                            className="acn:size-4 acn:text-muted-foreground"
                          />
                          Load a seed
                        </h2>
                      </CardTitle>
                      <CardDescription>
                        A seed file replaces the rows of the tables it names — the way a local
                        database takes on the content of a Neon branch. It runs in one transaction,
                        so a failure changes nothing, and it never touches users, roles, jobs or the
                        audit log because a seed does not carry them.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <SeedPanel />
                    </CardContent>
                  </Card>
                ) : null}
              </>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                    <InfoIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    What this page cannot do
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="acn:m-0 acn:list-disc acn:space-y-1.5 acn:pl-5 acn:text-sm">
                  <li>
                    <strong>Edit rows.</strong> Content changes go through the collections; a cell
                    editor here would skip validation, the audit log and cache revalidation.
                  </li>
                  <li>
                    <strong>Create or drop databases.</strong> The connection names one database,
                    and a serverless cluster usually has no superuser. Use the Neon console or{' '}
                    <Code>psql</Code>.
                  </li>
                  <li>
                    <strong>Point-in-time restore without the Neon API.</strong> History is project
                    storage, not SQL.{' '}
                    {options.neon !== false ? (
                      <>
                        With <Code>NEON_API_KEY</Code> the card above does it; otherwise the console
                        does.
                      </>
                    ) : (
                      <>The plugin is configured without Neon, so the console does it.</>
                    )}
                  </li>
                  <li>
                    <strong>
                      Run <Code>pg_dump</Code>/<Code>psql</Code>.
                    </strong>{' '}
                    The server may not have them installed. The backup here is generated by Postgres
                    itself and lands in the browser as a file.
                  </li>
                  <li>
                    <strong>See other databases or roles on the server.</strong> A serverless role
                    is scoped to its own database; the page shows what the connection can see.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </DatabaseToolsApi>
      </Gutter>
    </DefaultTemplate>
  )
}

export default DatabaseView
