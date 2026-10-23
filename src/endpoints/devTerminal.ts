import { spawn } from 'node:child_process'

import type { Endpoint, PayloadRequest } from 'payload'

import { hasCapability } from '@/access/permissions'
import {
  TERMINAL_SCRIPTS,
  commandFor,
  isTerminalEnabled,
  scriptBySlug,
} from '@/terminal/scripts'

/**
 * `POST /api/dev/terminal` (CR-12 E7) — streams the output of one allow-listed package script.
 *
 * Security review: docs/ui-modernization/terminal-security.md. In short: the endpoint answers 404
 * in production, requires the useTerminal capability, accepts only a slug from the compiled
 * allow-list (never a command or argument), spawns in the repository root, and kills the process on
 * timeout or when the browser disconnects.
 *
 * Each entry decides whether it is spawned through a shell (`shell` in `src/terminal/scripts.ts`),
 * because the scripts themselves are shell-shaped: their package.json entries run `cross-env`, which
 * is not a binary the operating system can exec on its own. That is the same way the migration
 * generator runs (`src/endpoints/devMigrate.ts`). It is safe for the same reason the rest of the
 * endpoint is: the command and every argument are literals compiled from the allow-list, so there is
 * nothing for a shell to interpret — the browser sends a slug and never reaches this array.
 */

const NOT_FOUND = () => new Response('Not found', { status: 404 })
const encoder = new TextEncoder()

const json = (data: unknown, status: number) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

async function requestedSlug(req: PayloadRequest): Promise<string> {
  try {
    const data = (await req.json?.()) as { script?: unknown } | undefined
    return typeof data?.script === 'string' ? data.script : ''
  } catch {
    return ''
  }
}

/** Kill politely, then forcefully; clears itself when the process exits first. */
function killer(child: ReturnType<typeof spawn>) {
  const force = setTimeout(() => child.kill('SIGKILL'), 3_000)
  force.unref?.()
  child.kill('SIGTERM')
  const clear = () => clearTimeout(force)
  child.once('exit', clear)
  child.once('error', clear)
}

export const devTerminalEndpoint: Endpoint = {
  path: '/dev/terminal',
  method: 'post',
  handler: async (req) => {
    if (!isTerminalEnabled()) return NOT_FOUND()
    if (!hasCapability(req.user, 'useTerminal')) {
      return json({ error: 'Needs the Terminal permission.' }, 403)
    }
    if (req.headers.get('content-type')?.includes('application/json') === false) {
      return json({ error: 'Send JSON: { "script": "<slug>" }.' }, 415)
    }

    const slug = await requestedSlug(req)
    const script = scriptBySlug(slug)
    if (!script) {
      return json(
        {
          error: 'Unknown script.',
          scripts: TERMINAL_SCRIPTS.map(({ slug }) => slug),
        },
        400,
      )
    }

    const { command, args, shell } = commandFor(script)
    const startedAt = Date.now()
    let closed = false
    const env = { ...process.env }
    // Some tools behave differently for CI (retries, reporters); the terminal is a local run.
    delete env.CI
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...env,
        // No colour escapes in a <pre>, and never a paginated output.
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        PAGER: 'cat',
        GIT_PAGER: 'cat',
      },
      shell,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (text: string) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(text))
          } catch {
            closed = true
          }
        }
        const finish = (message: string) => {
          if (closed) return
          write(message)
          closed = true
          try {
            controller.close()
          } catch {
            // Already closed by the client.
          }
        }

        write(`$ pnpm ${args.join(' ')}\n\n`)
        child.stdout?.on('data', (chunk) => write(String(chunk)))
        child.stderr?.on('data', (chunk) => write(String(chunk)))

        const timeout = setTimeout(() => {
          write(`\n[timeout after ${Math.round(script.timeoutMs / 1000)} s — stopping]\n`)
          killer(child)
        }, script.timeoutMs)
        timeout.unref?.()

        child.once('error', (error) => {
          clearTimeout(timeout)
          finish(`\n[could not start pnpm: ${error.message}]\n`)
        })
        child.once('exit', (code, signal) => {
          clearTimeout(timeout)
          const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
          finish(`\n[${signal ? `stopped by ${signal}` : `exit ${code ?? '?'}`} · ${seconds}s]\n`)
        })

        // The browser aborted the fetch (Stop, reload, navigation): stop the process.
        req.signal?.addEventListener('abort', () => killer(child))
      },
      cancel() {
        closed = true
        killer(child)
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  },
}
