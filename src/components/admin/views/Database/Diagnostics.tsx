'use client'

import {
  ActivityIcon,
  ClockIcon,
  GaugeIcon,
  HardDriveIcon,
  ListOrderedIcon,
  LoaderCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'

import { get, post, useApiBase, type Reply } from './Actions'

/**
 * The read-only diagnostics on /admin/database: how the server is configured, how much of each table
 * is dead rows, and what the server says it has actually been running.
 *
 * All three fetch on the client rather than arriving in the server render, because each is a
 * snapshot of a moment rather than part of the page's identity: the settings card is worth reading
 * once when a query gets cancelled, the bloat card is worth reading before a vacuum, and the
 * statement history may not exist at all on the server this deployment points at. A refresh button
 * is therefore part of each card — a number that says when it was read is a number you can trust.
 *
 * None of them writes. The one action here (VACUUM (ANALYZE) beside a bloated table) is the existing
 * maintenance endpoint, which the Maintenance card already exposes for the whole database.
 */

/** How long ago, in the units a card reads. */
function ago(iso: string | null): string {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const scaled = value / 1024 ** exponent
  return `${scaled >= 100 || exponent === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[exponent]}`
}

function milliseconds(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  return `${(seconds / 60).toFixed(1)} min`
}

function ErrorNote({ reply }: { reply: Reply }) {
  if (reply.ok) return null
  return (
    <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-xs acn:text-destructive">
      <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
      <span>
        {reply.error}
        {reply.hint ? ` ${reply.hint}` : ''}
      </span>
    </p>
  )
}

type Settings = {
  version: string
  database: string
  target: { host: string; port: string; database: string; pooled: boolean; source: string }
  uptime: string | null
  settings: {
    name: string
    setting: string
    value: string
    unit: string | null
    source: string
    pendingRestart: boolean
    category: string
  }[]
  absent: string[]
  connections: {
    total: number
    max: number
    superuserReserved: number
    available: number
    byState: { state: string; count: number }[]
    byUser: { user: string; count: number }[]
    byApplication: { application: string; count: number }[]
    otherDatabases: number
  }
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
 * How this server is configured and how much of it this database is using: the timeouts that cancel
 * work, the connection ceiling against the sessions actually open, the memory a sort may spend, and
 * whether the connection goes through a pooler (where those numbers belong to the pooler's target).
 */
export function ServerSettingsCard() {
  const apiBase = useApiBase()
  const [data, setData] = React.useState<Settings | null>(null)
  const [reply, setReply] = React.useState<Reply | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [readAt, setReadAt] = React.useState<Date | null>(null)

  const apply = React.useCallback((result: Reply) => {
    setReply(result)
    if (result.ok && result.settings) {
      setData(result.settings as Settings)
      setReadAt(new Date())
    }
  }, [])

  const refresh = async () => {
    setBusy(true)
    apply(await get(`${apiBase}/settings`))
    setBusy(false)
  }

  // Read on mount, but never synchronously: every state change happens after the fetch resolves, so
  // the first paint is not a cascade of renders (and a card that unmounts mid-fetch is not updated).
  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      const result = await get(`${apiBase}/settings`)
      if (!cancelled) apply(result)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [apiBase, apply])

  const groups = React.useMemo(() => {
    const byCategory = new Map<string, Settings['settings']>()
    for (const setting of data?.settings ?? []) {
      const list = byCategory.get(setting.category) ?? []
      list.push(setting)
      byCategory.set(setting.category, list)
    }
    return [...byCategory.entries()]
  }, [data])

  const timeouts = data?.settings.filter((setting) =>
    ['statement_timeout', 'idle_in_transaction_session_timeout', 'lock_timeout'].includes(
      setting.name,
    ),
  )

  return (
    <div className="acn:flex acn:flex-col acn:gap-4">
      <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
        <p className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-sm acn:font-medium">
          <SlidersHorizontalIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
          Server settings and connections
        </p>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <RefreshCwIcon aria-hidden />
          )}
          {readAt ? `Read ${readAt.toLocaleTimeString('en')}` : 'Read now'}
        </Button>
      </div>

      {reply ? <ErrorNote reply={reply} /> : null}

      {data ? (
        <>
          <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
            {data.version} · <code className="acn:font-mono">{data.database}</code> on{' '}
            <code className="acn:font-mono">
              {data.target.host}:{data.target.port}
            </code>{' '}
            from <code className="acn:font-mono">{data.target.source}</code>
            {data.target.pooled ? ' (pooled)' : ' (direct)'}
            {data.uptime ? ` · up ${data.uptime.split('.')[0]}` : ''}
          </p>

          {data.target.pooled ? (
            <p className="acn:m-0 acn:rounded-lg acn:bg-muted acn:p-3 acn:text-xs acn:text-muted-foreground">
              This connection goes through a pooler (a <code className="acn:font-mono">-pooler</code>{' '}
              host). The limits below are the server’s, and the sessions listed are the ones the
              pooler holds open — not how many clients your application has.
            </p>
          ) : null}

          <div className="acn:grid acn:gap-3 acn:sm:grid-cols-2">
            <div className="acn:rounded-lg acn:border acn:border-border acn:p-3">
              <p className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-sm acn:font-medium">
                <ActivityIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                Connections
              </p>
              <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                {data.connections.total} of {data.connections.max} used by this database ·{' '}
                {data.connections.available} free · {data.connections.superuserReserved} kept for a
                superuser
                {data.connections.otherDatabases > 0
                  ? ` · ${data.connections.otherDatabases} on other databases of this server, which share the same ceiling`
                  : ''}
              </p>
              <dl className="acn:m-0 acn:mt-2 acn:grid acn:grid-cols-2 acn:gap-x-3 acn:gap-y-1 acn:text-xs">
                {data.connections.byState.slice(0, 6).map((row) => (
                  <div key={row.state} className="acn:flex acn:justify-between acn:gap-2">
                    <dt className="acn:text-muted-foreground">{row.state}</dt>
                    <dd className="acn:m-0 acn:tabular-nums">{row.count}</dd>
                  </div>
                ))}
              </dl>
              {data.connections.byApplication.length > 0 ? (
                <p className="acn:m-0 acn:mt-2 acn:text-xs acn:text-muted-foreground">
                  {data.connections.byApplication
                    .slice(0, 4)
                    .map((row) => `${row.application}: ${row.count}`)
                    .join(' · ')}
                </p>
              ) : null}
            </div>

            <div className="acn:rounded-lg acn:border acn:border-border acn:p-3">
              <p className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-sm acn:font-medium">
                <ClockIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                Timeouts that cancel work
              </p>
              {timeouts && timeouts.length > 0 ? (
                <dl className="acn:m-0 acn:mt-2 acn:space-y-1 acn:text-xs">
                  {timeouts.map((setting) => (
                    <div key={setting.name} className="acn:flex acn:justify-between acn:gap-2">
                      <dt className="acn:font-mono acn:text-muted-foreground">{setting.name}</dt>
                      <dd className="acn:m-0 acn:text-right">
                        {setting.value}
                        {setting.pendingRestart ? (
                          <Badge variant="secondary" className="acn:ml-1.5">
                            restart pending
                          </Badge>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                  This server does not report them.
                </p>
              )}
              <p className="acn:m-0 acn:mt-2 acn:text-xs acn:text-muted-foreground">
                A query that ends with “canceling statement due to statement timeout” was stopped by
                the first of these, not by your code.
              </p>
            </div>
          </div>

          {groups.map(([category, settings]) => (
            <div key={category}>
              <p className="acn:m-0 acn:text-sm acn:font-medium">{category}</p>
              <dl className="acn:m-0 acn:mt-1 acn:grid acn:gap-x-4 acn:gap-y-1 acn:text-xs acn:sm:grid-cols-2">
                {settings.map((setting) => (
                  <div
                    key={setting.name}
                    className="acn:flex acn:items-baseline acn:justify-between acn:gap-2"
                  >
                    <dt className="acn:font-mono acn:text-muted-foreground" title={setting.source}>
                      {setting.name}
                    </dt>
                    <dd className="acn:m-0 acn:text-right acn:tabular-nums">
                      {setting.value}
                      {setting.pendingRestart ? (
                        <Badge variant="secondary" className="acn:ml-1.5">
                          restart pending
                        </Badge>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          <div className="acn:rounded-lg acn:bg-muted acn:p-3 acn:text-xs">
            <p className="acn:m-0 acn:font-medium">Since {ago(data.activity.since)}</p>
            <p className="acn:m-0 acn:mt-1 acn:text-muted-foreground">
              {data.activity.commits.toLocaleString('en')} commits ·{' '}
              {data.activity.rollbacks.toLocaleString('en')} rollbacks ·{' '}
              {(data.activity.cacheHitRatio * 100).toFixed(2)}% of block reads from cache ·{' '}
              {data.activity.deadlocks.toLocaleString('en')} deadlock(s)
              {data.activity.tempFiles > 0
                ? ` · ${data.activity.tempFiles.toLocaleString('en')} temp file(s), ${bytes(data.activity.tempBytes)} — a sort or hash that did not fit work_mem`
                : ' · no temp files, so nothing has spilled to disk'}
            </p>
          </div>

          {data.absent.length > 0 ? (
            <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
              Not reported by this server: {data.absent.join(', ')}.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

type Bloat = {
  tables: {
    name: string
    liveTuples: number
    deadTuples: number
    deadRatio: number
    tableBytes: number
    indexBytes: number
    totalBytes: number
    estimatedBloatBytes: number
    lastVacuum: string | null
    lastAutovacuum: string | null
    lastAnalyze: string | null
    lastAutoanalyze: string | null
    vacuumCount: number
    autovacuumCount: number
    modificationsSinceAnalyze: number
    autovacuumTrigger: number
    dueForVacuum: boolean
    dueForAnalyze: boolean
    neverVacuumed: boolean
    reloptions: Record<string, string>
    secondsSinceVacuum: number | null
  }[]
  totals: {
    tables: number
    deadTuples: number
    estimatedBloatBytes: number
    dueForVacuum: number
    dueForAnalyze: number
    neverVacuumed: number
    withOverrides: number
  }
  autovacuum: {
    enabled: boolean
    maxWorkers: number
    naptime: string | null
    vacuumScaleFactor: number
    vacuumThreshold: number
    analyzeScaleFactor: number
    analyzeThreshold: number
  }
  exactMeasurementAvailable: boolean
  countedAt: string
}

/**
 * Dead tuples, vacuum history and the estimated bloat of each table, worst first, with the
 * maintenance action beside the rows that need it.
 */
export function BloatCard() {
  const apiBase = useApiBase()
  const [data, setData] = React.useState<Bloat | null>(null)
  const [reply, setReply] = React.useState<Reply | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [vacuuming, setVacuuming] = React.useState<string | null>(null)
  const [action, setAction] = React.useState<Reply | null>(null)

  const apply = React.useCallback((result: Reply) => {
    setReply(result)
    if (result.ok && result.bloat) {
      setData(result.bloat as Bloat)
      setAction(null)
    }
  }, [])

  const refresh = async () => {
    setBusy(true)
    apply(await get(`${apiBase}/bloat`))
    setBusy(false)
  }

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      const result = await get(`${apiBase}/bloat`)
      if (!cancelled) apply(result)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [apiBase, apply])

  const vacuum = async (table: string) => {
    setVacuuming(table)
    setAction(null)
    const result = await post(`${apiBase}/maintenance`, { action: 'vacuum-analyze', table })
    setAction(result.ok ? { ...result, table } : result)
    setVacuuming(null)
    if (result.ok) void refresh()
  }

  return (
    <div className="acn:flex acn:flex-col acn:gap-4">
      <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
        <p className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-sm acn:font-medium">
          <HardDriveIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
          Bloat and vacuum health
        </p>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <RefreshCwIcon aria-hidden />
          )}
          {data ? `Read ${new Date(data.countedAt).toLocaleTimeString('en')}` : 'Read now'}
        </Button>
      </div>

      {reply ? <ErrorNote reply={reply} /> : null}

      {data ? (
        <>
          <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
            {data.totals.deadTuples.toLocaleString('en')} dead tuple(s) across{' '}
            {data.totals.tables} table(s), roughly {bytes(data.totals.estimatedBloatBytes)} of space
            they still occupy · {data.totals.dueForVacuum} past the autovacuum trigger ·{' '}
            {data.totals.dueForAnalyze} past the analyze trigger
            {!data.autovacuum.enabled ? ' · autovacuum is OFF on this server' : ''}
          </p>
          <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
            Autovacuum fires at {data.autovacuum.vacuumThreshold} +{' '}
            {data.autovacuum.vacuumScaleFactor} × rows, and analyzes at{' '}
            {data.autovacuum.analyzeThreshold} + {data.autovacuum.analyzeScaleFactor} × rows, with
            up to {data.autovacuum.maxWorkers} worker(s).{' '}
            {data.exactMeasurementAvailable
              ? 'pgstattuple is installed, so an exact measurement would be possible.'
              : 'The bloat below is an estimate (dead tuples × the table’s average row width): measuring it exactly needs pgstattuple, which this server does not offer.'}
          </p>

          <div className="acn:overflow-x-auto acn:rounded-lg acn:border acn:border-border">
            <table className="acn:w-full acn:border-collapse acn:text-xs">
              <thead>
                <tr className="acn:border-b acn:border-border acn:text-left acn:text-muted-foreground">
                  <th scope="col" className="acn:px-3 acn:py-1.5 acn:font-medium">Table</th>
                  <th scope="col" className="acn:px-3 acn:py-1.5 acn:text-right acn:font-medium">
                    Dead / live
                  </th>
                  <th scope="col" className="acn:px-3 acn:py-1.5 acn:text-right acn:font-medium">
                    Bloat (est.)
                  </th>
                  <th scope="col" className="acn:px-3 acn:py-1.5 acn:font-medium">Last vacuum</th>
                  <th scope="col" className="acn:px-3 acn:py-1.5 acn:font-medium">Last analyze</th>
                  <th scope="col" className="acn:px-3 acn:py-1.5 acn:text-right acn:font-medium">
                    Size
                  </th>
                  <th scope="col" className="acn:px-3 acn:py-1.5" />
                </tr>
              </thead>
              <tbody>
                {data.tables.slice(0, 25).map((table) => (
                  <tr key={table.name} className="acn:border-b acn:border-border/60 acn:last:border-0">
                    <td className="acn:px-3 acn:py-1.5">
                      <span className="acn:font-mono acn:break-all">{table.name}</span>
                      {table.dueForVacuum ? (
                        <Badge variant="destructive" className="acn:ml-1.5">
                          vacuum due
                        </Badge>
                      ) : null}
                      {table.dueForAnalyze ? (
                        <Badge variant="secondary" className="acn:ml-1.5">
                          analyze due
                        </Badge>
                      ) : null}
                      {table.neverVacuumed ? (
                        <Badge variant="secondary" className="acn:ml-1.5">
                          never vacuumed
                        </Badge>
                      ) : null}
                      {Object.keys(table.reloptions).length > 0 ? (
                        <Badge variant="outline" className="acn:ml-1.5" title={JSON.stringify(table.reloptions)}>
                          tuned
                        </Badge>
                      ) : null}
                    </td>
                    <td className="acn:px-3 acn:py-1.5 acn:text-right acn:tabular-nums">
                      {table.deadTuples.toLocaleString('en')} /{' '}
                      {table.liveTuples.toLocaleString('en')}
                      <span className="acn:ml-1 acn:text-muted-foreground">
                        ({(table.deadRatio * 100).toFixed(table.deadRatio < 0.1 ? 1 : 0)}%)
                      </span>
                      <span
                        className="acn:ml-1 acn:text-muted-foreground"
                        title={`Autovacuum would fire at ${table.autovacuumTrigger.toLocaleString('en')} dead tuples`}
                      >
                        · trigger {table.autovacuumTrigger.toLocaleString('en')}
                      </span>
                    </td>
                    <td className="acn:px-3 acn:py-1.5 acn:text-right acn:tabular-nums">
                      {bytes(table.estimatedBloatBytes)}
                    </td>
                    <td className="acn:px-3 acn:py-1.5 acn:text-muted-foreground">
                      {ago(table.lastAutovacuum ?? table.lastVacuum)}
                      {table.vacuumCount + table.autovacuumCount > 0
                        ? ` · ${table.vacuumCount + table.autovacuumCount}×`
                        : ''}
                    </td>
                    <td className="acn:px-3 acn:py-1.5 acn:text-muted-foreground">
                      {ago(table.lastAutoanalyze ?? table.lastAnalyze)}
                      {table.modificationsSinceAnalyze > 0
                        ? ` · ${table.modificationsSinceAnalyze.toLocaleString('en')} write(s) since`
                        : ''}
                    </td>
                    <td className="acn:px-3 acn:py-1.5 acn:text-right acn:tabular-nums">
                      {bytes(table.totalBytes)}
                      {table.indexBytes > 0 ? (
                        <span className="acn:ml-1 acn:text-muted-foreground">
                          ({bytes(table.indexBytes)} idx)
                        </span>
                      ) : null}
                    </td>
                    <td className="acn:px-3 acn:py-1.5 acn:text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={vacuuming !== null}
                        onClick={() => void vacuum(table.name)}
                      >
                        {vacuuming === table.name ? (
                          <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
                        ) : (
                          <RefreshCwIcon aria-hidden />
                        )}
                        Vacuum
                      </Button>
                    </td>
                  </tr>
                ))}
                {data.tables.length > 25 ? (
                  <tr>
                    <td colSpan={7} className="acn:px-3 acn:py-1.5 acn:text-muted-foreground">
                      and {data.tables.length - 25} more table(s), ordered by dead tuples…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {action ? (
            <p className="acn:m-0 acn:text-xs">
              {action.ok ? (
                <span className="acn:text-foreground">
                  Vacuumed{action.table ? ` ${String(action.table)}` : ''} in{' '}
                  {String(action.durationMs ?? 0)} ms
                  {typeof action.deadRows === 'number'
                    ? ` · ${Number(action.deadRows).toLocaleString('en')} dead tuple(s) were left`
                    : ''}
                  .
                </span>
              ) : (
                <ErrorNote reply={action} />
              )}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

type Statements = {
  available: boolean
  hint: string | null
  extension: { installed: boolean; preloaded: boolean; available: boolean; version: string | null }
  since: string | null
  totals: { statements: number; calls: number; timeMs: number } | null
  byTotalTime: StatementRow[]
  byMeanTime: StatementRow[]
  byCalls: StatementRow[]
}

type StatementRow = {
  query: string
  calls: number
  totalTimeMs: number
  meanTimeMs: number
  maxTimeMs: number
  rows: number
  cacheHitRatio: number | null
  user: string | null
  database: string | null
}

const RANKINGS = [
  { key: 'byTotalTime', label: 'Slowest overall', hint: 'Total time across every call: where the server spends its time.' },
  { key: 'byMeanTime', label: 'Slowest per call', hint: 'Mean time per call: the statement that feels slow in the admin panel.' },
  { key: 'byCalls', label: 'Most called', hint: 'Call count: the statement a small saving would multiply.' },
] as const

/**
 * The statements the server has actually run, ranked three ways, from `pg_stat_statements`.
 *
 * Read on demand rather than on mount: on a server without the extension there is nothing to read,
 * and the card says why in one sentence instead of showing an empty table that looks like a quiet
 * database.
 */
export function StatementsCard() {
  const apiBase = useApiBase()
  const [data, setData] = React.useState<Statements | null>(null)
  const [reply, setReply] = React.useState<Reply | null>(null)
  const [busy, setBusy] = React.useState(false)

  const read = async () => {
    setBusy(true)
    const result = await get(`${apiBase}/statements`)
    setReply(result)
    if (result.ok && result.statements) setData(result.statements as Statements)
    setBusy(false)
  }

  return (
    <div className="acn:flex acn:flex-col acn:gap-4">
      <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
        <p className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-sm acn:font-medium">
          <ListOrderedIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
          Slowest statements
        </p>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void read()}>
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <PlayIcon aria-hidden />
          )}
          {data ? 'Read again' : 'Read pg_stat_statements'}
        </Button>
      </div>

      {reply ? <ErrorNote reply={reply} /> : null}

      {data && !data.available ? (
        <p className="acn:m-0 acn:rounded-lg acn:bg-muted acn:p-3 acn:text-xs acn:text-muted-foreground">
          <GaugeIcon aria-hidden className="acn:mr-1.5 acn:inline acn:size-3.5" />
          {data.hint}
        </p>
      ) : null}

      {data?.available ? (
        <>
          <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
            {data.totals ? data.totals.statements.toLocaleString('en') : 0} distinct statement(s),{' '}
            {data.totals ? data.totals.calls.toLocaleString('en') : 0} call(s),{' '}
            {data.totals ? milliseconds(data.totals.timeMs) : ''} of execution time
            {data.since ? ` · counting since ${new Date(data.since).toLocaleString('en')}` : ''}
            {data.extension.version ? ` · pg_stat_statements ${data.extension.version}` : ''}. The
            text is normalised by Postgres: literals are already <code>$1</code>, so no value anyone
            queried appears here.
          </p>

          {RANKINGS.map((ranking) => {
            const rows = data[ranking.key]
            return (
              <div key={ranking.key}>
                <p className="acn:m-0 acn:text-sm acn:font-medium">{ranking.label}</p>
                <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">{ranking.hint}</p>
                {rows.length === 0 ? (
                  <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                    Nothing recorded yet.
                  </p>
                ) : (
                  <ul className="acn:m-0 acn:mt-1.5 acn:flex acn:list-none acn:flex-col acn:gap-1.5 acn:p-0">
                    {rows.slice(0, 6).map((row) => (
                      <li
                        key={`${ranking.key}:${row.query.slice(0, 60)}`}
                        className="acn:rounded-lg acn:border acn:border-border acn:p-2.5"
                      >
                        <div className="acn:flex acn:flex-wrap acn:items-baseline acn:justify-between acn:gap-2">
                          <span className="acn:font-mono acn:text-xs acn:break-all">{row.query}</span>
                          <span className="acn:shrink-0 acn:text-xs acn:tabular-nums">
                            {milliseconds(row.totalTimeMs)} total ·{' '}
                            {milliseconds(row.meanTimeMs)} mean ·{' '}
                            {row.calls.toLocaleString('en')} call(s)
                          </span>
                        </div>
                        <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                          {row.rows.toLocaleString('en')} row(s)
                          {row.cacheHitRatio === null
                            ? ''
                            : ` · ${(row.cacheHitRatio * 100).toFixed(1)}% of block reads from cache`}
                          {row.maxTimeMs > 0 ? ` · slowest call ${milliseconds(row.maxTimeMs)}` : ''}
                          {row.user ? ` · ${row.user}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </>
      ) : null}
    </div>
  )
}
