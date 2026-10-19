import type { Access, FieldAccess, Payload } from 'payload'

/**
 * User roles (ADR 0008).
 * - admin: manages users and admin-only screens (component gallery), plus everything an editor can do.
 * - editor: manages content. Users without any role are treated as editors.
 */
export const ROLES = ['admin', 'editor'] as const
export type Role = (typeof ROLES)[number]

type MaybeUser = { roles?: (Role | string)[] | null } | null | undefined

export const hasRole = (user: unknown, role: Role): boolean => {
  const roles = (user as MaybeUser)?.roles
  return Array.isArray(roles) && roles.includes(role)
}

export const isAdmin = (user: unknown): boolean => hasRole(user, 'admin')

/** Collection access: admins only. */
export const adminsOnly: Access = ({ req }) => isAdmin(req.user)

/** Collection access: admins see everyone; other users only their own document. */
export const adminsOrSelf: Access = ({ req }) => {
  if (!req.user) return false
  if (isAdmin(req.user)) return true
  return { id: { equals: req.user.id } }
}

/** Field access: only admins can set or change the field (prevents self-promotion). */
/**
 * Delete access for collections with Trash: every signed-in user can move documents to the trash
 * (Payload sends `data.deletedAt`), only admins delete permanently (including "Empty trash").
 */
export const trashOrAdmin: Access = ({ req, data }) =>
  isAdmin(req.user) ||
  (Boolean(req.user) && Boolean((data as { deletedAt?: unknown } | undefined)?.deletedAt))

export const adminsOnlyField: FieldAccess = ({ req }) => isAdmin(req.user)

/**
 * Guarantees that at least one admin exists, so adding roles to an existing database never locks
 * everybody out of user management: if no user has the admin role, the oldest user is promoted.
 * Runs from `onInit`; costs one count query when an admin exists.
 */
export async function ensureAdminExists(payload: Payload): Promise<void> {
  try {
    const { totalDocs: admins } = await payload.count({
      collection: 'users',
      overrideAccess: true,
      where: { roles: { in: ['admin'] } },
    })
    if (admins > 0) return

    const { docs } = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      sort: 'createdAt',
    })
    const oldest = docs[0]
    if (!oldest) return

    await payload.update({
      collection: 'users',
      id: oldest.id,
      data: { roles: Array.from(new Set([...(oldest.roles ?? []), 'admin' as const])) },
      overrideAccess: true,
    })
    payload.logger.warn(`[roles] No admin found: promoted ${oldest.email} (oldest user) to admin.`)
  } catch (error) {
    payload.logger.error(
      `[roles] Could not verify that an admin exists: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
