// @vitest-environment node
/**
 * Neon-backed integration spec for Payload request handling.
 *
 * Runs only via `pnpm test:int:neon`, against the explicitly approved disposable Neon branch. It
 * uses the real installed `@payloadcms/db-vercel-postgres` adapter and a real Vercel/Neon pool; no
 * database connection is mocked.
 *
 * The setup has independently verified the Neon branch and endpoints before this file is imported,
 * then enabled schema push in-process. This spec revalidates those checks immediately before
 * Payload initialization, forbids database drop/create behavior, and disables read replicas.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Payload } from 'payload'

import {
  assertDestructiveOptIn,
  assertProcessPointsAtTestDatabase,
  type VerifiedNeonTestTarget,
  verifyNeonTestTargetMetadata,
} from './neonTestHarness'

declare global {
  var __NEON_TEST_TARGET__: VerifiedNeonTestTarget | undefined
}

let target: VerifiedNeonTestTarget
let payload: Payload | null = null
let formId: number | string

beforeAll(async () => {
  target = globalThis.__NEON_TEST_TARGET__ as VerifiedNeonTestTarget
  if (!target) {
    throw new Error('The Neon setup did not publish an independently verified target.')
  }

  if (process.env.NODE_ENV !== 'test' || process.env.PAYLOAD_DB_PUSH !== 'true') {
    throw new Error('The validated Neon setup did not enable test-only schema push.')
  }
  if (process.env.PAYLOAD_DROP_DATABASE === 'true') {
    throw new Error('PAYLOAD_DROP_DATABASE=true is prohibited by the Neon integration suite.')
  }

  const approvalEnvironment = {
    ...process.env,
    // The original application URL is retained only in memory to re-check endpoint separation.
    POSTGRES_URL: target.applicationConnectionString,
    PAYLOAD_DB_PUSH: undefined,
  }
  assertDestructiveOptIn(approvalEnvironment, target)
  await verifyNeonTestTargetMetadata(target, process.env)
  assertProcessPointsAtTestDatabase(target)

  const { getPayload } = await import('payload')
  const { default: configPromise } = await import('@/payload.config')
  const config = await configPromise

  const db = config.db as unknown as {
    disableCreateDatabase?: boolean
    packageName?: string
    poolOptions?: { connectionString?: string }
    push?: boolean
    readReplicaOptions?: unknown[]
  }

  // Refuse to initialize if Payload's actual config does not point at the metadata-verified URL,
  // uses another adapter, enables replicas, or has not enabled push under NODE_ENV=test.
  if (
    db.packageName !== '@payloadcms/db-vercel-postgres' ||
    db.poolOptions?.connectionString !== target.connectionString ||
    db.push !== true ||
    (Array.isArray(db.readReplicaOptions) && db.readReplicaOptions.length > 0)
  ) {
    throw new Error(
      'Resolved Payload database configuration does not match the verified Neon test target.',
    )
  }

  // Payload 3.90.2 otherwise attempts CREATE DATABASE after a missing-database connection error.
  // The approved database must already exist; this suite never creates or drops a database.
  db.disableCreateDatabase = true
  if (db.disableCreateDatabase !== true) {
    throw new Error(
      'Could not disable automatic database creation. Refusing to initialize Payload.',
    )
  }

  payload = await getPayload({ config })

  // Seed one synthetic form on this disposable branch so the public REST submission path is tested
  // even when the Neon branch has an empty Payload schema/data set. Email dispatch is blocked by
  // PLAYWRIGHT_TEST and the x-playwright-e2e request header below.
  const { formsData } = await import('@/seed/forms')
  const formData = formsData()[0]
  if (!formData) throw new Error('The form seed did not provide the synthetic integration form.')

  const formSlug = `neon-integration-${randomUUID()}`
  const form = await payload.create({
    collection: 'forms',
    context: { skipRevalidate: true },
    data: {
      ...formData,
      title: 'Neon Integration Test Form',
      slug: formSlug,
    },
    overrideAccess: true,
  })
  formId = form.id
}, 180_000)

afterAll(async () => {
  if (payload?.db?.destroy) {
    await payload.db.destroy().catch(() => undefined)
  }
  payload = null
  // No DROP DATABASE, CREATE DATABASE, truncate, or cleanup delete. The operator discards the
  // approved disposable Neon branch when finished.
}, 60_000)

describe('Neon + Payload request handling', () => {
  it('boots the installed Vercel/Neon adapter and runs real SQL', async () => {
    expect(payload).not.toBeNull()
    expect(target.endpointId).toBeTruthy()

    const users = await payload!.find({ collection: 'users', limit: 1 })
    expect(users).toBeDefined()
    expect(Array.isArray(users.docs)).toBe(true)
  }, 120_000)

  it('denies a real anonymous GraphQL POST through the committed Admin gate', async () => {
    const { POST } = await import('@/app/(payload)/api/graphql/route')

    const response = await POST(
      new Request('http://localhost/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ Users { docs { id } } }' }),
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'Authentication required.' })
  }, 120_000)

  it('allows an anonymous REST form submission, persists it, and keeps reads private', async () => {
    const { GET, POST } = await import('@/app/(payload)/api/[...slug]/route')
    const submissionData = [
      { field: 'name', value: 'Neon Integration Visitor' },
      { field: 'email', value: 'neon-integration@example.invalid' },
      { field: 'subject', value: 'Integration validation' },
      { field: 'message', value: 'Synthetic submission for the disposable Neon branch.' },
    ]

    const createResponse = await POST(
      new Request('http://localhost/api/form-submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-playwright-e2e': '1',
        },
        body: JSON.stringify({ form: formId, submissionData }),
      }),
      { params: Promise.resolve({ slug: ['form-submissions'] }) },
    )

    expect(createResponse.status).toBe(201)
    const createBody = (await createResponse.json()) as {
      doc?: { id?: number | string }
    }
    const submissionId = createBody.doc?.id
    expect(submissionId).toBeDefined()

    const persisted = await payload!.findByID({
      collection: 'form-submissions',
      depth: 0,
      id: submissionId as number | string,
      overrideAccess: true,
    })
    expect(persisted.submittedBySummary).toContain('Neon Integration Visitor')
    expect(persisted.submissionData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', value: 'Neon Integration Visitor' }),
        expect.objectContaining({ field: 'email', value: 'neon-integration@example.invalid' }),
      ]),
    )

    const readResponse = await GET(
      new Request(`http://localhost/api/form-submissions/${String(submissionId)}`, {
        method: 'GET',
      }),
      {
        params: Promise.resolve({
          slug: ['form-submissions', String(submissionId)],
        }),
      },
    )
    expect(readResponse.status).toBe(403)
  }, 120_000)
})
