'use client'

import {
  BanIcon,
  LoaderCircleIcon,
  PowerIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import { Input } from '@/components/admin/elements/Input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import type { SessionInfo, SessionOverview } from '@/plugins/databaseTools/server/sessions'

import { Outcome, useApiBase } from './Actions'

/**
 * The live sessions card. Read from the server component (which has the connection), acted on here:
 * every action is one POST and a `router.refresh()`, so the table that follows is what Postgres says
 * afterwards, not what the button assumed.
 *
 * Cancel is the default action because it stops one statement and keeps the connection; terminate is
 * behind a typed confirmation because it rolls the session's transaction back.
 */

type Reply = { ok: boolean; error?: string; hint?: string; [key: string]: unknown }

const post = async (path: string, body: unknown): Promise<Reply> => {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as Reply
    return response.ok ? { ...data, ok: true } : { ok: false, error: data.error, hint: data.hint }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Seconds as something readable: 4 s, 2 min 10 s, 1 h 4 min. */
export const duration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 === 0 ? `${minutes} min` : `${minutes} min ${seconds % 60} s`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

const STATE_TONE: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  active: 'secondary',
  idle: 'outline',
  'idle in transaction': 'destructive',
  'idle in transaction (aborted)': 'destructive',
}

const STATE_LABEL: Record<string, string> = {
  active: 'active',
  idle: 'idle',
  'idle in transaction': 'idle in transaction',
  'idle in transaction (aborted)': 'idle in transaction (aborted)',
}

export function SessionsPanel({
  overview,
  longRunningSeconds,
}: {
  overview: SessionOverview
  longRunningSeconds: number
}) {
  const router = useRouter()
  const apiBase = useApiBase()
  const [busy, setBusy] = React.useState<number | null>(null)
  const [terminating, setTerminating] = React.useState<number | null>(null)
  const [confirmation, setConfirmation] = React.useState('')
  const [reply, setReply] = React.useState<Reply | null>(null)

  const act = async (pid: number, action: 'cancel' | 'terminate', typed?: string) => {
    setBusy(pid)
    setReply(null)
    const result = await post(`${apiBase}/sessions/${action}`, {
      pid,
      ...(action === 'terminate' ? { confirmation: typed ?? '' } : {}),
    })
    setBusy(null)
    setReply(result)
    if (result.ok) {
      setTerminating(null)
      setConfirmation('')
      router.refresh()
    }
  }

  const rows = overview.sessions
  const attention = overview.blocked + (overview.longest ? 1 : 0)

  return (
    <div className="acn:flex acn:flex-col acn:gap-3">
      <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2 acn:text-xs">
        <Badge variant="secondary">{overview.active} active</Badge>
        <Badge variant="outline">{overview.idle} idle</Badge>
        {overview.idleInTransaction > 0 ? (
          <Badge variant="destructive">{overview.idleInTransaction} idle in transaction</Badge>
        ) : null}
        {overview.blocked > 0 ? <Badge variant="destructive">{overview.blocked} blocked</Badge> : null}
        <span className="acn:text-muted-foreground">
          as <span className="acn:font-mono">{overview.role}</span>
          {overview.isSuperuser ? ' (superuser)' : ' (not a superuser)'}
        </span>
      </div>

      {overview.longest ? (
        <div
          role="status"
          className="acn:flex acn:items-start acn:gap-2 acn:rounded-lg acn:border acn:border-amber-500/40 acn:bg-amber-500/10 acn:p-3 acn:text-sm"
        >
          <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-4 acn:shrink-0" />
          <div>
            <p className="acn:m-0 acn:font-medium">
              Session {overview.longest.pid} has been running a statement for{' '}
              {duration(overview.longest.seconds)}.
            </p>
            <p className="acn:m-0 acn:mt-0.5 acn:font-mono acn:text-xs acn:text-muted-foreground acn:break-words">
              {overview.longest.query || 'query text is not visible to this role'}
            </p>
          </div>
        </div>
      ) : null}

      {!overview.canSeeAllQueries ? (
        <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-xs acn:text-muted-foreground">
          <ShieldAlertIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
          <span>
            This role cannot read other roles’ query text, so some rows show no statement. A
            superuser, or a role with <code>pg_read_all_stats</code>, sees all of them; it is also
            needed to signal sessions of other roles.
          </span>
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PID</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>State</TableHead>
            <TableHead>For</TableHead>
            <TableHead>Statement</TableHead>
            <TableHead className="acn:text-right"> </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="acn:text-xs acn:text-muted-foreground">
                No sessions.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((session: SessionInfo) => {
              const blocked = session.blockedBy.length > 0
              const long = session.seconds >= longRunningSeconds
              const tone = blocked
                ? 'destructive'
                : (STATE_TONE[session.state] ?? 'outline')
              return (
                <React.Fragment key={session.pid}>
                  <TableRow>
                    <TableCell className="acn:font-mono acn:text-xs">
                      {session.pid}
                      {session.own ? (
                        <Badge variant="outline" className="acn:ml-1.5">
                          this page
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="acn:text-xs">
                      <span className="acn:block">{session.user ?? '—'}</span>
                      {session.application ? (
                        <span className="acn:block acn:text-muted-foreground">
                          {session.application}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="acn:text-xs">
                      <Badge variant={tone}>{STATE_LABEL[session.state] ?? session.state}</Badge>
                      {session.wait ? (
                        <span className="acn:mt-0.5 acn:block acn:text-muted-foreground">
                          {session.wait}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={
                        long
                          ? 'acn:text-xs acn:tabular-nums acn:text-destructive'
                          : 'acn:text-xs acn:tabular-nums'
                      }
                    >
                      {session.own ? '—' : duration(session.seconds)}
                    </TableCell>
                    <TableCell className="acn:max-w-96 acn:text-xs">
                      <span className="acn:block acn:truncate acn:font-mono" title={session.query ?? ''}>
                        {session.query ?? '—'}
                      </span>
                      {blocked ? (
                        <span className="acn:mt-0.5 acn:block acn:text-muted-foreground">
                          waiting for {session.blockedBy.map((pid) => `#${pid}`).join(', ')}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="acn:text-right">
                      {session.own || terminating === session.pid ? null : (
                        <div className="acn:flex acn:justify-end acn:gap-1">
                          {session.state === 'active' ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() => act(session.pid, 'cancel')}
                            >
                              {busy === session.pid ? (
                                <LoaderCircleIcon aria-hidden className="acn:animate-spin" />
                              ) : (
                                <BanIcon aria-hidden />
                              )}
                              Cancel query
                            </Button>
                          ) : null}
                          <Button
                            size="xs"
                            variant="destructive"
                            disabled={busy !== null}
                            onClick={() => {
                              setTerminating(session.pid)
                              setConfirmation('')
                              setReply(null)
                            }}
                          >
                            <PowerIcon aria-hidden />
                            End session
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  {terminating === session.pid ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <form
                          className="acn:flex acn:flex-wrap acn:items-end acn:gap-2 acn:rounded-lg acn:border acn:border-destructive/30 acn:bg-destructive/5 acn:p-3"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void act(session.pid, 'terminate', confirmation)
                          }}
                        >
                          <label className="acn:flex acn:flex-col acn:gap-1 acn:text-xs">
                            <span>
                              Ending #{session.pid} rolls back its transaction and releases its locks.
                              Type the id to confirm.
                            </span>
                            <Input
                              value={confirmation}
                              onChange={(event) => setConfirmation(event.target.value)}
                              placeholder={String(session.pid)}
                              aria-label={`Type ${session.pid} to confirm ending the session`}
                              className="acn:w-32"
                            />
                          </label>
                          <Button
                            size="sm"
                            variant="destructive"
                            type="submit"
                            disabled={busy !== null || confirmation.trim() !== String(session.pid)}
                          >
                            End session
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() => {
                              setTerminating(null)
                              setConfirmation('')
                            }}
                          >
                            Keep it
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              )
            })
          )}
        </TableBody>
      </Table>

      <Outcome reply={reply} />
      {attention === 0 ? null : (
        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
          Cancel first: it stops one statement and the client can retry. Ending a session is for an
          idle transaction, which has nothing to cancel.
        </p>
      )}
    </div>
  )
}
