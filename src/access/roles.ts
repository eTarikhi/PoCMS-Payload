import type {
  Access,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  FieldAccess,
  FieldHook,
  Payload,
  PayloadRequest,
  Where,
} from 'payload'
import { APIError } from 'payload'

import type { User } from '../payload-types'

import {
  type Capability,
  type EffectivePermissions,
  type GovernedEntity,
  type RoleLike,
  can,
  governedEntities,
  hasCapability,
  isAdmin,
  levelFor,
  mergeRoles,
  NO_PERMISSIONS,
} from './permissions'

/**
 * Access functions and hooks for roles (ADR 0011), following Payload's access-control docs:
 * collection access returns a boolean or a query, field access a boolean, and every check reads
 * the signed-in user's effective permissions (`req.user.permissions`, see permissions.ts).
 */

type ID = number | string

/** Role IDs in the shape the generated `User` type expects (numeric IDs on Postgres). */
const asRoleIds = (ids: ID[]) => ids as NonNullable<User['roles']>

/* -------------------------------------------------------------------------------------------- */
/* Access functions                                                                              */
/* -------------------------------------------------------------------------------------------- */

/**
 * Collections that hold site content: anyone may read (the public site and its REST/GraphQL
 * reads), writes follow the user's access level. Moving to the trash is an edit: Payload passes
 * `data.deletedAt` to delete access when it trashes. Deleting permanently needs "full".
 */
export const contentAccess = (slug: string) => ({
  read: (() => true) satisfies Access,
  create: (({ req }) => can(req.user, slug, 'create')) satisfies Access,
  update: (({ req }) => can(req.user, slug, 'update')) satisfies Access,
  delete: (({ req, data }) => {
    const level = levelFor(req.user, slug)
    if (level === 'full') return true
    return level === 'edit' && Boolean((data as { deletedAt?: unknown } | undefined)?.deletedAt)
  }) satisfies Access,
})

/** Globals that hold site content: public read, updates need "edit". */
export const globalAccess = (slug: string) => ({
  read: (() => true) satisfies Access,
  update: (({ req }) => can(req.user, slug, 'update')) satisfies Access,
})

/**
 * `admin.hidden` for governed collections and globals: without read access the entry leaves the
 * sidebar and Payload's admin routing (the public API still reads, as the site needs).
 */
export const hiddenWithout =
  (slug: string) =>
  ({ user }: { user: unknown }): boolean =>
    !can(user, slug, 'read')

/** Administrators only (users, roles, and anything that could grant access). */
export const adminsOnly: Access = ({ req }) => isAdmin(req.user)

/** Administrators see everyone; other users only their own document. */
export const adminsOrSelf: Access = ({ req }) => {
  if (!req.user) return false
  if (isAdmin(req.user)) return true
  return { id: { equals: req.user.id } }
}

/** Field access: only administrators set or change the field (no self-promotion). */
export const adminsOnlyField: FieldAccess = ({ req }) => isAdmin(req.user)

/** Collection access for tool data guarded by a capability (audit log, reports, jobs). */
export const capabilityAccess =
  (capability: Capability): Access =>
  ({ req }) =>
    hasCapability(req.user, capability)

/* -------------------------------------------------------------------------------------------- */
/* Effective permissions                                                                         */
/* -------------------------------------------------------------------------------------------- */

const entitiesCache = new WeakMap<object, GovernedEntity[]>()

/** Governed collections and globals of the running config (cached per config). */
export function entitiesFor(payload: Payload): GovernedEntity[] {
  const cached = entitiesCache.get(payload.config)
  if (cached) return cached
  const entities = governedEntities(payload.config)
  entitiesCache.set(payload.config, entities)
  return entities
}

/** IDs from a relationship value at any depth (IDs, populated documents or a mix). */
export const idsOf = (value: unknown): ID[] =>
  Array.isArray(value)
    ? value
        .map((item) => (item && typeof item === 'object' ? (item as { id?: ID }).id : item))
        .filter((id): id is ID => typeof id === 'number' || typeof id === 'string')
    : []

