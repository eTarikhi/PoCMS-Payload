import type { Endpoint } from 'payload'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { hasCapability } from '@/access/permissions'

const execFileAsync = promisify(execFile)

/** Generator targets: each is one or more `node <script> ...args` runs, as in package.json. */
export const GENERATE_TARGETS = {
  types: [['scripts/generate.mjs', 'types']],
  importmap: [['scripts/generate.mjs', 'importmap']],
  'db-schema': [['scripts/generate.mjs', 'db-schema']],
  graphql: [['scripts/generate.mjs', 'graphql']],
  'nav-icons': [['scripts/generate-nav-icons.mjs']],
  all: [
    ['scripts/generate.mjs', 'types', 'importmap', 'db-schema', 'graphql'],
    ['scripts/generate-nav-icons.mjs'],
  ],
} as const satisfies Record<string, readonly (readonly string[])[]>

export type GenerateTarget = keyof typeof GENERATE_TARGETS

let running: GenerateTarget | null = null

const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
const tail = (text: string, lines = 40) =>
  stripAnsi(text).trim().split('\n').slice(-lines).join('\n')

/**
 * POST /api/dev-generate?target=<types|importmap|db-schema|graphql|nav-icons|all> (admins,
 * development only): runs the project's code generators (`scripts/generate.mjs`,
 * `scripts/generate-nav-icons.mjs`) in the project folder and returns the output's last lines.
 * Only the listed targets can run, one at a time. `?dryRun=1` only reports availability.
 */
export const devGenerateEndpoint: Endpoint = {
  path: '/dev-generate',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'useDeveloperTools'))
      return Response.json({ error: 'Needs the Developer tools permission.' }, { status: 403 })
    if (process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'Only available in development.' }, { status: 404 })
    }
    const target = req.searchParams.get('target') as GenerateTarget | null
    if (!target || !(target in GENERATE_TARGETS)) {
      return Response.json(
        { error: `Unknown target. Use one of: ${Object.keys(GENERATE_TARGETS).join(', ')}.` },
        { status: 400 },
      )
    }
    if (req.searchParams.get('dryRun')) return Response.json({ available: true, target })
    if (running) return Response.json({ error: `Already running: ${running}.` }, { status: 409 })

    running = target
    const started = Date.now()
    // The scripts call the `payload` and `payload-graphql` binaries.
    const env = {
      ...process.env,
      PATH: [path.join(process.cwd(), 'node_modules', '.bin'), process.env.PATH]
        .filter(Boolean)
        .join(path.delimiter),
    }
    let output = ''
    try {
      for (const args of GENERATE_TARGETS[target]) {
        const { stdout, stderr } = await execFileAsync(process.execPath, [...args], {
          cwd: process.cwd(),
          env,
          timeout: 180_000,
          maxBuffer: 16 * 1024 * 1024,
        })
        output += `$ node ${args.join(' ')}\n${stdout}${stderr}\n`
      }
      const durationMs = Date.now() - started
      req.payload.logger.info({ msg: `Generated ${target}`, durationMs, user: req.user?.email })
      return Response.json({ ok: true, target, durationMs, output: tail(output) })
    } catch (error) {
      const failure = error as { message: string; stdout?: string; stderr?: string }
      output += `${failure.stdout ?? ''}${failure.stderr ?? ''}`
      req.payload.logger.error({ msg: `Generating ${target} failed`, err: failure.message })
      return Response.json(
        {
          ok: false,
          target,
          durationMs: Date.now() - started,
          error: stripAnsi(failure.message).split('\n')[0],
          output: tail(output),
        },
        { status: 500 },
      )
    } finally {
      running = null
    }
  },
}
