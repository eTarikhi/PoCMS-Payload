'use client'

import {
  CheckIcon,
  DatabaseBackupIcon,
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

type Reply = { ok: boolean; error?: string; hint?: string; [key: string]: unknown }

async function post(path: string, body: unknown): Promise<Reply> {
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
  const [busy, setBusy] = React.useState<Action | null>(null)
  const [reply, setReply] = React.useState<Reply | null>(null)

  const run = async (action: Action) => {
    setBusy(action)
    setReply(null)
    const result = await post('/api/database/maintenance', { action, table: table ?? null })
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
          const result = await post('/api/database/repair', { check })
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
          const result = await post('/api/database/repair', { check: 'all' })
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
    const result = await post('/api/database/restore-inspect', { sql })
    if (result.ok) setInspection(result.inspection as Inspection)
    else setReply(result)
    setBusy(null)
  }

  const restore = async () => {
    if (!sql) return
    setBusy('restore')
    setReply(null)
    const result = await post('/api/database/restore', {
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

/** Create a Neon branch pinned to now: the cheap, provider-level backup. */
export function NeonBackupForm({ defaultName }: { defaultName: string }) {
  const router = useRouter()
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
            const result = await post('/api/database/neon/backup', { name, withEndpoint })
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
            const result = await post('/api/database/neon/restore', {
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
            const result = await post('/api/database/neon/delete', { branchId, confirmation })
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
