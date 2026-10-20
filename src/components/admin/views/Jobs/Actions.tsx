'use client'

import { LoaderCircleIcon, PlayIcon, XIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button } from '@/components/admin/elements/Button'

/**
 * The two actions on the jobs page (E4): run a task now and cancel a queued run. They call the
 * endpoints, show the server's message when it refuses (no permission, missing variable, a run
 * already in progress) and refresh the server component, which re-reads the runs.
 */
async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    return response.ok
      ? { ok: true }
      : { ok: false, error: data.error ?? `HTTP ${response.status}` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return {
    busy,
    error,
    setError,
    async run(path: string, body: unknown) {
      setBusy(true)
      setError(null)
      const result = await post(path, body)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'The run failed.')
      setBusy(false)
      // The outcome is in the runs table after the refresh; the message stays until the next try.
      return result
    },
  }
}

export function RunNowButton({ task, label }: { task: string; label: string }) {
  const { busy, error, run } = useAction()
  return (
    <div className="acn:flex acn:flex-col acn:items-end acn:gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void run('/api/jobs/run', { task })}
      >
        {busy ? (
          <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
        ) : (
          <PlayIcon aria-hidden />
        )}
        {busy ? 'Running…' : 'Run now'}
        <span className="acn:sr-only"> {label}</span>
      </Button>
      {error ? (
        <p
          role="status"
          className="acn:m-0 acn:max-w-64 acn:text-right acn:text-xs acn:text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function CancelRunButton({ id }: { id: number }) {
  const { busy, error, run } = useAction()
  return (
    <div className="acn:flex acn:flex-col acn:items-start acn:gap-1">
      <Button
        size="xs"
        variant="ghost"
        disabled={busy}
        onClick={() => void run('/api/jobs/cancel', { id })}
      >
        <XIcon aria-hidden />
        Cancel
        <span className="acn:sr-only"> run {id}</span>
      </Button>
      {error ? (
        <p role="status" className="acn:m-0 acn:text-xs acn:text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
