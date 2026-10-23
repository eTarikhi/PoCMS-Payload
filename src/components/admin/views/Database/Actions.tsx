'use client'

import {
  CheckIcon,
  DatabaseBackupIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import { Input } from '@/components/admin/elements/Input'
import { cn } from '@/components/admin/utilities/cn'

/**
 * The write actions on /admin/database. All of them are one POST and a `router.refresh()`, like the
 * Jobs page: the server component re-reads the tables, the checks and the branches, so what is on
 * screen afterwards is what the database says, not what the button thought it did.
 */

export type Reply = { ok: boolean; error?: string; hint?: string; [key: string]: unknown }

/**
 * The plugin's endpoint prefix (`options.apiBasePath` under the API route). The server component
 * passes it once, so no action hard-codes `/api/database`: a host that mounts the plugin at another
 * path gets working buttons without touching this file.
 */
const ApiBase = React.createContext('/api/database')

export function DatabaseToolsApi({
  apiBase,
  children,
}: {
  apiBase: string
  children: React.ReactNode
}) {
  return <ApiBase.Provider value={apiBase}>{children}</ApiBase.Provider>
}

export const useApiBase = () => React.useContext(ApiBase)

/**
 * A GET from one of this plugin's endpoints. The diagnostics below read on the client because they
 * are on-demand: the page should not pay for `pg_stat_statements` (which may not even exist on the
 * server) every time somebody opens it.
 */
export async function get(path: string): Promise<Reply> {
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json' } })
    const data = (await response.json().catch(() => ({}))) as Reply & { error?: string }
    return response.ok
      ? { ...data, ok: true }
      : { ok: false, error: data.error ?? `HTTP ${response.status}`, hint: data.hint }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function post(path: string, body: unknown): Promise<Reply> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as Reply & { error?: string }
    return response.ok
      ? { ...data, ok: true }
      : { ok: false, error: data.error ?? `HTTP ${response.status}`, hint: data.hint }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** The message under a button: the server's explanation, or a green summary of what happened. */
export function Outcome({ reply }: { reply: Reply | null }) {
  if (!reply) return null
  if (reply.ok) {
    const detail = typeof reply.detail === 'string' ? reply.detail : null
    return (
      <p
        role="status"
        className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-xs acn:text-muted-foreground"
      >
        <CheckIcon
          aria-hidden
          className="acn:mt-0.5 acn:size-3.5 acn:shrink-0 acn:text-emerald-600"
        />
        <span>
          Done{detail ? ` — ${detail}` : '.'}
          {typeof reply.durationMs === 'number' ? ` (${reply.durationMs} ms)` : ''}
        </span>
      </p>
    )
  }
  return (
    <div
      role="status"
      className="acn:flex acn:flex-col acn:gap-0.5 acn:text-xs acn:text-destructive"
    >
      <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5">
        <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
        <span>{reply.error}</span>
      </p>
      {reply.hint ? (
        <p className="acn:m-0 acn:pl-5 acn:text-muted-foreground">{reply.hint}</p>
      ) : null}
    </div>
  )
}

type Action = 'analyze' | 'vacuum' | 'vacuum-analyze' | 'reindex'

const ACTIONS: { action: Action; label: string }[] = [
  { action: 'analyze', label: 'Analyze' },
  { action: 'vacuum', label: 'Vacuum' },
  { action: 'vacuum-analyze', label: 'Vacuum + analyze' },
  { action: 'reindex', label: 'Rebuild invalid indexes' },
]

/** One button per maintenance action, optionally limited to the table being browsed. */
export function MaintenanceButtons({ table }: { table?: string }) {
  const router = useRouter()
  const apiBase = useApiBase()
  const [busy, setBusy] = React.useState<Action | null>(null)
  const [reply, setReply] = React.useState<Reply | null>(null)

  const run = async (action: Action) => {
    setBusy(action)
    setReply(null)
    const result = await post(`${apiBase}/maintenance`, { action, table: table ?? null })
    setReply(result)
    if (result.ok) router.refresh()
    setBusy(null)
  }

  return (
    <div className="acn:flex acn:flex-col acn:gap-3">
      <div className="acn:flex acn:flex-wrap acn:gap-2">
        {ACTIONS.map((entry) => (
          <Button
            key={entry.action}
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run(entry.action)}
          >
            {busy === entry.action ? (
              <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
            ) : (
              <PlayIcon aria-hidden />
            )}
            {busy === entry.action ? 'Running…' : entry.label}
          </Button>
        ))}
      </div>
      <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
        {table ? (
          <>
            Runs on <code className="acn:font-mono">{table}</code> only.
          </>
        ) : (
          'Runs on the whole database. VACUUM and ANALYZE are safe while the site is running.'
        )}
      </p>
      <Outcome reply={reply} />
    </div>
  )
}

/** The Fix button next to a repair check that has one. */
export function RepairButton({ check, label }: { check: string; label: string }) {
  const router = useRouter()
  const apiBase = useApiBase()
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  return (
    <div className="acn:flex acn:flex-col acn:items-end acn:gap-1">
      <Button
        size="xs"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setReply(null)
          const result = await post(`${apiBase}/repair`, { check })
          setReply(result)
          if (result.ok) router.refresh()
          setBusy(false)
        }}
      >
        {busy ? (
          <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
        ) : (
          <WrenchIcon aria-hidden />
        )}
        {busy ? 'Fixing…' : label}
      </Button>
      <Outcome reply={reply} />
    </div>
  )
}