/** The signed-in user's role IDs. */
export const roleIdsOf = (user: unknown): ID[] => idsOf((user as { roles?: unknown } | null)?.roles)

type RoleDoc = RoleLike & { id: ID; system?: boolean | null; isDefault?: boolean | null }

/** Role documents by ID, cached on `req.context` so one request loads each role once. */
async function loadRoles(req: PayloadRequest, ids: ID[]): Promise<RoleDoc[]> {
  const context = req.context as { rolesById?: Map<ID, RoleDoc> }
  const cache = (context.rolesById ??= new Map())
  const missing = ids.filter((id) => !cache.has(id))
  if (missing.length > 0) {
    const { docs } = await req.payload.find({
      collection: 'roles',
      where: { id: { in: missing } },
      depth: 0,
      joins: false,
      limit: missing.length,
      pagination: false,
      overrideAccess: true,
      req,
    })
    for (const doc of docs as RoleDoc[]) cache.set(doc.id, doc)
  }
  return ids.map((id) => cache.get(id)).filter((doc): doc is RoleDoc => Boolean(doc))
}

/** afterRead hook of the virtual `users.permissions` field. */
export const computePermissions: FieldHook = async ({ req, siblingData }) => {
  const ids = idsOf((siblingData as { roles?: unknown } | undefined)?.roles)
  if (ids.length === 0) return NO_PERMISSIONS
  const roles = await loadRoles(req, ids)
  return mergeRoles(roles, entitiesFor(req.payload)) satisfies EffectivePermissions
}

/* -------------------------------------------------------------------------------------------- */
/* Built-in roles and guards                                                                     */
/* -------------------------------------------------------------------------------------------- */

const ADMINISTRATOR = {
  name: 'Administrator',
  description:
    'Full access: every collection and global, every tool, and the people and roles of this admin. Built in: it cannot be deleted or lose full access.',
}

const editorRole = (entities: GovernedEntity[]) => ({
  name: 'Editor',
  description:
    'Manages the site content: edits every collection and global, moves documents to the trash and restores them. Sees the traffic and deployment widgets.',
  isDefault: true,
  levels: Object.fromEntries(entities.map((entity) => [entity.field, 'edit'])),
  capabilities: { viewAnalytics: true, viewDeployments: true },
})

/** The built-in Administrator role (`system: true`), created when missing. */
export async function ensureAdministratorRole(
  payload: Payload,
  req?: PayloadRequest,
): Promise<RoleDoc> {
  const find = (where: Where) =>
    payload.find({
      collection: 'roles',
      where,
      depth: 0,
      joins: false,
      limit: 1,
      overrideAccess: true,
      req,
    })
  const existing = (await find({ system: { equals: true } })).docs[0] as RoleDoc | undefined
  if (existing) return existing

  // A hand-made role called "Administrator" becomes the built-in one instead of clashing with it.
  const named = (await find({ name: { equals: ADMINISTRATOR.name } })).docs[0] as
    RoleDoc | undefined
  if (named) {
    return (await payload.update({
      collection: 'roles',
      id: named.id,
      data: { fullAccess: true, system: true },
      depth: 0,
      overrideAccess: true,
      context: { skipAuditLog: true },
      req,
    })) as RoleDoc
  }
  return (await payload.create({
    collection: 'roles',
    data: { ...ADMINISTRATOR, fullAccess: true, system: true },
    depth: 0,
    overrideAccess: true,
    context: { skipAuditLog: true },
    req,
  })) as RoleDoc
}

