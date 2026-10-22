import type { Payload } from 'payload'

import { ensureAdministratorRole, idsOf } from '../access/roles'
import type { User } from '../payload-types'

/**
 * Creating and repairing admin accounts from the command line.
 *
 * The admin's own "create first user" screen covers the normal first run, but it cannot help when
 * the database is empty of users and something about the browser flow is wrong — no account to log
 * in with, a forgotten password, or an account that exists without a role and is therefore refused
 * by `access.admin`. Those are exactly the states a fresh database gets into, so they get a path
 * that does not depend on the UI.
 */

export type AdminAccountInput = {
  email: string
  password: string
  name?: string
}

export type AdminAccountResult = {
  id: number | string
  email: string
  /** True when the account was created, false when an existing one was updated. */
  created: boolean
  /** True when the account had no full-access role and one was added. */
  roleAdded: boolean
}

export type AccountSummary = {
  users: { email: string; id: number | string; roles: string[] }[]
  administrators: number
  /** Accounts with no role at all: they can sign in but the admin redirects them out. */
  roleless: string[]
}

export const normaliseEmail = (email: string): string => email.trim().toLowerCase()

/** Payload's minimum is 3; anything shorter is a mistake worth stopping for. */
export const MIN_PASSWORD_LENGTH = 8

export const checkPassword = (password: string): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  return null
}

const findUserByEmail = async (payload: Payload, email: string) => {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    depth: 1,
    limit: 1,
    overrideAccess: true,
  })
  return docs[0]
}

/** Role names of a user document whose `roles` were populated (depth 1). */
const roleNamesOf = (user: { roles?: unknown }): string[] =>
  idsOf(user.roles).length === 0
    ? []
    : ((user.roles as { name?: string }[]) ?? []).map((role) => role.name ?? '').filter(Boolean)

const hasFullAccess = (user: { roles?: unknown }): boolean =>
  ((user.roles as { fullAccess?: boolean | null }[] | undefined) ?? []).some(
    (role) => role?.fullAccess === true,
  )

/**
 * Create the account, or — when the email already exists — set its password and make sure it can
 * open the admin. Idempotent, so it doubles as "I cannot get in" recovery.
 */
export async function ensureAdminAccount(
  payload: Payload,
  input: AdminAccountInput,
): Promise<AdminAccountResult> {
  const email = normaliseEmail(input.email)
  const invalid = checkPassword(input.password)
  if (invalid) throw new Error(invalid)

  const existing = await findUserByEmail(payload, email)

  if (existing) {
    const roleAdded = !hasFullAccess(existing)
    const administrator = roleAdded ? await ensureAdministratorRole(payload) : undefined
    await payload.update({
      collection: 'users',
      id: existing.id,
      data: {
        password: input.password,
        ...(input.name ? { name: input.name } : {}),
        ...(administrator
          ? { roles: [...idsOf(existing.roles), administrator.id] as NonNullable<User['roles']> }
          : {}),
      },
      overrideAccess: true,
    })
    return { id: existing.id, email, created: false, roleAdded }
  }

  const administrator = await ensureAdministratorRole(payload)
  const created = await payload.create({
    collection: 'users',
    data: {
      email,
      password: input.password,
      ...(input.name ? { name: input.name } : {}),
      roles: [administrator.id] as NonNullable<User['roles']>,
    },
    overrideAccess: true,
  })
  return { id: created.id, email, created: true, roleAdded: true }
}

/** What `pnpm admin:status` prints: who exists, what they may do, who cannot get in. */
export async function describeAccounts(payload: Payload): Promise<AccountSummary> {
  const { docs } = await payload.find({
    collection: 'users',
    depth: 1,
    pagination: false,
    sort: 'createdAt',
    overrideAccess: true,
  })

  const users = docs.map((user) => ({
    id: user.id,
    email: String(user.email ?? ''),
    roles: roleNamesOf(user as { roles?: unknown }),
  }))

  return {
    users,
    administrators: docs.filter((user) => hasFullAccess(user as { roles?: unknown })).length,
    roleless: users.filter((user) => user.roles.length === 0).map((user) => user.email),
  }
}
