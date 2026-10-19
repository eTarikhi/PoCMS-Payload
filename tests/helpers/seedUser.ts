import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export const testUser = {
  email: 'dev@payloadcms.com',
  password: 'test',
}

/**
 * The e2e suites exercise admin-only screens (Users, Roles, component gallery), so the test user
 * gets the built-in Administrator role (created by `ensureRoles` on init, ADR 0011).
 */
async function administratorRoleIds(payload: Awaited<ReturnType<typeof getPayload>>) {
  const { docs } = await payload.find({
    collection: 'roles',
    where: { system: { equals: true } },
    depth: 0,
    limit: 1,
  })
  return docs.map((doc) => doc.id)
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  // Create fresh test user
  await payload.create({
    collection: 'users',
    data: { ...testUser, roles: await administratorRoleIds(payload) },
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })
}