/** IDs of every role with full access (the built-in Administrator and any custom ones). */
async function fullAccessRoleIds(req: PayloadRequest, exceptRole?: ID): Promise<ID[]> {
  const { docs } = await req.payload.find({
    collection: 'roles',
    where: { fullAccess: { equals: true } },
    depth: 0,
    joins: false,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs.map((doc) => doc.id).filter((id) => String(id) !== String(exceptRole))
}

/** Whether a relationship value holds one of the given role IDs (IDs compared as strings). */
const holdsAnyOf = (value: unknown, roleIds: ID[]): boolean => {
  const wanted = new Set(roleIds.map(String))
  return idsOf(value).some((id) => wanted.has(String(id)))
}

/** Users who hold one of the given roles, optionally not counting one user. */
async function countUsersWithRoles(
  req: PayloadRequest,
  roleIds: ID[],
  exceptUser?: ID,
): Promise<number> {
  if (roleIds.length === 0) return 0
  const where: Where = exceptUser
    ? { and: [{ roles: { in: roleIds } }, { id: { not_equals: exceptUser } }] }
    : { roles: { in: roleIds } }
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    where,
    overrideAccess: true,
    req,
  })
  return totalDocs
}

const LAST_ADMIN =
  'This would leave the admin without an administrator. Give another user a full-access role first.'

/*
 * The last-administrator guards protect people from locking everybody out through the admin or the
 * API. Operations without a signed-in user (scripts, seeding, tests through the Local API) are
 * trusted: if they leave no administrator, `ensureRoles` promotes the oldest user on the next start.
 */

/**
 * Users `beforeChange`: the first account (from /admin/create-first-user) becomes an
 * Administrator; other new users without roles get the roles marked "Give to new users".
 */
export const assignRolesOnCreate: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true, req })
  if (totalDocs === 0) {
    const administrator = await ensureAdministratorRole(req.payload, req)
    return { ...data, roles: [administrator.id] }
  }
  if (idsOf(data.roles).length > 0) return data
  const { docs } = await req.payload.find({
    collection: 'roles',
    where: { isDefault: { equals: true } },
    depth: 0,
    joins: false,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return { ...data, roles: docs.map((doc) => doc.id) }
}

/** Users `beforeChange`: the last administrator can't lose full access. */
export const keepAnAdministrator: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || !originalDoc || !('roles' in data) || !req.user) return data
  const adminRoles = await fullAccessRoleIds(req)
  const wasAdmin = holdsAnyOf(originalDoc.roles, adminRoles)
  const staysAdmin = holdsAnyOf(data.roles, adminRoles)
  if (
    wasAdmin &&
    !staysAdmin &&
    (await countUsersWithRoles(req, adminRoles, originalDoc.id)) === 0
  ) {
    throw new APIError(LAST_ADMIN, 400, undefined, true)
  }
  return data
}

/** Users `beforeDelete`: the last administrator can't be deleted. */
export const keepAnAdministratorOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  if (!req.user) return
  const adminRoles = await fullAccessRoleIds(req)
  const user = await req.payload.findByID({
    collection: 'users',
    id,
    depth: 0,
    overrideAccess: true,
    req,
    select: { roles: true },
  })
  const isLastAdmin =
    holdsAnyOf(user?.roles, adminRoles) && (await countUsersWithRoles(req, adminRoles, id)) === 0
  if (isLastAdmin) throw new APIError(LAST_ADMIN, 400, undefined, true)
}

/**
 * Roles `beforeChange`: the built-in Administrator role keeps full access, nobody can mark a role
 * as built in, and a role can't drop full access when that would leave no administrator.
 */
export const protectRoles: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation === 'update' && originalDoc?.system) {
    return { ...data, fullAccess: true, system: true }
  }
  if (operation === 'update' && originalDoc?.fullAccess && data.fullAccess === false && req.user) {
    const remaining = await fullAccessRoleIds(req, originalDoc.id)
    if ((await countUsersWithRoles(req, remaining)) === 0) {
      throw new APIError(LAST_ADMIN, 400, undefined, true)
    }
  }
  return data
}

