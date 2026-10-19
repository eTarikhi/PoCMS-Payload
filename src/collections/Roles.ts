import type { CollectionConfig, Field } from 'payload'

import {
  ACCESS_LEVEL_HELP,
  ACCESS_LEVEL_LABELS,
  ACCESS_LEVELS,
  CAPABILITIES,
  GLOBAL_ACCESS_LEVELS,
  type GovernedEntity,
  isAdmin,
} from '../access/permissions'
import { adminsOnly, protectRoles, protectRolesOnDelete, roleIdsOf } from '../access/roles'

const withoutFullAccess = (data: Partial<{ fullAccess?: boolean | null }> | undefined) =>
  !data?.fullAccess

/** One radio row per collection or global, grouped under its sidebar group. */
function levelFields(entities: GovernedEntity[]): Field[] {
  const groups = new Map<string, GovernedEntity[]>()
  for (const entity of entities)
    groups.set(entity.group, [...(groups.get(entity.group) ?? []), entity])
  return [...groups].map(([group, items]) => ({
    type: 'collapsible',
    label: group,
    admin: { initCollapsed: false },
    fields: items.map<Field>((entity) => ({
      name: entity.field,
      type: 'radio',
      label: entity.label,
      defaultValue: 'none',
      options: (entity.kind === 'global' ? GLOBAL_ACCESS_LEVELS : ACCESS_LEVELS).map((level) => ({
        label: ACCESS_LEVEL_LABELS[level],
        value: level,
      })),
      admin: {
        layout: 'horizontal',
        // Read by the access overview above the roles list.
        custom: { kind: entity.kind, slug: entity.slug },
      },
    })),
  }))
}

/**
 * Roles (ADR 0011): named sets of access levels and tool capabilities that administrators assign
 * to users. Built from the governed collections and globals of the config (permissions.ts), so a
 * new collection gets its row here automatically.
 */
export const createRoles = (entities: GovernedEntity[]): CollectionConfig => ({
  slug: 'roles',
  labels: { singular: 'Role', plural: 'Roles' },
  admin: {
    group: 'Admin',
    useAsTitle: 'name',
    defaultColumns: ['name', 'description', 'fullAccess', 'isDefault', 'updatedAt'],
    description:
      'What each kind of user may do: an access level per collection and global, plus admin tools. Users get roles on their account; with several roles the highest level wins.',
    hidden: ({ user }) => !isAdmin(user),
    components: {
      beforeListTable: ['/components/admin/views/Roles/AccessOverview#AccessOverview'],
    },
  },
  // Not governed by itself: only administrators manage roles (no self-granted access).
  custom: { permissions: false },
  access: {
    // Administrators read every role; other users read the roles they hold.
    read: ({ req }) => {
      if (isAdmin(req.user)) return true
      const ids = roleIdsOf(req.user)
      return ids.length > 0 ? { id: { in: ids } } : false
    },
    create: adminsOnly,
    update: adminsOnly,
    // The built-in Administrator role is never deleted.
    delete: ({ req }) => (isAdmin(req.user) ? { system: { not_equals: true } } : false),
  },
  hooks: {
    beforeChange: [protectRoles],
    beforeDelete: [protectRolesOnDelete],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, unique: true, admin: { width: '50%' } },
        {
          name: 'isDefault',
          type: 'checkbox',
          label: 'Give to new users',
          defaultValue: false,
          admin: {
            width: '50%',
            description: 'New users get the roles marked here unless you pick roles for them.',
          },
        },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'What the role is for. Shown in the roles list.' },
    },
    {
      name: 'fullAccess',
      type: 'checkbox',
      label: 'Full access (administrator)',
      defaultValue: false,
      admin: {
        description:
          'Everything, including users, roles and every tool. Replaces the access levels below.',
      },
    },
    {
      name: 'system',
      type: 'checkbox',
      defaultValue: false,
      access: { create: () => false, update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'levels',
      type: 'group',
      label: 'Access levels',
      admin: {
        condition: withoutFullAccess,
        className: 'roles-levels',
        description: (['read', 'edit', 'full'] as const)
          .map((level) => `${ACCESS_LEVEL_LABELS[level]}: ${ACCESS_LEVEL_HELP[level]}`)
          .join(' ')
          .concat(' Without read access a collection is hidden from the sidebar.'),
      },
      fields: levelFields(entities),
    },
    {
      name: 'capabilities',
      type: 'group',
      label: 'Tools',
      admin: {
        condition: withoutFullAccess,
        description: 'Admin tools this role may use.',
      },
      fields: CAPABILITIES.map<Field>((capability) => ({
        name: capability.name,
        type: 'checkbox',
        label: capability.label,
        defaultValue: false,
        admin: { description: capability.description },
      })),
    },
    {
      name: 'members',
      type: 'join',
      collection: 'users',
      on: 'roles',
      admin: {
        defaultColumns: ['email', 'name'],
        description: 'Users with this role. Change roles on the user’s account.',
      },
    },
  ],
})
