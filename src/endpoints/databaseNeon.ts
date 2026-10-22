import type { Endpoint, PayloadRequest } from 'payload'

import { hasCapability } from '@/access/permissions'
import { recordAudit } from '@/audit/record'
import { NeonClient, NeonError } from '@/database/neon'

/**
 * The Neon control-plane actions. Neither branch creation nor a point-in-time restore can be
 * expressed in SQL — they change the project's storage, not a table — so they go through the Neon
 * API with `NEON_API_KEY`. Without a key the page says so and links to the console; these endpoints
 * answer 501 rather than pretending the action is unavailable for another reason.
 *
 *   POST /api/database/neon/backup    `{ name, withEndpoint? }` → a branch pinned to now.
 *   POST /api/database/neon/restore   `{ timestamp, confirmation, preserveUnderName? }`
 *   POST /api/database/neon/delete    `{ branchId, confirmation }`
 */

const json = (data: unknown, status = 200) => Response.json(data, { status })

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const data = await req.json?.()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const readable = (error: unknown): { error: string; hint?: string } => {
  if (error instanceof NeonError) {
    return {
      error: error.message,
      hint:
        error.status === 401
          ? 'The API key in NEON_API_KEY was rejected. Create a new key in the Neon console and update the environment variable.'
          : undefined,
    }
  }
  const message = error instanceof Error ? error.message : 'The Neon request failed.'
  return { error: message.split('\n')[0]?.slice(0, 400) || 'The Neon request failed.' }
}

const unavailable = () =>
  json(
    {
      error: 'NEON_API_KEY is not set, so branch operations are unavailable.',
      hint: 'Create a key in the Neon console (Account settings → API keys), add NEON_API_KEY to the environment, and optionally NEON_PROJECT_ID.',
    },
    501,
  )

/** A branch name Neon will accept: it allows any name, but keep the list readable. */
const branchName = (raw: unknown): string =>
  String(raw ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 60)

const audit = async (req: PayloadRequest, summary: string, to?: unknown) => {
  await recordAudit(
    req.payload,
    {
      action: 'update',
      summary,
      entity: 'database',
      entityLabel: 'Database',
      entityKind: 'global',
      changes: to === undefined ? undefined : [{ field: 'neon', to }],
    },
    req,
  )
}

export const neonBackupEndpoint: Endpoint = {
  path: '/database/neon/backup',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageDatabase'))
      return json({ error: 'Needs the Database tools permission.' }, 403)
    if (!process.env.NEON_API_KEY) return unavailable()

    const data = await body(req)
    const name =
      branchName(data.name) ||
      `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`

    try {
      const client = new NeonClient()
      const branch = await client.createBackupBranch({
        name,
        withEndpoint: data.withEndpoint === true,
      })
      req.payload.logger.info({ msg: `Neon backup branch created: ${name}`, user: req.user?.email })
      await audit(req, `Created Neon backup branch ${branch.name}`, branch)
      return json({ ok: true, branch })
    } catch (error) {
      req.payload.logger.error({ msg: 'Neon branch creation failed', err: error })
      return json(readable(error), 502)
    }
  },
}

export const neonRestoreEndpoint: Endpoint = {
  path: '/database/neon/restore',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageDatabase'))
      return json({ error: 'Needs the Database tools permission.' }, 403)
    if (!process.env.NEON_API_KEY) return unavailable()

    const data = await body(req)
    const timestamp = typeof data.timestamp === 'string' ? data.timestamp.trim() : ''
    const confirmation =
      typeof data.confirmation === 'string' ? data.confirmation.trim().toLowerCase() : ''
    const preserveUnderName = branchName(data.preserveUnderName) || undefined

    const when = new Date(timestamp)
    if (!timestamp || Number.isNaN(when.getTime())) {
      return json({ error: 'Choose the point in time to restore to.' }, 400)
    }
    if (when.getTime() > Date.now()) {
      return json(
        { error: 'That time is in the future; Neon can only restore to a time it has stored.' },
        400,
      )
    }
    if (confirmation !== 'restore') {
      return json(
        { error: 'Type “restore” in the confirmation box to replace the current branch.' },
        400,
      )
    }

    try {
      const client = new NeonClient()
      const branch = await client.restoreTo({
        timestamp: when.toISOString(),
        preserveUnderName,
      })
      req.payload.logger.warn({
        msg: `Neon branch restored to ${when.toISOString()}`,
        user: req.user?.email,
        branch: branch.id,
        preserved: preserveUnderName,
      })
      await audit(
        req,
        `Restored the Neon branch to ${when.toISOString()}${preserveUnderName ? ` (current state kept as ${preserveUnderName})` : ''}`,
        { branch: branch.id, preserveUnderName: preserveUnderName ?? null },
      )
      return json({ ok: true, branch, restoredTo: when.toISOString() })
    } catch (error) {
      req.payload.logger.error({ msg: 'Neon restore failed', err: error })
      return json(readable(error), 502)
    }
  },
}

export const neonDeleteEndpoint: Endpoint = {
  path: '/database/neon/delete',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageDatabase'))
      return json({ error: 'Needs the Database tools permission.' }, 403)
    if (!process.env.NEON_API_KEY) return unavailable()

    const data = await body(req)
    const branchId = typeof data.branchId === 'string' ? data.branchId.trim() : ''
    const confirmation = typeof data.confirmation === 'string' ? data.confirmation.trim() : ''
    if (!/^[a-z0-9-]{1,60}$/.test(branchId)) return json({ error: 'Not a branch id.' }, 400)
    if (confirmation !== branchId) {
      return json({ error: 'Type the branch id to confirm deleting it.' }, 400)
    }

    try {
      const client = new NeonClient()
      const branches = await client.branches()
      const branch = branches.find((candidate) => candidate.id === branchId)
      if (!branch) return json({ error: 'That branch is not in this project.' }, 404)
      if (branch.default) return json({ error: 'The default branch cannot be deleted.' }, 400)
      if (branch.protected) return json({ error: 'That branch is protected in Neon.' }, 400)

      await client.deleteBranch(branchId)
      req.payload.logger.warn({ msg: `Neon branch deleted: ${branchId}`, user: req.user?.email })
      await audit(req, `Deleted Neon branch ${branch.name} (${branchId})`, { branch: branchId })
      return json({ ok: true, deleted: branchId })
    } catch (error) {
      req.payload.logger.error({ msg: 'Neon branch deletion failed', err: error })
      return json(readable(error), 502)
    }
  },
}
