import type { Endpoint } from 'payload'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { hasCapability } from '@/access/permissions'

const execFileAsync = promisify(execFile)
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
let running = false

/** Lowercase letters, digits and underscores, at most 60 characters. */
export const migrationName = (raw: string | null) =>
  (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)

/**
 * POST /api/dev-migrate?name=… (admins, development only): `payload migrate:create <name>` with
 * `--skip-empty` (no file when the schema has no changes) and `--force-accept-warning` (the dev
 * database uses push). Writes `src/migrations/<timestamp>_<name>.ts`; deployments then run
 * `payload migrate`. One run at a time; `?dryRun=1` only reports availability.
 */
export const devMigrateEndpoint: Endpoint = {
  path: '/dev-migrate',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'useDeveloperTools'))
      return Response.json({ error: 'Needs the Developer tools permission.' }, { status: 403 })
    if (process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'Only available in development.' }, { status: 404 })
    }
    const name = migrationName(req.searchParams.get('name'))
    if (!name)
      return Response.json(
        { error: 'Give the migration a name (letters, digits, _).' },
        { status: 400 },
      )
    if (req.searchParams.get('dryRun')) return Response.json({ available: true, name })
    if (running)
      return Response.json({ error: 'A migration is already being created.' }, { status: 409 })

    running = true
    const started = Date.now()
    const bin = path.join(process.cwd(), 'node_modules', '.bin')
    try {
      const { stdout, stderr } = await execFileAsync(
        path.join(bin, 'payload'),
        ['migrate:create', name, '--skip-empty', '--force-accept-warning'],
        {
          cwd: process.cwd(),
          timeout: 180_000,
          maxBuffer: 16 * 1024 * 1024,
          shell: true,
          env: {
            ...process.env,
            PATH: [bin, process.env.PATH].filter(Boolean).join(path.delimiter),
            // Same production-shaped schema as scripts/generate.mjs (Blob storage fields).
            BLOB_READ_WRITE_TOKEN:
              process.env.BLOB_READ_WRITE_TOKEN || 'vercel_blob_rw_codegen0_placeholder0',
            PAYLOAD_CONFIG_PATH: process.env.PAYLOAD_CONFIG_PATH || 'src/payload.config.ts',
          },
        },
      )
      const output = stripAnsi(`${stdout}${stderr}`)
      const file = /Migration created at (.+\.ts)/.exec(output)?.[1]
      req.payload.logger.info({
        msg: `Migration ${file ? 'created' : 'skipped'}: ${name}`,
        user: req.user?.email,
      })
      return Response.json({
        ok: true,
        created: file ? path.relative(process.cwd(), file) : null,
        durationMs: Date.now() - started,
        output: output.trim().split('\n').slice(-20).join('\n'),
      })
    } catch (error) {
      const failure = error as { message: string; stdout?: string; stderr?: string }
      return Response.json(
        {
          ok: false,
          error: stripAnsi(failure.message).split('\n')[0],
          output: stripAnsi(`${failure.stdout ?? ''}${failure.stderr ?? ''}`)
            .trim()
            .split('\n')
            .slice(-20)
            .join('\n'),
        },
        { status: 500 },
      )
    } finally {
      running = false
    }
  },
}
