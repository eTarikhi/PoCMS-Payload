'use client'

import { toast } from '@payloadcms/ui'
import { CopyIcon, EraserIcon, LoaderCircleIcon, PlayIcon, TerminalIcon } from 'lucide-react'
import React, { useRef, useState } from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/elements/Card'
import { Input } from '@/components/admin/elements/Input'
import { RunStatus } from '@/components/admin/elements/RunStatus'
import type { TerminalRunResult } from '@/endpoints/devTerminal'

const QUICK_COMMANDS: ReadonlyArray<{ label: string; command: string }> = [
  { label: 'git status', command: 'git status -sb' },
  { label: 'git log', command: 'git log --oneline -n 8' },
  { label: 'payload migrate:status', command: 'payload migrate:status' },
  { label: 'pnpm generate:types', command: 'node scripts/generate.mjs types' },
  { label: 'tsc --noEmit', command: 'pnpm exec tsc --noEmit' },
  { label: 'node & pnpm versions', command: 'node -v && pnpm -v' },
]

type HistoryEntry = TerminalRunResult & {
  id: string
  ranAt: string
}

export function TerminalClient({
  apiRoute,
  cwd,
}: {
  apiRoute: string
  cwd: string
}) {
  const [command, setCommand] = useState('')
  const [running, setRunning] = useState(false)
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyCursor, setHistoryCursor] = useState<number>(-1)
  const outputEndRef = useRef<HTMLDivElement>(null)

  const execute = async (rawCmd: string) => {
    const trimmed = rawCmd.trim()
    if (!trimmed) return
    if (trimmed === 'clear' || trimmed === 'cls') {
      setEntries([])
      setCommand('')
      return
    }

    setRunning(true)
    setCommandHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 30))
    setHistoryCursor(-1)

    try {
      const res = await fetch(`${apiRoute}/dev-terminal`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      })
      const data = (await res.json()) as (TerminalRunResult & { ok?: boolean; error?: string })
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setEntries((prev) => [
        ...prev,
        {
          ...data,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ranAt: new Date().toLocaleTimeString(),
        },
      ])
      setCommand('')
      setTimeout(() => outputEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Terminal execution failed.')
    } finally {
      setRunning(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' && commandHistory.length > 0) {
      event.preventDefault()
      const nextIdx = Math.min(historyCursor + 1, commandHistory.length - 1)
      setHistoryCursor(nextIdx)
      setCommand(commandHistory[nextIdx] ?? '')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (historyCursor <= 0) {
        setHistoryCursor(-1)
        setCommand('')
      } else {
        const nextIdx = historyCursor - 1
        setHistoryCursor(nextIdx)
        setCommand(commandHistory[nextIdx] ?? '')
      }
    }
  }

  const copyEntry = async (entry: HistoryEntry) => {
    const combined = [entry.stdout, entry.stderr].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(`$ ${entry.command}\n${combined}`)
      toast.success('Copied command output.')
    } catch {
      toast.error('Clipboard unavailable.')
    }
  }

  return (
    <div data-testid="terminal-view" className="acn:space-y-6 acn:pt-6 acn:pb-16">
      <header className="acn:flex acn:flex-wrap acn:items-start acn:justify-between acn:gap-4">
        <div className="acn:space-y-1">
          <div className="acn:flex acn:items-center acn:gap-2">
            <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">
              Dev terminal
            </h1>
            <Badge variant="secondary">Development only</Badge>
          </div>
          <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
            Run non-interactive shell commands in{' '}
            <code className="acn:font-mono">{cwd}</code>. Strictly disabled in production builds
            (returns HTTP 404).
          </p>
        </div>

        {entries.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEntries([])}
          >
            <EraserIcon aria-hidden className="acn:size-4" />
            Clear output
          </Button>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Quick commands</CardTitle>
          <CardDescription>
            One-click workspace presets, or type any command below (<kbd>↑</kbd>/<kbd>↓</kbd> for
            history, <code className="acn:font-mono">clear</code> to reset).
          </CardDescription>
        </CardHeader>
        <CardContent className="acn:space-y-4">
          <div className="acn:flex acn:flex-wrap acn:gap-2">
            {QUICK_COMMANDS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() => void execute(preset.command)}
                className="acn:font-mono acn:text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void execute(command)
            }}
            className="acn:flex acn:items-center acn:gap-2"
          >
            <span
              aria-hidden
              className="acn:select-none acn:font-mono acn:text-sm acn:font-semibold acn:text-muted-foreground"
            >
              $
            </span>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="git status -sb"
              aria-label="Shell command"
              disabled={running}
              className="acn:flex-1 acn:font-mono acn:text-sm"
            />
            <Button type="submit" size="sm" disabled={running || !command.trim()}>
              {running ? (
                <LoaderCircleIcon aria-hidden className="acn:size-4 acn:animate-spin" />
              ) : (
                <PlayIcon aria-hidden className="acn:size-4" />
              )}
              {running ? 'Running…' : 'Run'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="acn:overflow-hidden acn:rounded-lg acn:border acn:border-border acn:bg-zinc-950 acn:text-zinc-100">
        <div className="acn:flex acn:items-center acn:justify-between acn:border-b acn:border-zinc-800 acn:px-4 acn:py-2 acn:text-xs acn:text-zinc-400">
          <span className="acn:flex acn:items-center acn:gap-2 acn:font-mono">
            <TerminalIcon aria-hidden className="acn:size-3.5" />
            {cwd}
          </span>
          <span>{entries.length} command(s) in session</span>
        </div>

        <div className="acn:max-h-[34rem] acn:space-y-4 acn:overflow-y-auto acn:p-4 acn:font-mono acn:text-xs">
          {entries.length === 0 ? (
            <p className="acn:m-0 acn:text-zinc-500">
              No commands executed yet. Select a preset above or run a command.
            </p>
          ) : (
            entries.map((entry) => {
              const succeeded = entry.exitCode === 0 && !entry.timedOut
              return (
                <div
                  key={entry.id}
                  className="acn:space-y-2 acn:border-b acn:border-zinc-800/80 acn:pb-4 acn:last:border-b-0 acn:last:pb-0"
                >
                  <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
                    <span className="acn:font-semibold acn:text-amber-400">
                      $ {entry.command}
                    </span>
                    <div className="acn:flex acn:items-center acn:gap-2">
                      <RunStatus
                        tone={succeeded ? 'good' : 'poor'}
                        label={
                          entry.timedOut
                            ? 'Timed out'
                            : `exit ${entry.exitCode ?? '?'}`
                        }
                      />
                      <span className="acn:text-zinc-400">{entry.durationMs}ms</span>
                      <button
                        type="button"
                        onClick={() => void copyEntry(entry)}
                        title="Copy output"
                        className="acn:cursor-pointer acn:rounded acn:border acn:border-zinc-700 acn:bg-transparent acn:p-1 acn:text-zinc-300 acn:hover:bg-zinc-800"
                      >
                        <CopyIcon aria-hidden className="acn:size-3" />
                      </button>
                    </div>
                  </div>

                  {entry.stdout ? (
                    <pre className="acn:m-0 acn:overflow-x-auto acn:whitespace-pre-wrap acn:text-zinc-200">
                      {entry.stdout}
                    </pre>
                  ) : null}

                  {entry.stderr ? (
                    <pre className="acn:m-0 acn:overflow-x-auto acn:whitespace-pre-wrap acn:text-rose-400">
                      {entry.stderr}
                    </pre>
                  ) : null}

                  {!entry.stdout && !entry.stderr ? (
                    <p className="acn:m-0 acn:italic acn:text-zinc-500">(no output)</p>
                  ) : null}

                  {entry.truncated ? (
                    <p className="acn:m-0 acn:text-amber-400">
                      [Output truncated at 256 KB]
                    </p>
                  ) : null}
                </div>
              )
            })
          )}
          <div ref={outputEndRef} />
        </div>
      </div>
    </div>
  )
}