/** Run every repair that has one, in one request. */
export function RepairAllButton({ count }: { count: number }) {
  const router = useRouter()
  const apiBase = useApiBase()
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  return (
    <div className="acn:flex acn:flex-col acn:items-end acn:gap-1">
      <Button
        size="sm"
        disabled={busy || count === 0}
        onClick={async () => {
          setBusy(true)
          setReply(null)
          const result = await post(`${apiBase}/repair`, { check: 'all' })
          setReply(result)
          if (result.ok) router.refresh()
          setBusy(false)
        }}
      >
        {busy ? (
          <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
        ) : (
          <WrenchIcon aria-hidden />
        )}
        {busy ? 'Repairing…' : `Repair all (${count})`}
      </Button>
      <Outcome reply={reply} />
    </div>
  )
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

type Inspection = {
  bytes: number
  statements: number
  transactional: boolean
  tables: string[]
  refusal?: string
  existing: { table: string; rows: number }[]
}

/**
 * Restore, in two deliberate steps: read the file and show what it would do, then run it against a
 * typed confirmation. The server repeats both checks — this is the explanation, not the enforcement.
 */
export function RestorePanel() {
  const router = useRouter()
  const apiBase = useApiBase()
  const [file, setFile] = React.useState<File | null>(null)
  const [sql, setSql] = React.useState<string | null>(null)
  const [inspection, setInspection] = React.useState<Inspection | null>(null)
  const [confirmation, setConfirmation] = React.useState('')
  const [busy, setBusy] = React.useState<'inspect' | 'restore' | null>(null)
  const [reply, setReply] = React.useState<Reply | null>(null)

  // Reading the file in the change handler (not an effect) keeps the state in one place: choosing a
  // file clears the previous inspection, and a slow read cannot overwrite a newer choice.
  const choose = async (chosen: File | null) => {
    setFile(chosen)
    setInspection(null)
    setReply(null)
    setConfirmation('')
    setSql(null)
    if (!chosen) return
    const text = await readFile(chosen).catch(() => null)
    if (text === null) {
      setReply({ ok: false, error: 'The file could not be read as text.' })
      return
    }
    setSql(text)
  }

  const inspect = async () => {
    if (!sql) return
    setBusy('inspect')
    setReply(null)
    const result = await post(`${apiBase}/restore-inspect`, { sql })
    if (result.ok) setInspection(result.inspection as Inspection)
    else setReply(result)
    setBusy(null)
  }

  const restore = async () => {
    if (!sql) return
    setBusy('restore')
    setReply(null)
    const result = await post(`${apiBase}/restore`, {
      sql,
      confirmation,
      force: confirmation.trim().toLowerCase() === 'restore',
    })
    setReply(result)
    if (result.ok) router.refresh()
    setBusy(null)
  }

  const needsConfirmation = (inspection?.existing.length ?? 0) > 0
  const ready =
    Boolean(inspection) &&
    !inspection?.refusal &&
    (!needsConfirmation || confirmation.trim().toLowerCase() === 'restore')

  return (
    <div className="acn:flex acn:flex-col acn:gap-4">
      <label className="acn:flex acn:flex-col acn:gap-1.5 acn:text-sm">
        <span className="acn:font-medium">Backup file</span>
        <input
          type="file"
          accept=".sql,text/plain,application/sql"
          className={cn(
            'acn:block acn:w-full acn:cursor-pointer acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-1.5 acn:text-sm',
            'acn:file:mr-2 acn:file:rounded-md acn:file:border-0 acn:file:bg-muted acn:file:px-2 acn:file:py-1 acn:file:text-xs',
          )}
          onChange={(event) => void choose(event.target.files?.[0] ?? null)}
        />
        <span className="acn:text-xs acn:text-muted-foreground">
          A <code className="acn:font-mono">.sql</code> file from this page or from{' '}
          <code className="acn:font-mono">pg_dump --no-owner --no-privileges</code>. Up to 25 MB;
          psql is the tool for anything larger.
        </span>
      </label>

      <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!sql || busy !== null}
          onClick={() => void inspect()}
        >
          {busy === 'inspect' ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <DatabaseBackupIcon aria-hidden />
          )}
          {busy === 'inspect' ? 'Reading…' : 'Check the file'}
        </Button>
        {file ? (
          <span className="acn:text-xs acn:text-muted-foreground">
            {file.name} · {Math.ceil(file.size / 1024).toLocaleString('en')} kB
          </span>
        ) : null}
      </div>

      {inspection ? (
        <div className="acn:rounded-lg acn:bg-muted acn:p-3 acn:text-xs">
          {inspection.refusal ? (
            <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-destructive">
              <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
              {inspection.refusal}
            </p>
          ) : (
            <>
              <p className="acn:m-0 acn:font-medium">
                {inspection.statements.toLocaleString('en')} statements ·{' '}
                {inspection.tables.length.toLocaleString('en')} tables
              </p>
              <p className="acn:m-0 acn:mt-1 acn:text-muted-foreground">
                {inspection.transactional
                  ? 'The file has its own BEGIN/COMMIT, so a failure rolls everything back.'
                  : 'The file has no BEGIN/COMMIT; a failure part-way would leave the earlier statements applied.'}
              </p>
              {inspection.tables.length > 0 ? (
                <p className="acn:m-0 acn:mt-1 acn:font-mono acn:break-words acn:text-muted-foreground">
                  {inspection.tables.slice(0, 12).join(', ')}
                  {inspection.tables.length > 12 ? `, +${inspection.tables.length - 12} more` : ''}
                </p>
              ) : null}
              {inspection.existing.length > 0 ? (
                <p className="acn:m-0 acn:mt-2 acn:text-foreground">
                  This database already holds content:{' '}
                  {inspection.existing
                    .map((entry) => `${entry.table} ${entry.rows.toLocaleString('en')}`)
                    .join(', ')}
                  . The file adds to it; rows it inserts again will collide on the primary key.
                </p>
              ) : (
                <p className="acn:m-0 acn:mt-2 acn:text-muted-foreground">
                  The content tables are empty, so this restore has nothing to collide with.
                </p>
              )}
            </>
          )}
        </div>
      ) : null}

      <div className="acn:flex acn:flex-col acn:gap-2 acn:sm:flex-row acn:sm:items-end">
        <label className="acn:flex acn:flex-1 acn:flex-col acn:gap-1.5 acn:text-sm">
          <span className="acn:font-medium">
            Type <code className="acn:font-mono">restore</code> to confirm
          </span>
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="restore"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <Button
          variant="destructive"
          disabled={!ready || busy !== null}
          onClick={() => void restore()}
        >
          {busy === 'restore' ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <RotateCcwIcon aria-hidden />
          )}
          {busy === 'restore' ? 'Restoring…' : 'Restore'}
        </Button>
      </div>

      <Outcome reply={reply} />
      {reply?.ok && Array.isArray(reply.after) ? (
        <div className="acn:flex acn:flex-wrap acn:gap-1.5">
          {(reply.after as { table: string; rows: number }[]).map((entry) => (
            <Badge key={entry.table} variant="secondary">
              {entry.table} {entry.rows.toLocaleString('en')}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

type SeedPreview = {
  generatedAt: string
  source: { host: string; database: string }
  tables: number
  rows: number
  names: string[]
  warnings: string[]
}

/** What a chosen seed file says about itself, read in the browser before anything is sent. */
function previewSeed(text: string): SeedPreview | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: 'That file is not JSON.' }
  }
  const seed = parsed as {
    format?: string
    version?: number
    generatedAt?: string
    source?: { host?: string; database?: string }
    tables?: { name: string; data: unknown[] }[]
    counts?: { tables?: number; rows?: number }
    warnings?: string[]
  }
  if (seed?.format !== 'pocms-seed' || seed.version !== 1) {
    return { error: 'That JSON is not a PoCMS seed (a backup is not a seed).' }
  }
  const tables = Array.isArray(seed.tables) ? seed.tables : []
  return {
    generatedAt: seed.generatedAt ?? '',
    source: { host: seed.source?.host ?? '', database: seed.source?.database ?? '' },
    tables: seed.counts?.tables ?? tables.length,
    rows: seed.counts?.rows ?? tables.reduce((sum, table) => sum + (table.data?.length ?? 0), 0),
    names: tables.map((table) => table.name),
    warnings: seed.warnings ?? [],
  }
}

/**
 * Load a seed file into this database: the rows of the tables it names are deleted first, then the
 * file's rows are inserted and the sequences are moved past the highest id. One transaction, so a
 * failure leaves the database as it was. Typing `seed` is the confirmation; the server asks for it
 * too.
 */
type SeedPlan = {
  tables: { name: string; willDelete: number; willInsert: number; estimated: boolean }[]
  rows: number
  sequences: number
  warnings: string[]
}

export function SeedPanel() {
  const router = useRouter()
  const apiBase = useApiBase()
  const [file, setFile] = React.useState<File | null>(null)
  const [json, setJson] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<SeedPreview | { error: string } | null>(null)
  const [plan, setPlan] = React.useState<SeedPlan | null>(null)
  const [planning, setPlanning] = React.useState(false)
  const [planError, setPlanError] = React.useState<string | null>(null)
  const [confirmation, setConfirmation] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  const choose = async (chosen: File | null) => {
    setFile(chosen)
    setPreview(null)
    setReply(null)
    setConfirmation('')
    setJson(null)
    setPlan(null)
    setPlanError(null)
    if (!chosen) return
    const text = await readFile(chosen).catch(() => null)
    if (text === null) {
      setPreview({ error: 'The file could not be read as text.' })
      return
    }
    setJson(text)
    setPreview(previewSeed(text))
  }

  const ready =
    Boolean(json) &&
    preview !== null &&
    !('error' in preview) &&
    confirmation.trim().toLowerCase() === 'seed'

  /**
   * Ask the server what applying this file would do. It writes nothing — the same endpoint with
   * `dryRun` counts the rows each named table holds now and the rows the file carries — so the
   * confirmation below is an informed one rather than a guess at a table's contents.
   */
  const showPlan = async () => {
    if (!json) return
    setPlanning(true)
    setPlanError(null)
    setPlan(null)
    const result = await post(`${apiBase}/seed/apply`, { json, dryRun: true })
    if (result.ok && result.plan) setPlan(result.plan as SeedPlan)
    else setPlanError(result.error ?? 'The plan could not be read.')
    setPlanning(false)
  }

  const apply = async () => {
    if (!json) return
    setBusy(true)
    setReply(null)
    const result = await post(`${apiBase}/seed/apply`, { json, confirmation })
    setReply(result)
    if (result.ok) router.refresh()
    setBusy(false)
  }

  return (
    <div className="acn:flex acn:flex-col acn:gap-4">
      <label className="acn:flex acn:flex-col acn:gap-1.5 acn:text-sm">
        <span className="acn:font-medium">Seed file</span>
        <input
          type="file"
          accept=".json,application/json"
          className={cn(
            'acn:block acn:w-full acn:cursor-pointer acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-1.5 acn:text-sm',
            'acn:file:mr-2 acn:file:rounded-md acn:file:border-0 acn:file:bg-muted acn:file:px-2 acn:file:py-1 acn:file:text-xs',
          )}
          onChange={(event) => void choose(event.target.files?.[0] ?? null)}
        />
        <span className="acn:text-xs acn:text-muted-foreground">
          The <code className="acn:font-mono">.json</code> this page downloads, or one written by{' '}
          <code className="acn:font-mono">pnpm db:seed-from</code>.
          {file ? ` · ${file.name}, ${Math.ceil(file.size / 1024).toLocaleString('en')} kB` : ''}
        </span>
      </label>

      {preview && 'error' in preview ? (
        <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-xs acn:text-destructive">
          <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
          {preview.error}
        </p>
      ) : null}

      {preview && !('error' in preview) ? (
        <div className="acn:rounded-lg acn:bg-muted acn:p-3 acn:text-xs">
          <p className="acn:m-0 acn:font-medium">
            {preview.rows.toLocaleString('en')} rows in {preview.tables.toLocaleString('en')} tables
            {preview.source.database
              ? ` · from ${preview.source.database}${preview.source.host ? ` on ${preview.source.host}` : ''}`
              : ''}
            {preview.generatedAt ? ` · ${preview.generatedAt.slice(0, 10)}` : ''}
          </p>
          <p className="acn:m-0 acn:mt-1 acn:font-mono acn:break-words acn:text-muted-foreground">
            {preview.names.slice(0, 12).join(', ')}
            {preview.names.length > 12 ? `, +${preview.names.length - 12} more` : ''}
          </p>
          <p className="acn:m-0 acn:mt-2 acn:text-foreground">
            The rows those tables hold now are deleted first. Users, roles, jobs and the audit log
            are not in a seed, so they are not touched.
          </p>
          {preview.warnings.length > 0 ? (
            <ul className="acn:m-0 acn:mt-2 acn:list-disc acn:space-y-0.5 acn:pl-4 acn:text-muted-foreground">
              {preview.warnings.slice(0, 4).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {preview && !('error' in preview) ? (
        <div className="acn:flex acn:flex-col acn:gap-2">
          <Button
            variant="outline"
            className="acn:self-start"
            disabled={planning}
            onClick={() => void showPlan()}
          >
            {planning ? (
              <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
            ) : (
              <PlayIcon aria-hidden />
            )}
            {planning ? 'Counting…' : plan ? 'Refresh what this would change' : 'Show what this would change'}
          </Button>

          {planError ? (
            <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-xs acn:text-destructive">
              <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
              {planError}
            </p>
          ) : null}

          {plan ? (
            <div className="acn:rounded-lg acn:border acn:border-border">
              <table className="acn:w-full acn:border-collapse acn:text-xs">
                <caption className="acn:border-b acn:border-border acn:px-3 acn:py-2 acn:text-left acn:text-muted-foreground">
                  {plan.tables.length} table(s) · {plan.rows.toLocaleString('en')} row(s) in ·{' '}
                  {plan.sequences} sequence(s) reset · nothing has been written
                </caption>
                <thead>
                  <tr className="acn:border-b acn:border-border acn:text-left acn:text-muted-foreground">
                    <th scope="col" className="acn:px-3 acn:py-1.5 acn:font-medium">Table</th>
                    <th scope="col" className="acn:px-3 acn:py-1.5 acn:text-right acn:font-medium">
                      Deleted
                    </th>
                    <th scope="col" className="acn:px-3 acn:py-1.5 acn:text-right acn:font-medium">
                      Inserted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.tables.slice(0, 30).map((row) => (
                    <tr key={row.name} className="acn:border-b acn:border-border/60 acn:last:border-0">
                      <td className="acn:px-3 acn:py-1.5 acn:font-mono acn:break-all">{row.name}</td>
                      <td className="acn:px-3 acn:py-1.5 acn:text-right acn:tabular-nums">
                        {row.willDelete.toLocaleString('en')}
                        {row.estimated ? <span className="acn:text-muted-foreground"> ~</span> : null}
                      </td>
                      <td className="acn:px-3 acn:py-1.5 acn:text-right acn:tabular-nums">
                        {row.willInsert.toLocaleString('en')}
                      </td>
                    </tr>
                  ))}
                  {plan.tables.length > 30 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="acn:px-3 acn:py-1.5 acn:text-muted-foreground"
                      >
                        and {plan.tables.length - 30} more table(s)…
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {plan.warnings.length > 0 ? (
                <ul className="acn:m-0 acn:list-disc acn:space-y-0.5 acn:border-t acn:border-border acn:px-3 acn:py-2 acn:pl-7 acn:text-xs acn:text-muted-foreground">
                  {plan.warnings.slice(0, 4).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="acn:flex acn:flex-col acn:gap-2 acn:sm:flex-row acn:sm:items-end">
        <label className="acn:flex acn:flex-1 acn:flex-col acn:gap-1.5 acn:text-sm">
          <span className="acn:font-medium">
            Type <code className="acn:font-mono">seed</code> to confirm
          </span>
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="seed"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <Button variant="destructive" disabled={!ready || busy} onClick={() => void apply()}>
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <DatabaseBackupIcon aria-hidden />
          )}
          {busy ? 'Applying…' : 'Apply the seed'}
        </Button>
      </div>

      <Outcome reply={reply} />
      {reply?.ok && Array.isArray(reply.tables) ? (
        <div className="acn:flex acn:flex-wrap acn:gap-1.5">
          {(reply.tables as { name: string; inserted: number }[])
            .filter((table) => table.inserted > 0)
            .slice(0, 12)
            .map((table) => (
              <Badge key={table.name} variant="secondary">
                {table.name} {table.inserted.toLocaleString('en')}
              </Badge>
            ))}
        </div>
      ) : null}
    </div>
  )
}

type Difference = {
  table: string
  kind:
    | 'missing-table'
    | 'missing-column'
    | 'type'
    | 'nullable'
    | 'default'
    | 'extra-column'
    | 'extra-table'
  column?: string
  file?: string
  database?: string
  statement?: string
  caution?: string
}

type Diff = {
  source: { database: string; generatedAt: string }
  scoped: boolean
  tables: { inFile: number; inDatabase: number; compared: number }
  differences: Difference[]
  omitted: number
  rows: { table: string; file: number; database: number; estimated: boolean }[]
  same: boolean
}

const KIND_LABEL: Record<Difference['kind'], string> = {
  'missing-table': 'Table missing here',
  'missing-column': 'Column missing here',
  type: 'Type differs',
  nullable: 'Nullability differs',
  default: 'Default differs',
  'extra-column': 'Column only here',
  'extra-table': 'Table only here',
}

/**
 * Compare this database with a JSON backup from another one — the Neon branch's admin, normally.
 * Read-only: the server reads the catalogs and answers, and the statements it returns are text to
 * read, never something this panel can run.
 */
export function DiffPanel() {
  const apiBase = useApiBase()
  const [file, setFile] = React.useState<File | null>(null)
  const [json, setJson] = React.useState<string | null>(null)
  const [diff, setDiff] = React.useState<Diff | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  const choose = async (chosen: File | null) => {
    setFile(chosen)
    setDiff(null)
    setReply(null)
    setJson(null)
    if (!chosen) return
    const text = await readFile(chosen).catch(() => null)
    if (text === null) {
      setReply({ ok: false, error: 'The file could not be read as text.' })
      return
    }
    setJson(text)
  }

  const compare = async () => {
    if (!json) return
    setBusy(true)
    setReply(null)
    const result = await post(`${apiBase}/diff`, { json })
    if (result.ok) setDiff(result.diff as Diff)
    else setReply(result)
    setBusy(false)
  }

  const blocking = (diff?.differences ?? []).filter(
    (entry) => entry.kind === 'missing-table' || entry.kind === 'missing-column',
  )
  const differing = (diff?.differences ?? []).filter(
    (entry) => entry.kind === 'type' || entry.kind === 'nullable' || entry.kind === 'default',
  )
  const onlyHere = (diff?.differences ?? []).filter(
    (entry) => entry.kind === 'extra-column' || entry.kind === 'extra-table',
  )

  const group = (title: string, entries: Difference[]) =>
    entries.length === 0 ? null : (
      <div className="acn:space-y-1.5">
        <p className="acn:m-0 acn:text-xs acn:font-medium">{title}</p>
        <ul className="acn:m-0 acn:list-none acn:space-y-1.5 acn:p-0">
          {entries.map((entry) => (
            <li key={`${entry.kind}:${entry.table}.${entry.column ?? ''}`} className="acn:text-xs">
              <p className="acn:m-0">
                <span className="acn:text-muted-foreground">{KIND_LABEL[entry.kind]}: </span>
                <code className="acn:font-mono">
                  {entry.table}
                  {entry.column ? `.${entry.column}` : ''}
                </code>{' '}
                <span className="acn:text-muted-foreground">
                  {entry.file ? `file: ${entry.file}` : ''}
                  {entry.file && entry.database ? ' · ' : ''}
                  {entry.database ? `here: ${entry.database}` : ''}
                </span>
              </p>
              {entry.statement ? (
                <code className="acn:mt-0.5 acn:block acn:font-mono acn:break-words acn:text-muted-foreground">
                  {entry.statement}
                </code>
              ) : null}
              {entry.caution ? (
                <p className="acn:m-0 acn:mt-0.5 acn:text-muted-foreground">{entry.caution}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <div className="acn:flex acn:flex-col acn:gap-4">
      <label className="acn:flex acn:flex-col acn:gap-1.5 acn:text-sm">
        <span className="acn:font-medium">JSON backup from the other database</span>
        <input
          type="file"
          accept=".json,application/json"
          className={cn(
            'acn:block acn:w-full acn:cursor-pointer acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-1.5 acn:text-sm',
            'acn:file:mr-2 acn:file:rounded-md acn:file:border-0 acn:file:bg-muted acn:file:px-2 acn:file:py-1 acn:file:text-xs',
          )}
          onChange={(event) => void choose(event.target.files?.[0] ?? null)}
        />
        <span className="acn:text-xs acn:text-muted-foreground">
          Backup → <strong className="acn:font-medium">JSON</strong> on the other environment’s{' '}
          <code className="acn:font-mono">/admin/database</code>.
          {file ? ` · ${file.name}, ${Math.ceil(file.size / 1024).toLocaleString('en')} kB` : ''}
        </span>
      </label>

      <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
        <Button size="sm" variant="outline" disabled={!json || busy} onClick={() => void compare()}>
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <CheckIcon aria-hidden />
          )}
          {busy ? 'Comparing…' : 'Compare'}
        </Button>
        {diff ? (
          <span className="acn:text-xs acn:text-muted-foreground">
            {diff.tables.compared} of {diff.tables.inFile} table(s) compared with{' '}
            {diff.source.database}
            {diff.source.generatedAt ? ` · ${diff.source.generatedAt.slice(0, 10)}` : ''}
            {diff.scoped ? ' · the file named tables, so what it leaves out is not drift' : ''}
          </span>
        ) : null}
      </div>

      {diff ? (
        diff.same ? (
          <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-xs">
            <CheckIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
            The schema is the same: every table and column in the file is here, with the same type,
            nullability and default.
          </p>
        ) : (
          <div className="acn:flex acn:flex-col acn:gap-3 acn:rounded-lg acn:bg-muted acn:p-3">
            {group(
              `Missing here (${blocking.length}) — what stops this database working like the other one`,
              blocking,
            )}
            {group(`Different here (${differing.length})`, differing)}
            {group(`Only here (${onlyHere.length}) — reported, never dropped`, onlyHere)}
            {diff.omitted > 0 ? (
              <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                …and {diff.omitted} more difference(s). Drift this wide is a job for{' '}
                <code className="acn:font-mono">pnpm db:schema-from</code>, not a card.
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {diff && diff.rows.length > 0 ? (
        <div className="acn:flex acn:flex-wrap acn:gap-1.5">
          {diff.rows.slice(0, 12).map((entry) => (
            <Badge key={entry.table} variant="secondary">
              {entry.table} {entry.file.toLocaleString('en')} →{' '}
              {entry.database.toLocaleString('en')}
              {entry.estimated ? '~' : ''}
            </Badge>
          ))}
        </div>
      ) : null}

      <Outcome reply={reply} />
    </div>
  )
}

/** Create a Neon branch pinned to now: the cheap, provider-level backup. */
type NeonBranchRow = { id: string; name: string; default: boolean; parentId: string | null }

/**
 * A branch to work against: a preview database for a pull request, or a copy of production to try a
 * migration on.
 *
 * The difference from the backup form above is intent, and intent changes two things. An endpoint is
 * wanted by default, because the point is to connect to it — and a connection string is a
 * credential, so it is only asked for when the box below is ticked, is shown once, and is never
 * written to the log or the audit trail. `initSource` is the other half: branching from a moment in
 * the parent's history rather than its head, which is what "reproduce yesterday's production data on
 * my pull request" means.
 */
export function NeonBranchForm({
  branches,
  defaultName,
}: {
  branches: NeonBranchRow[]
  defaultName: string
}) {
  const router = useRouter()
  const apiBase = useApiBase()
  const [name, setName] = React.useState(defaultName)
  const [parentId, setParentId] = React.useState('')
  const [withEndpoint, setWithEndpoint] = React.useState(true)
  const [reveal, setReveal] = React.useState(false)
  const [initSource, setInitSource] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  const created = reply?.ok ? reply : null

  return (
    <div className="acn:flex acn:flex-col acn:gap-2">
      <div className="acn:flex acn:flex-col acn:gap-2 acn:sm:flex-row">
        <Input
          aria-label="Branch name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="pr-412-preview"
        />
        <select
          aria-label="Parent branch"
          className="acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-1.5 acn:text-sm"
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
        >
          <option value="">From the branch this app uses</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
              {branch.default ? ' (default)' : ''}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={busy || name.trim().length === 0}
          onClick={async () => {
            setBusy(true)
            setReply(null)
            const result = await post(`${apiBase}/neon/branch`, {
              name,
              withEndpoint,
              reveal,
              ...(parentId ? { parentId } : {}),
              ...(initSource ? { initSource } : {}),
            })
            setReply(result)
            if (result.ok) router.refresh()
            setBusy(false)
          }}
        >
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <GitBranchIcon aria-hidden />
          )}
          {busy ? 'Creating…' : 'Create branch'}
        </Button>
      </div>

      <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs acn:text-muted-foreground">
        <input
          type="checkbox"
          checked={withEndpoint}
          onChange={(event) => setWithEndpoint(event.target.checked)}
          className="acn:size-3.5 acn:accent-primary"
        />
        Create a compute endpoint too, so something can connect to it (costs compute while it runs)
      </label>
      <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs acn:text-muted-foreground">
        <input
          type="checkbox"
          checked={reveal}
          onChange={(event) => setReveal(event.target.checked)}
          className="acn:size-3.5 acn:accent-primary"
        />
        Show the connection string in the response — it is a credential, and it is not logged
      </label>

      <label className="acn:flex acn:flex-col acn:gap-1 acn:text-xs acn:text-muted-foreground">
        <span>Branch from a moment in the parent’s history (optional)</span>
        <input
          type="datetime-local"
          className="acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-1.5 acn:text-sm"
          value={initSource}
          onChange={(event) => setInitSource(event.target.value)}
        />
      </label>

      <Outcome reply={reply} />

      {created ? (
        <div className="acn:rounded-lg acn:bg-muted acn:p-3 acn:text-xs">
          <p className="acn:m-0 acn:font-medium">
            {String(created.branch ? (created.branch as { name: string }).name : name)} ·{' '}
            <span className="acn:font-mono">
              {created.branch ? (created.branch as { id: string }).id : ''}
            </span>
          </p>
          {Array.isArray(created.endpoints) && created.endpoints.length > 0 ? (
            <p className="acn:m-0 acn:mt-1 acn:font-mono acn:text-muted-foreground">
              {(created.endpoints as { host: string }[]).map((endpoint) => endpoint.host).join(', ')}
            </p>
          ) : null}
          {typeof created.connectionUri === 'string' ? (
            <div className="acn:mt-2">
              <p className="acn:m-0 acn:font-medium acn:text-foreground">Connection string</p>
              <code className="acn:mt-1 acn:block acn:rounded-md acn:border acn:border-border acn:bg-background acn:p-2 acn:font-mono acn:text-xs acn:break-all">
                {created.connectionUri}
              </code>
              <p className="acn:m-0 acn:mt-1 acn:text-muted-foreground">
                Put it in the preview environment’s <code className="acn:font-mono">POSTGRES_URL</code>.
                It is shown once, is not in the log or the audit trail, and the branch should be
                deleted when the pull request is merged.
              </p>
            </div>
          ) : null}
          {typeof created.warning === 'string' ? (
            <p className="acn:m-0 acn:mt-2 acn:text-muted-foreground">{created.warning}</p>
          ) : null}
          {typeof created.consoleUrl === 'string' && created.consoleUrl ? (
            <a
              className="acn:mt-1 acn:inline-block acn:text-primary acn:hover:underline"
              href={created.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open this project in the Neon console
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type AutovacuumParameter = {
  name: string
  kind: 'boolean' | 'integer' | 'real'
  min?: number
  max?: number
  description: string
  serverDefault?: string
}

/**
 * Per-table autovacuum overrides.
 *
 * The server-wide trigger (`threshold + scale_factor × rows`, 50 and 0.2 by default) is wrong in
 * opposite directions for two kinds of table: a hot one wants a smaller factor so it is vacuumed
 * sooner, and an append-only one is never vacuumed by a delete-driven trigger at all. Neither is a
 * reason to change the server for everybody, and on a managed database that is not an option anyway.
 *
 * The form only offers the allow-listed parameters, shows each one's server default and current
 * override, and asks for the table's name before sending — this is DDL. An empty field means "no
 * override", so saving sends only the fields that have a value, and *Reset* removes the ones that
 * are set. What comes back is read from the catalog afterwards, not assumed from the request.
 */
export function AutovacuumForm({
  table,
  current,
  onSaved,
}: {
  table: string
  current: Record<string, string>
  onSaved?: () => void
}) {
  const apiBase = useApiBase()
  const [parameters, setParameters] = React.useState<AutovacuumParameter[]>([])
  const [values, setValues] = React.useState<Record<string, string>>(current)
  const [confirmation, setConfirmation] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      const result = await get(`${apiBase}/autovacuum?table=${encodeURIComponent(table)}`)
      if (cancelled) return
      if (result.ok && Array.isArray(result.parameters)) {
        setParameters(result.parameters as AutovacuumParameter[])
      }
      const live = result.ok && result.current ? (result.current as { autovacuum: Record<string, string> }) : null
      if (live) setValues(live.autovacuum)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [apiBase, table])

  const filled = Object.fromEntries(
    Object.entries(values).filter(([, value]) => String(value ?? '').trim() !== ''),
  )
  const changed =
    Object.keys(filled).some((name) => String(filled[name]) !== String(current[name] ?? '')) ||
    Object.keys(current).some((name) => !(name in filled))
  const ready = confirmation.trim().toLowerCase() === table.toLowerCase()

  const send = async (mode: 'set' | 'reset') => {
    setBusy(true)
    setReply(null)
    const settings =
      mode === 'set'
        ? filled
        : Object.fromEntries(Object.keys(current).map((name) => [name, '1']))
    const result = await post(`${apiBase}/autovacuum`, { table, settings, mode, confirmation })
    setReply(result)
    if (result.ok) {
      setConfirmation('')
      const live = result as { autovacuum?: Record<string, string> }
      if (live.autovacuum) setValues(live.autovacuum)
      onSaved?.()
    }
    setBusy(false)
  }

  return (
    <div className="acn:flex acn:flex-col acn:gap-3">
      {parameters.length === 0 ? (
        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">Reading the parameters…</p>
      ) : (
        <dl className="acn:m-0 acn:grid acn:gap-2 acn:sm:grid-cols-2">
          {parameters.map((parameter) => (
            <div
              key={parameter.name}
              className="acn:flex acn:flex-col acn:gap-1 acn:rounded-lg acn:border acn:border-border acn:p-2.5"
            >
              <dt className="acn:font-mono acn:text-xs acn:font-medium">{parameter.name}</dt>
              <dd className="acn:m-0">
                {parameter.kind === 'boolean' ? (
                  <select
                    aria-label={parameter.name}
                    className="acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2 acn:py-1 acn:text-xs"
                    value={values[parameter.name] ?? ''}
                    onChange={(event) =>
                      setValues((previous) => ({ ...previous, [parameter.name]: event.target.value }))
                    }
                  >
                    <option value="">server default{parameter.serverDefault ? ` (${parameter.serverDefault})` : ''}</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    aria-label={parameter.name}
                    className="acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2 acn:py-1 acn:font-mono acn:text-xs"
                    placeholder={parameter.serverDefault ? `default ${parameter.serverDefault}` : ''}
                    value={values[parameter.name] ?? ''}
                    onChange={(event) =>
                      setValues((previous) => ({ ...previous, [parameter.name]: event.target.value }))
                    }
                  />
                )}
                <span className="acn:mt-1 acn:block acn:text-xs acn:text-muted-foreground">
                  {parameter.description}
                  {parameter.min !== undefined || parameter.max !== undefined
                    ? ` (${parameter.min ?? '−∞'}…${parameter.max ?? '∞'})`
                    : ''}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="acn:flex acn:flex-col acn:gap-2 acn:sm:flex-row acn:sm:items-end">
        <label className="acn:flex acn:flex-1 acn:flex-col acn:gap-1 acn:text-xs">
          <span className="acn:font-medium">
            Type <code className="acn:font-mono">{table}</code> to confirm
          </span>
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={table}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="acn:flex acn:gap-2">
          <Button size="sm" disabled={busy || !ready || !changed} onClick={() => void send('set')}>
            {busy ? <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" /> : <WrenchIcon aria-hidden />}
            Save overrides
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !ready || Object.keys(current).length === 0}
            onClick={() => void send('reset')}
          >
            <RotateCcwIcon aria-hidden />
            Reset
          </Button>
        </div>
      </div>

      <Outcome reply={reply} />
      {reply?.ok && typeof reply.vacuumTrigger === 'number' ? (
        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
          Autovacuum now fires for this table at{' '}
          {Number(reply.vacuumTrigger).toLocaleString('en')} dead tuple(s), and an analyze at{' '}
          {Number(reply.analyzeTrigger).toLocaleString('en')} modified row(s).
        </p>
      ) : null}
      {reply?.ok && Array.isArray(reply.unknown) && (reply.unknown as string[]).length > 0 ? (
        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
          Not set, because this tool does not know them: {(reply.unknown as string[]).join(', ')}.
        </p>
      ) : null}
    </div>
  )
}

export function NeonBackupForm({ defaultName }: { defaultName: string }) {
  const router = useRouter()
  const apiBase = useApiBase()
  const [name, setName] = React.useState(defaultName)
  const [withEndpoint, setWithEndpoint] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  return (
    <div className="acn:flex acn:flex-col acn:gap-2">
      <div className="acn:flex acn:flex-col acn:gap-2 acn:sm:flex-row">
        <Input
          aria-label="Branch name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="before-the-import"
        />
        <Button
          size="sm"
          disabled={busy || name.trim().length === 0}
          onClick={async () => {
            setBusy(true)
            setReply(null)
            const result = await post(`${apiBase}/neon/backup`, { name, withEndpoint })
            setReply(result)
            if (result.ok) router.refresh()
            setBusy(false)
          }}
        >
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <DatabaseBackupIcon aria-hidden />
          )}
          {busy ? 'Creating…' : 'Create branch'}
        </Button>
      </div>
      <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs acn:text-muted-foreground">
        <input
          type="checkbox"
          checked={withEndpoint}
          onChange={(event) => setWithEndpoint(event.target.checked)}
          className="acn:size-3.5 acn:accent-primary"
        />
        Also create a compute endpoint, so the branch can be queried (costs compute when used)
      </label>
      <Outcome reply={reply} />
    </div>
  )
}

/** Point-in-time restore of the whole branch — the one operation that replaces every table. */
export function NeonRestoreForm({ latest }: { latest: string }) {
  const router = useRouter()
  const apiBase = useApiBase()
  const [timestamp, setTimestamp] = React.useState(latest)
  const [preserve, setPreserve] = React.useState('before-restore')
  const [confirmation, setConfirmation] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  const ready =
    timestamp.length > 0 &&
    !Number.isNaN(new Date(timestamp).getTime()) &&
    confirmation.trim().toLowerCase() === 'restore'

  return (
    <div className="acn:flex acn:flex-col acn:gap-3">
      <div className="acn:grid acn:gap-2 acn:sm:grid-cols-2">
        <label className="acn:flex acn:flex-col acn:gap-1.5 acn:text-sm">
          <span className="acn:font-medium">Restore to</span>
          <Input
            type="datetime-local"
            value={timestamp}
            step={1}
            onChange={(event) => setTimestamp(event.target.value)}
          />
        </label>
        <label className="acn:flex acn:flex-col acn:gap-1.5 acn:text-sm">
          <span className="acn:font-medium">Keep the current state as</span>
          <Input
            value={preserve}
            onChange={(event) => setPreserve(event.target.value)}
            placeholder="before-restore"
          />
        </label>
      </div>
      <label className="acn:flex acn:flex-col acn:gap-1.5 acn:text-sm">
        <span className="acn:font-medium">
          Type <code className="acn:font-mono">restore</code> to confirm
        </span>
        <Input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="restore"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div>
        <Button
          variant="destructive"
          size="sm"
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true)
            setReply(null)
            const result = await post(`${apiBase}/neon/restore`, {
              // The input is the browser's local time; send the instant, not the wall clock.
              timestamp: new Date(timestamp).toISOString(),
              confirmation,
              preserveUnderName: preserve,
            })
            setReply(result)
            if (result.ok) router.refresh()
            setBusy(false)
          }}
        >
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <RotateCcwIcon aria-hidden />
          )}
          {busy ? 'Restoring…' : 'Restore this branch'}
        </Button>
      </div>
      <Outcome reply={reply} />
    </div>
  )
}

/** Delete a branch (a backup, normally). Typing the id is the confirmation. */
export function NeonDeleteBranch({ branchId, name }: { branchId: string; name: string }) {
  const router = useRouter()
  const apiBase = useApiBase()
  const [open, setOpen] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  if (!open) {
    return (
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Delete branch ${name}`}
      >
        <Trash2Icon aria-hidden />
      </Button>
    )
  }

  return (
    <div className="acn:flex acn:flex-col acn:items-end acn:gap-1">
      <div className="acn:flex acn:items-center acn:gap-1">
        <Input
          aria-label={`Type ${branchId} to confirm deleting ${name}`}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={branchId}
          className="acn:h-7 acn:w-48 acn:text-xs"
        />
        <Button
          size="xs"
          variant="destructive"
          disabled={busy || confirmation !== branchId}
          onClick={async () => {
            setBusy(true)
            setReply(null)
            const result = await post(`${apiBase}/neon/delete`, { branchId, confirmation })
            setReply(result)
            if (result.ok) {
              setOpen(false)
              router.refresh()
            }
            setBusy(false)
          }}
        >
          {busy ? (
            <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
          ) : (
            <Trash2Icon aria-hidden />
          )}
          Delete
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
      <Outcome reply={reply} />
    </div>
  )
}
