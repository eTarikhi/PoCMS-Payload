// @vitest-environment node
/**
 * Neon-backed integration spec for Payload request handling.
 *
 * Runs only via `pnpm test:int:neon`, against a **separate disposable Neon branch**, using the
 * real installed `@payloadcms/db-vercel-postgres` adapter. It must never run against the owner's
 * application database, and it fails closed rather than skipping.
 *
 * What it verifies, all against real Neon:
 *
 *   - Payload boots through the Vercel/Neon adapter against the disposable branch;
 *   - the schema can be created there (schema push is disabled under NODE_ENV=test unless
 *     `PAYLOAD_DB_PUSH=true`, so the suite requires that opt-in explicitly);
 *   - real SQL executes (a Local API read);
 *   - the committed GraphQL route still denies a real anonymous request;
 *   - the anonymous REST form-submission collection is readable through real SQL.
 *
 * Scope note: this does not verify an alternate GraphQL mount (`/api/fgql`), which remains
 * unimplemented, and it makes no claim about request-context preservation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Payload } from 'payload'

import { DISPOSABLE_DB_MARKER, type NeonTestTarget } from './neonTestHarness'

let target: NeonTestTarget
let payload: Payload | null = null

beforeAll(async () => {
  // Populated by neonFailClosedSetup.ts, which has already validated the target and re-pointed
  // POSTGRES_URL at the disposable branch.
  target = globalThis.__NEON_TEST_TARGET__ as NeonTestTarget
  expect(target).toBeDefined()

  // Schema push must be enabled deliberately; payload.config.ts sets `push: false` when
  // NODE_ENV === 'test' and this is not 'true'. Without it, an empty branch has no schema.
  if (process.env.PAYLOAD_DB_PUSH !== 'true') {
    throw new Error(
      [
        'PAYLOAD_DB_PUSH is not "true".',
        '',
        'Under NODE_ENV=test the adapter disables schema push, and this repository has no tracked',
        'migrations (src/migrations does not exist). On an empty disposable branch there would be',
        'no tables, so the suite refuses to run rather than reporting misleading failures.',
        '',
        'Re-run with PAYLOAD_DB_PUSH=true.',
      ].join('\n'),
    )
  }

  const { getPayload } = await import('payload')
  const { default: config } = await import('@/payload.config')

  payload = await getPayload({ config })
}, 180_000)

afterAll(async () => {
  if (payload?.db?.destroy) {
    await payload.db.destroy().catch(() => undefined)
  }
  payload = null
  // No drop, no truncate. The disposable branch is discarded by the operator, not by this suite.
}, 60_000)

describe('Neon + Payload request handling', () => {
  it('boots Payload through the Vercel/Neon adapter and runs real SQL', async () => {
    expect(payload).not.toBeNull()
    // Target is proven disposable by the setup guard; the assertion documents intent.
    expect(target.database).toContain(DISPOSABLE_DB_MARKER)

    const users = await payload!.find({ collection: 'users', limit: 1 })
    expect(users).toBeDefined()
    expect(Array.isArray(users.docs)).toBe(true)
  }, 120_000)

  it('denies a real anonymous GraphQL POST through the committed Admin gate', async () => {
    const { POST } = await import('@/app/(payload)/api/graphql/route')

    const response = await POST(
      new Request('http://127.0.0.1:3000/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ Users { docs { id } } }' }),
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'Authentication required.' })
  }, 120_000)

  it('reads the anonymous form-submission collection through real SQL', async () => {
    const submissions = await payload!.find({ collection: 'form-submissions', limit: 1 })
    expect(Array.isArray(submissions.docs)).toBe(true)
  }, 120_000)
})