/** Roles `beforeDelete`: deleting a full-access role must leave an administrator. */
export const protectRolesOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const role = (await req.payload.findByID({
    collection: 'roles',
    id,
    depth: 0,
    joins: false,
    overrideAccess: true,
    req,
  })) as RoleDoc | null
  if (role?.system) throw new APIError('The built-in Administrator role cannot be deleted.', 400)
  if (!role?.fullAccess || !req.user) return
  const remaining = await fullAccessRoleIds(req, id)
  if ((await countUsersWithRoles(req, remaining)) === 0) {
    throw new APIError(LAST_ADMIN, 400, undefined, true)
  }
}

/**
 * Runs from `onInit`. Makes sure the built-in roles exist, moves users from the old `roles` select
 * (ADR 0008: admin/editor, kept as the hidden `legacyRoles` field) to role documents once, and
 * guarantees at least one administrator: if nobody has full access, the oldest user gets the
 * Administrator role. Costs a few small queries when everything is in place.
 */
export async function ensureRoles(payload: Payload): Promise<void> {
  try {
    const administrator = await ensureAdministratorRole(payload)

    // Fresh install: seed the Editor role next to Administrator.
    const { totalDocs: roleCount } = await payload.count({
      collection: 'roles',
      overrideAccess: true,
    })
    if (roleCount === 1) {
      await payload.create({
        collection: 'roles',
        data: editorRole(entitiesFor(payload)),
        depth: 0,
        overrideAccess: true,
        context: { skipAuditLog: true },
      })
      payload.logger.info('[roles] Created the Administrator and Editor roles.')
    }

    // One-time move from the old select. legacyRoles is cleared afterwards, so a user whose roles
    // an administrator removes later is not granted them again on the next start.
    const { docs: users } = await payload.find({
      collection: 'users',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { email: true, legacyRoles: true, roles: true },
      sort: 'createdAt',
    })
    const legacy = users.filter(
      (user) => idsOf(user.roles).length === 0 && (user.legacyRoles?.length ?? 0) > 0,
    )
    if (legacy.length > 0) {
      const { docs: defaults } = await payload.find({
        collection: 'roles',
        where: { isDefault: { equals: true } },
        depth: 0,
        joins: false,
        pagination: false,
        overrideAccess: true,
      })
      for (const user of legacy) {
        const roles = user.legacyRoles?.includes('admin')
          ? [administrator.id]
          : defaults.map((role) => role.id)
        await payload.update({
          collection: 'users',
          id: user.id,
          data: { roles: asRoleIds(roles), legacyRoles: [] },
          depth: 0,
          overrideAccess: true,
        })
      }
      payload.logger.info(`[roles] Moved ${legacy.length} user(s) from the old roles field.`)
    }

    const { docs: adminRoles } = await payload.find({
      collection: 'roles',
      where: { fullAccess: { equals: true } },
      depth: 0,
      joins: false,
      pagination: false,
      overrideAccess: true,
    })
    const { totalDocs: admins } = await payload.count({
      collection: 'users',
      where: { roles: { in: adminRoles.map((role) => role.id) } },
      overrideAccess: true,
    })
    const oldest = users[0]
    let promoted: (typeof users)[number] | undefined
    if (admins === 0 && oldest) {
      await payload.update({
        collection: 'users',
        id: oldest.id,
        data: { roles: asRoleIds([...idsOf(oldest.roles), administrator.id]) },
        depth: 0,
        overrideAccess: true,
      })
      promoted = oldest
      payload.logger.warn(
        `[roles] Nobody had full access: gave ${oldest.email} (oldest user) the Administrator role.`,
      )
    }

    const roleless = users.filter(
      (user) => idsOf(user.roles).length === 0 && !legacy.includes(user) && user !== promoted,
    )
    if (roleless.length > 0) {
      payload.logger.warn(
        `[roles] ${roleless.length} user(s) have no role and cannot open the admin: ${roleless
          .map((user) => user.email)
          .join(', ')}.`,
      )
    }
  } catch (error) {
    payload.logger.error(
      `[roles] Could not verify the roles: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
