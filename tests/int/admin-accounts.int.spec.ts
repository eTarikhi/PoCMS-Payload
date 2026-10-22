import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { describeAccounts, ensureAdminAccount, checkPassword } from '@/lib/admin-accounts'
import config from '@/payload.config'

/**
 * The command-line path to the admin (`pnpm admin:create`, `pnpm admin:status`).
 *
 * It exists for the states a fresh database gets stuck in: no account at all, a forgotten
 * password, or an account without a role (the admin refuses those). These tests run against the
 * real database, because the point is that the Local API and the hooks agree.
 */
const stamp = Date.now()
const email = (name: string) => `${name}-${stamp}@example.test`
const password = 'int-test-password'

describe('admin accounts from the command line', () => {
  let payload: Payload
  const created: string[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
    if (created.length > 0) {
      await payload.delete({
        collection: 'users',
        where: { email: { in: created } },
        overrideAccess: true,
      })
    }
  })

  it('creates an account with the Administrator role', async () => {
    const address = email('cli-new')
    created.push(address)

    const result = await ensureAdminAccount(payload, { email: address, password, name: 'CLI' })

    expect(result).toMatchObject({ email: address, created: true, roleAdded: true })

    // The role is what lets the account open the admin (access.admin reads it).
    const { user } = await payload.login({ collection: 'users', data: { email: address, password } })
    // `permissions` is a virtual JSON field, so the generated type is unknown.
    const permissions = user?.permissions as { fullAccess?: boolean } | null | undefined
    expect(permissions?.fullAccess).toBe(true)
  })

  it('treats an existing email as a password reset, not a duplicate', async () => {
    const address = email('cli-existing')
    created.push(address)
    await ensureAdminAccount(payload, { email: address, password })

    const result = await ensureAdminAccount(payload, { email: `  ${address.toUpperCase()} `, password: 'changed-password' })
    expect(result).toMatchObject({ email: address, created: false, roleAdded: false })

    // Payload normalises the address; the new password must be the one that works.
    await expect(
      payload.login({ collection: 'users', data: { email: address, password: 'changed-password' } }),
    ).resolves.toMatchObject({ user: { email: address } })

    const { totalDocs } = await payload.count({
      collection: 'users',
      where: { email: { equals: address } },
    })
    expect(totalDocs).toBe(1)
  })

  it('repairs an account that exists without a role', async () => {
    const address = email('cli-roleless')
    created.push(address)
    const user = await payload.create({
      collection: 'users',
      data: { email: address, password },
      overrideAccess: true,
    })

    // What a half-finished migration or a hand-edited database leaves behind.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { roles: [] },
      overrideAccess: true,
    })

    const before = await describeAccounts(payload)
    expect(before.roleless).toContain(address)

    const result = await ensureAdminAccount(payload, { email: address, password: 'repaired-password' })
    expect(result).toMatchObject({ created: false, roleAdded: true })

    const after = await describeAccounts(payload)
    expect(after.roleless).not.toContain(address)
    expect(after.users.find((entry) => entry.email === address)?.roles).toContain('Administrator')
  })

  it('refuses a password that is too short', () => {
    expect(checkPassword('short')).toContain('at least 8')
    expect(checkPassword(password)).toBeNull()
  })
})
