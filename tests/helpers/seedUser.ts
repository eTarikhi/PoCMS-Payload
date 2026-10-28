export const testUser = {
  email: 'dev@payloadcms.com',
  password: 'test-e2e-password-2026',
  name: 'Playwright Admin',
}

async function resolveTestPayload() {
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('../../src/payload.config.js'),
  ])
  return getPayload({ config })
}

/**
 * Ensures an Administrator role (`fullAccess: true`) exists and upserts `testUser` with that role
 * so ADR 0011 RBAC (`Users.access.admin = hasAnyRole`) permits signing in to `/admin`.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await resolveTestPayload()

  const adminRoles = await payload.find({
    collection: 'roles',
    where: {
      fullAccess: {
        equals: true,
      },
    },
    limit: 1,
    overrideAccess: true,
  })

  const adminRole =
    adminRoles.docs[0] ??
    (await payload.create({
      collection: 'roles',
      data: {
        name: 'Administrator',
        description: 'Full access across every collection, global, and admin tool.',
        fullAccess: true,
      },
      overrideAccess: true,
      context: { skipAuditLog: true },
    }))

  const existingUsers = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
    limit: 1,
    overrideAccess: true,
  })

  if (existingUsers.docs[0]) {
    await payload.update({
      collection: 'users',
      id: existingUsers.docs[0].id,
      data: {
        name: testUser.name,
        password: testUser.password,
        roles: [adminRole.id],
      },
      overrideAccess: true,
      context: { skipAuditLog: true },
    })
    return
  }

  await payload.create({
    collection: 'users',
    data: {
      email: testUser.email,
      name: testUser.name,
      password: testUser.password,
      roles: [adminRole.id],
    },
    overrideAccess: true,
    context: { skipAuditLog: true },
  })
}

/**
 * Cleans up `testUser` after E2E runs when another administrator account exists, avoiding
 * `keepAnAdministratorOnDelete` errors on single-admin test databases.
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await resolveTestPayload()

  const allUsers = await payload.find({
    collection: 'users',
    pagination: false,
    depth: 1,
    overrideAccess: true,
  })

  const otherAdmins = allUsers.docs.filter((doc) => {
    if (doc.email === testUser.email) return false
    const roles = Array.isArray(doc.roles) ? doc.roles : []
    return roles.some(
      (role) => typeof role === 'object' && role !== null && 'fullAccess' in role && role.fullAccess,
    )
  })

  if (otherAdmins.length === 0) return

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
    overrideAccess: true,
    context: { skipAuditLog: true },
  })
}
