'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/admin/elements/Button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/admin/elements/Card'
import type { TerminalScriptOption } from '@/terminal/scripts'

type Status = 'idle' | 'running' | 'finished' | 'error'

const STATUS_TEXT: Record<Status, string> = {
  idle: 'Ready.',
  running: 'Running…',
  finished: 'Finished.',
  error: 'Failed to run.',
}

/**
 * The terminal's client half (CR-12 E7): a fixed list of package scripts, one POST that streams
 * the output, and a Stop button that aborts the request (the endpoint kills the process). Nothing
 * typed here reaches a command line: the browser sends a slug only.
 */
export function TerminalConsole({ scripts }: { scripts: TerminalScriptOption[] }) {
  const [slug, setSlug] = useState(scripts[0]?.slug ?? '')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const controller = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)
  const selected = scripts.find((script) => script.slug === slug)

  // Follow the output as it streams in, like a terminal.
  useEffect(() => {
    const element = outputRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [output])

  const run = useCallback(async () => {
    if (!selected || status === 'running') return
    const abort = new AbortController()
    controller.current = abort
    setStatus('running')
    setOutput('')
    try {
      const response = await fetch('/api/dev/terminal', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: selected.slug }),
        signal: abort.signal,
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setOutput(`Request failed (${response.status})${data?.error ? `: ${data.error}` : ''}\n`)
        setStatus('error')
        return
      }
      const reader = response.body?.getReader()
      if (!reader) {
        setOutput('The server returned no stream.\n')
        setStatus('error')
        return
      }
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        setOutput((previous) => previous + decoder.decode(value, { stream: true }))
      }
      setOutput((previous) => previous + decoder.decode())
      setStatus('finished')
    } catch (error) {
      if (abort.signal.aborted) {
        setOutput((previous) => `${previous}\n[stopped]\n`)
        setStatus('idle')
        return
      }
      setOutput((previous) => `${previous}\n[could not run: ${String(error)}]\n`)
      setStatus('error')
    } finally {
      controller.current = null
    }
  }, [selected, status])

  const stop = () => controller.current?.abort()

  return (
    <div className="acn:grid acn:gap-6 acn:lg:grid-cols-[22rem_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="acn:m-0 acn:text-base">Commands</h2>
          </CardTitle>
          <CardDescription>
            Fixed package scripts compiled into the build. There is no free-text command line.
          </CardDescription>
        </CardHeader>
        <CardContent className="acn:space-y-4">
          <div className="acn:space-y-1.5">
            <label htmlFor="terminal-script" className="acn:text-sm acn:font-medium">
              Command
            </label>
            <select
              id="terminal-script"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={status === 'running'}
              className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-2 acn:text-sm acn:text-foreground focus-visible:acn:border-ring focus-visible:acn:ring-3 focus-visible:acn:ring-ring/50"
            >
              {scripts.map((script) => (
                <option key={script.slug} value={script.slug}>
                  {script.label}
                </option>
              ))}
            </select>
            {selected ? (
              <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                {selected.description} · stops after {Math.round(selected.timeoutSeconds / 60)} min.
              </p>
            ) : null}
            {selected?.writes ? (
              <p className="acn:m-0 acn:text-xs acn:text-destructive">
                This command writes files in the repository.
              </p>
            ) : null}
          </div>

          <div className="acn:flex acn:flex-wrap acn:gap-2">
            <Button onClick={run} disabled={status === 'running' || !selected}>
              Run
            </Button>
            <Button variant="outline" onClick={stop} disabled={status !== 'running'}>
              Stop
            </Button>
          </div>

          <p role="status" className="acn:m-0 acn:text-xs acn:text-muted-foreground">
            {STATUS_TEXT[status]}
          </p>

          <p className="acn:m-0 acn:border-t acn:border-border acn:pt-3 acn:text-xs acn:text-muted-foreground">
            Available here only while the admin runs in development. The endpoint answers 404 in a
            production build.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="acn:m-0 acn:text-base">Output</h2>
          </CardTitle>
          <CardDescription>The command&rsquo;s stdout and stderr, streamed.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre
            ref={outputRef}
            role="log"
            aria-label="Command output"
            data-testid="terminal-output"
            className="acn:m-0 acn:h-[32rem] acn:overflow-auto acn:rounded-lg acn:bg-muted acn:p-4 acn:font-mono acn:text-xs acn:leading-relaxed acn:whitespace-pre-wrap acn:text-foreground"
          >
            {output || 'The output appears here when a command runs.'}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

export default TerminalConsole
