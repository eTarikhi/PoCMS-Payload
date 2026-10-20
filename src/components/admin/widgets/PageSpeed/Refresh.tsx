'use client'

import { LoaderCircleIcon, RotateCwIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button } from '@/components/admin/elements/Button'

/**
 * "Run again" on the Page speed widget (E4b): runs the `pagespeed-report` job, which tests phones
 * and desktops, stores the run and expires the `pagespeed` cache tag, so the next render shows the
 * new scores. A client island: the widget itself stays a server component.
 */
export function PageSpeedRefresh() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'pagespeed-report' }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        job?: { summary?: string; status?: string }
      }
      if (!response.ok) setMessage(data.error ?? `HTTP ${response.status}`)
      else {
        setMessage(data.job?.summary ?? 'The report is updated.')
        router.refresh()
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
      <Button size="xs" variant="outline" disabled={busy} onClick={() => void run()}>
        {busy ? (
          <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
        ) : (
          <RotateCwIcon aria-hidden />
        )}
        {busy ? 'Running Lighthouse…' : 'Run again'}
      </Button>
      {message ? (
        <p role="status" className="acn:m-0 acn:text-xs acn:text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  )
}

export default PageSpeedRefresh
