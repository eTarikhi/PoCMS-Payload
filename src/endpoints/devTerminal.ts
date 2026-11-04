import { spawn } from 'node:child_process'
import path from 'node:path'
import type { Endpoint } from 'payload'

import { hasCapability } from '@/access/permissions'

const MAX_COMMAND_LENGTH = 2_000
const MAX_OUTPUT_BYTES = 256 * 1024
const COMMAND_TIMEOUT_MS = 60_000

const BLOCKED_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\s+(\/|~\/?|\.git\b)/,
    reason: 'Refusing destructive rm targeting /, home, or .git.',
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
    reason: 'Fork bombs are blocked.',
  },
  {
    pattern: /\b(shutdown|reboot|poweroff|mkfs)\b/,
    reason: 'System power/filesystem commands are blocked.',
  },
]

const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

/** Strictly false whenever `NODE_ENV === 'production'`. */
export const isTerminalAvailableInEnv = (
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean => nodeEnv !== 'production'

export function validateTerminalCommand(
  raw: unknown,
): { ok: true; command: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Command must be a non-empty string.' }
  }
  const command = raw.trim()
  if (!command) {
    return { ok: false, error: 'Enter a command to run.' }
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    return {
      ok: false,
      error: `Command exceeds maximum length (${MAX_COMMAND_LENGTH} chars).`,
    }
  }
  for (const rule of BLOCKED_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { ok: false, error: rule.reason }
    }
  }
  return { ok: true, command }
}

export type TerminalRunResult = {
  command: string
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
  durationMs: number
  stdout: string
  stderr: string
  cwd: string
}

function executeShellCommand(command: string, cwd: string): Promise<TerminalRunResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    const bin = path.join(cwd, 'node_modules', '.bin')
    const nodeDir = path.dirname(process.execPath)
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    }
    const pathKey = Object.keys(childEnv).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
    childEnv[pathKey] = [bin, nodeDir, childEnv[pathKey]].filter(Boolean).join(path.delimiter)

    // `shell: true` delegates to `/bin/sh -c` on POSIX and `cmd.exe /d /s /c "..."` WITH
    // `windowsVerbatimArguments: true` on Windows so quoted arguments (e.g. `node -e "..."`)
    // are not corrupted by libuv backslash escaping.
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    })

    let stdoutBuf = ''
    let stderrBuf = ''
    let totalBytes = 0
    let truncated = false
    let timedOut = false

    const appendChunk = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      if (truncated) return
      const remaining = MAX_OUTPUT_BYTES - totalBytes
      if (remaining <= 0) {
        truncated = true
        return
      }
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
      if (chunk.length > remaining) truncated = true
      totalBytes += slice.length
      const text = slice.toString('utf8')
      if (stream === 'stdout') stdoutBuf += text
      else stderrBuf += text
    }

    child.stdout?.on('data', (chunk: Buffer) => appendChunk(chunk, 'stdout'))
    child.stderr?.on('data', (chunk: Buffer) => appendChunk(chunk, 'stderr'))

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1500).unref()
    }, COMMAND_TIMEOUT_MS)

    const finish = (exitCode: number | null) => {
      clearTimeout(timer)
      resolve({
        command,
        exitCode,
        timedOut,
        truncated,
        durationMs: Date.now() - started,
        stdout: stripAnsi(stdoutBuf),
        stderr: stripAnsi(stderrBuf),
        cwd,
      })
    }

    child.on('error', (err) => {
      stderrBuf += `\n${err.message}`
      finish(1)
    })

    child.on('close', (code) => finish(code))
  })
}

let activeExecution = false

/**
 * POST /api/dev-terminal (requires `useTerminal`, strictly disabled in production):
 * Runs non-interactive shell commands inside the workspace root during local development.
 */
export const devTerminalEndpoint: Endpoint = {
  path: '/dev-terminal',
  method: 'post',
  handler: async (req) => {
    // Hard production lockout checked first — never available in production even to admins.
    if (!isTerminalAvailableInEnv()) {
      return Response.json(
        { error: 'Terminal is strictly disabled in production.' },
        { status: 404 },
      )
    }

    if (!hasCapability(req.user, 'useTerminal')) {
      return Response.json(
        { error: 'Needs the Terminal permission.' },
        { status: 403 },
      )
    }

    const cwd = process.cwd()
    if (req.searchParams.get('dryRun')) {
      return Response.json({ available: true, cwd })
    }

    if (activeExecution) {
      return Response.json(
        { error: 'Another terminal command is currently running.' },
        { status: 409 },
      )
    }

    const body = (await req.json?.().catch(() => ({}))) as { command?: unknown }
    const validated = validateTerminalCommand(body?.command)
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400 })
    }

    activeExecution = true
    try {
      const result = await executeShellCommand(validated.command, cwd)
      req.payload.logger.info({
        msg: 'Dev terminal command executed',
        command: validated.command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        user: req.user?.email,
      })
      return Response.json({ ok: true, ...result })
    } finally {
      activeExecution = false
    }
  },
}
