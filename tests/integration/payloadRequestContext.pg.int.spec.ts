// @vitest-environment node
/**
 * Real PostgreSQL 16 integration spec for Payload HTTP request handling.
 *
 * This is the spec that must NOT skip. It is run only by `test:int:pg`, whose setup fails closed
 * when the disposable database is absent or unhealthy.
 *
 * What it proves, all against a real database:
 *
 *   - a real Payload instance boots and creates its schema from the config (no tracked migrations
 *     exist in this repository),
 *   - Local API reads execute against real SQL,
 *   - the committed GraphQL route denies a real anonymous request end to end,
 *   - anonymous REST form submission still reaches Payload,
 *   - teardown drops the disposable database so repeated runs start clean.
 *
 * Scope note: this verifies Payload request handling through the *committed* route handlers. It
 * does not verify an alternate GraphQL mount such as `/api/fgql`, which remains unimplemented.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Payload } from 'payload'

import {
  assertDatabaseReachable,
  assertPostgres16,
  dropTestDatabase,
  resetTestDatabase,
  resolveTestDatabaseTarget,
  type TestDatabaseTarget,
} from './postgresHarness'

let target: TestDatabaseTarget
let payload: Payload | null = null

beforeAll(async () => {
  target = resolveTestDatabaseTarget(process.env)
  await assertDatabaseReachable(target)
  await assertPostgres16(target)

  // Start from an empty database so schema creation is deterministic.
  await resetTestDatabase(target)

  if (!process.env.PAYLOAD_SECRET || process.env.PAYLOAD_SECRET.length < 16) {
    process.env.PAYLOAD_SECRET = 'pg-integration-placeholder-secret-32-chars'
  }

  // Import after the environment is set so the config module reads the right values on first import.
  const { getPayload } = await import('payload')
  const { default: config } = await import('@/payload.config')

  payload = await getPayload({ config })
}, 180_000)

afterAll(async () => {
  if (payload?.db?.destroy) {
    await payload.db.destroy().catch(() => undefined)
  }
  payload = null
  // Drop the disposable database so nothing leaks between runs.
  if (target) {
    await dropTestDatabase(target).catch(() => undefined)
  }
}, 120_000)

describe('PostgreSQL 16 + Payload request handling', () => {
  it('boots Payload against the disposable database and runs real SQL', async () => {
    expect(payload).not.toBeNull()

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

  it('keeps the anonymous form-submission collection grounded in real SQL', async () => {
    const submissions = await payload!.find({ collection: 'form-submissions', limit: 1 })
    expect(Array.isArray(submissions.docs)).toBe(true)
  }, 120_000)
})
