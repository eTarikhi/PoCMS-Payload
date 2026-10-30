/**
 * Roles, permissions and access levels (ADR 0011). Isomorphic: no Payload runtime imports, so
 * client components (command menu, header actions) can read the signed-in user's permissions too.
 *
 * - A **role** (the `roles` collection) gives an **access level** per collection and global and a
 *   set of **capabilities** (tools), or full access ("Administrator").
 * - A user has any number of roles (`users.roles`); the effective permissions are the union: the
 *   highest level per collection, every capability of every role.
 * - The users collection computes them on every read into the virtual `permissions` field, so
 *   `req.user.permissions` (server) and `useAuth().user.permissions` (client) are always current
 *   and access functions stay synchronous.
 */

export const ACCESS_LEVELS = ['none', 'read', 'edit', 'full'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]

/** Globals have a single document that can't be created or deleted: no "full" level. */
export const GLOBAL_ACCESS_LEVELS = ['none', 'read', 'edit'] as const

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  none: 'No access',
  read: 'Read only',
  edit: 'Edit',
  full: 'Full',
}

/** What each level allows, in the words the Roles screen uses. */
export const ACCESS_LEVEL_HELP: Record<AccessLevel, string> = {
  none: 'Hidden from the sidebar; documents cannot be opened or changed.',
  read: 'Browse and open documents, change nothing.',
  edit: 'Create and edit documents, move them to the trash and restore them.',
  full: 'Everything Edit allows, plus deleting permanently (and emptying the trash).',
}

/** Admin tools that aren't a collection or a global. Field names on the role's `capabilities`. */
export const CAPABILITIES = [
  {
    name: 'viewAnalytics',
    label: 'Site traffic and page speed',
    description: 'Dashboard widgets with visits, top pages and Core Web Vitals.',
  },
  {
    name: 'viewDeployments',
    label: 'Deployments and CI',
    description: 'Dashboard widgets with the latest Vercel deployments and GitHub Actions runs.',
  },
  {
    name: 'viewAuditLog',
    label: 'Audit log',
    description: 'Who changed what, signed in or out, and when.',
  },
  {
    name: 'manageJobs',
    label: 'Scheduled jobs',
    description: 'See the job queue, run jobs now and cancel queued ones.',
  },
  {
    name: 'viewSystem',
    label: 'System information',
    description: 'Versions, environment, database and configured integrations.',
  },
  {
    name: 'manageDatabase',
    label: 'Database management',
    description:
      'PostgreSQL health & bloat monitoring, portable backups, transactional restore, repair tools, and serverless provider snapshots/branches.',
  },
  {
    name: 'useDeveloperTools',
    label: 'Developer tools',
    description:
      'The header developer menu (generators, migrations, caches, GraphQL) and the component gallery.',
  },
  {
    name: 'manageCustomCode',
    label: 'Custom head, CSS & script injection',
    description:
      'Inject custom <head> meta/link tags, site-wide CSS styles, after-footer widgets, and body scripts.',
  },
  {
    name: 'useTerminal',
    label: 'Terminal',
    description:
      'Run shell commands from the admin. Development only; never available in production.',
  },
] as const

export type Capability = (typeof CAPABILITIES)[number]['name']

export type Operation = 'create' | 'read' | 'update' | 'delete'

/** The signed-in user's effective permissions: `user.permissions` (virtual field on users). */
export type EffectivePermissions = {
  /** Administrator: every level is "full", every capability, plus users and roles. */
  fullAccess: boolean
  /** Names of the assigned roles. No role means no admin panel access. */
  roles: string[]
  /** Highest level per collection or global slug. Missing slugs mean "none". */
  levels: Record<string, AccessLevel>
  capabilities: Capability[]
}

export const NO_PERMISSIONS: EffectivePermissions = {
  fullAccess: false,
  roles: [],
  levels: {},
  capabilities: [],
}

const RANK: Record<AccessLevel, number> = { none: 0, read: 1, edit: 2, full: 3 }

export const isAccessLevel = (value: unknown): value is AccessLevel =>
  typeof value === 'string' && (ACCESS_LEVELS as readonly string[]).includes(value)

/** Whether an access level allows an operation. Trash and restore are updates ("edit"). */
export function levelAllows(level: AccessLevel, operation: Operation): boolean {
  if (operation === 'read') return RANK[level] >= RANK.read
  if (operation === 'delete') return level === 'full'
  return RANK[level] >= RANK.edit
}

export const higherLevel = (a: AccessLevel, b: AccessLevel): AccessLevel =>
  RANK[b] > RANK[a] ? b : a

export function permissionsOf(user: unknown): EffectivePermissions | null {
  const permissions = (user as { permissions?: EffectivePermissions | null } | null | undefined)
    ?.permissions
  return permissions && typeof permissions === 'object' ? permissions : null
}

/** Administrator (a role with full access). Manages users and roles; sees every tool. */
export const isAdmin = (user: unknown): boolean => Boolean(permissionsOf(user)?.fullAccess)

/** At least one role: the admin panel's `access.admin`. */
export const hasAnyRole = (user: unknown): boolean => {
  const permissions = permissionsOf(user)
  return Boolean(permissions && (permissions.fullAccess || permissions.roles.length > 0))
}

