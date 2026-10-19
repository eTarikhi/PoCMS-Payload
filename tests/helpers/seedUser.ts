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
  const roles = await administratorRoleIds(payload)

  // Update in place when the user exists: deleting it first could hit the last-administrator
  // guard on a fresh database, where the test user is the only administrator.
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: testUser.email } },
    depth: 0,
    limit: 1,
  })
  if (docs[0]) {
    await payload.update({
      collection: 'users',
      id: docs[0].id,
      data: { password: testUser.password, roles },
    })
    return
  }
  await payload.create({ collection: 'users', data: { ...testUser, roles } })
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
