import type { CollectionConfig } from 'payload'

import { hasAnyRole, isAdmin } from '../access/permissions'
import {
  adminsOnly,
  adminsOnlyField,
  adminsOrSelf,
  assignRolesOnCreate,
  computePermissions,
  keepAnAdministrator,
  keepAnAdministratorOnDelete,
} from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    group: 'Admin',
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'roles', 'updatedAt'],
    description:
      'People who can sign in to this admin. Administrators manage users and their roles.',
    // Everyone else manages their own account from the account menu; the list is for admins.
    hidden: ({ user }) => !isAdmin(user),
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 600_000, // 10-minute account lockout after 5 consecutive failed sign-in attempts
  },
  access: {
    // The admin panel needs at least one role (ADR 0011); REST and GraphQL logins still work.
    admin: ({ req }) => hasAnyRole(req.user),
    read: adminsOrSelf,
    create: adminsOnly,
    update: adminsOrSelf,
    delete: adminsOnly,
    unlock: adminsOnly,
  },
  hooks: {
    beforeChange: [assignRolesOnCreate, keepAnAdministrator],
    beforeDelete: [keepAnAdministratorOnDelete],
  },
  fields: [
    // Email is added by `auth: true`.
    {
      name: 'name',
      type: 'text',
      admin: { description: 'Display name, used in the dashboard greeting.' },
    },
    {
      name: 'roles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      access: {
        create: adminsOnlyField,
        update: adminsOnlyField,
      },
      admin: {
        position: 'sidebar',
        description:
          'What this person may do; with several roles the highest access wins. Define roles under Admin › Roles.',
      },
    },
    {
      // Effective permissions, merged from the roles on every read (src/access/roles.ts), so access
      // checks and the admin UI read `user.permissions` without loading roles themselves.
      name: 'permissions',
      type: 'json',
      virtual: true,
      access: { create: () => false, update: () => false },
      admin: { hidden: true },
      hooks: { afterRead: [computePermissions] },
    },
    {
      // The roles select of ADR 0008, kept on its old table (users_roles) only so `ensureRoles`
      // can move its values to role documents once; cleared after the move. Drop it in a later
      // migration.
      name: 'legacyRoles',
      type: 'select',
      hasMany: true,
      dbName: 'users_roles',
      enumName: 'enum_users_roles',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
      access: { read: adminsOnlyField, create: () => false, update: () => false },
      admin: { hidden: true },
    },
  ],
}