export function levelFor(user: unknown, slug: string): AccessLevel {
  const permissions = permissionsOf(user)
  if (!permissions) return 'none'
  if (permissions.fullAccess) return 'full'
  const level = permissions.levels[slug]
  return isAccessLevel(level) ? level : 'none'
}

export const can = (user: unknown, slug: string, operation: Operation): boolean =>
  levelAllows(levelFor(user, slug), operation)

export function hasCapability(user: unknown, capability: Capability): boolean {
  const permissions = permissionsOf(user)
  return Boolean(
    permissions && (permissions.fullAccess || permissions.capabilities.includes(capability)),
  )
}

/**
 * Editing raw HTML/CSS/JS injection requires either Administrator (`fullAccess`) or BOTH
 * `edit` access on `custom-code` AND the explicit `manageCustomCode` capability.
 */
export function canManageCustomCode(user: unknown): boolean {
  return can(user, 'custom-code', 'update') && hasCapability(user, 'manageCustomCode')
}

/* -------------------------------------------------------------------------------------------- */
/* Governed collections and globals                                                              */
/* -------------------------------------------------------------------------------------------- */

/** A collection or global whose access is set per role. */
export type GovernedEntity = {
  kind: 'collection' | 'global'
  slug: string
  /** Field name on the role's `levels` group (the slug in camelCase). */
  field: string
  label: string
  /** The sidebar group (`admin.group`), used to group the Roles screen. */
  group: string
}

type LabelLike = string | Record<string, string> | ((...args: never[]) => string) | undefined
type EntityConfigLike = {
  slug: string
  auth?: unknown
  custom?: Record<string, unknown>
  admin?: { group?: LabelLike | false }
  labels?: { plural?: LabelLike }
  label?: LabelLike
}

const textOf = (label: LabelLike, fallback: string): string => {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') return label.en ?? Object.values(label)[0] ?? fallback
  return fallback
}

const titleCase = (slug: string) =>
  slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

/** `audit-logs` -> `auditLogs`: field names must be valid GraphQL and column names. */
export const fieldNameFor = (slug: string): string =>
  slug.replace(/[-_]+([a-z0-9])/gi, (_, letter: string) => letter.toUpperCase())

/**
 * Collections and globals governed by roles: everything except auth collections (users are managed
 * by administrators only, so nobody can grant themselves more), Payload's internal collections and
 * anything that opts out with `custom: { permissions: false }` (the roles themselves, and tool data
 * guarded by a capability instead).
 */
export function governedEntities(config: {
  collections?: readonly EntityConfigLike[]
  globals?: readonly EntityConfigLike[]
}): GovernedEntity[] {
  const governed = (entity: EntityConfigLike) =>
    !entity.slug.startsWith('payload-') && entity.custom?.permissions !== false
  const groupOf = (entity: EntityConfigLike) =>
    entity.admin?.group ? textOf(entity.admin.group as LabelLike, 'Other') : 'Other'

  return [
    ...(config.collections ?? [])
      .filter((collection) => !collection.auth && governed(collection))
      .map<GovernedEntity>((collection) => ({
        kind: 'collection',
        slug: collection.slug,
        field: fieldNameFor(collection.slug),
        label: textOf(collection.labels?.plural, titleCase(collection.slug)),
        group: groupOf(collection),
      })),
    ...(config.globals ?? []).filter(governed).map<GovernedEntity>((global) => ({
      kind: 'global',
      slug: global.slug,
      field: fieldNameFor(global.slug),
      label: textOf(global.label, titleCase(global.slug)),
      group: groupOf(global),
    })),
  ]
}

/* -------------------------------------------------------------------------------------------- */
/* Merging roles                                                                                 */
/* -------------------------------------------------------------------------------------------- */

/** The parts of a role document the merge reads (see src/collections/Roles.ts). */
export type RoleLike = {
  name?: string | null
  fullAccess?: boolean | null
  levels?: Record<string, string | null | undefined> | null
  capabilities?: Partial<Record<Capability, boolean | null>> | null
}

export function mergeRoles(
  roles: readonly RoleLike[],
  entities: readonly GovernedEntity[],
): EffectivePermissions {
  const merged: EffectivePermissions = {
    fullAccess: false,
    roles: [],
    levels: {},
    capabilities: [],
  }
  const capabilities = new Set<Capability>()
  for (const role of roles) {
    if (role.name) merged.roles.push(role.name)
    if (role.fullAccess) merged.fullAccess = true
    for (const entity of entities) {
      const value = role.levels?.[entity.field]
      if (!isAccessLevel(value)) continue
      // A global has no "full" level; treat a stray value as "edit".
      const level = entity.kind === 'global' && value === 'full' ? 'edit' : value
      merged.levels[entity.slug] = higherLevel(merged.levels[entity.slug] ?? 'none', level)
    }
    for (const { name } of CAPABILITIES) if (role.capabilities?.[name]) capabilities.add(name)
  }
  if (merged.fullAccess) {
    for (const entity of entities)
      merged.levels[entity.slug] = entity.kind === 'global' ? 'edit' : 'full'
    for (const { name } of CAPABILITIES) capabilities.add(name)
  }
  merged.capabilities = CAPABILITIES.map(({ name }) => name).filter((name) =>
    capabilities.has(name),
  )
  return merged
}
