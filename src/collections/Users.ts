import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { adminsOnly, adminsOnlyField, adminsOrSelf, isAdmin } from '../access/roles'

/** The first account (created on /admin/create-first-user) is always an admin. */
const firstUserIsAdmin: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true, req })
  return totalDocs === 0 ? { ...data, roles: ['admin'] } : data
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    group: 'Admin',
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'roles', 'updatedAt'],
    description: 'People who can sign in to this admin. Only admins can manage users and roles.',
    // Editors manage their own account from the account menu; the list is for admins.
    hidden: ({ user }) => !isAdmin(user),
  },
  auth: true,
  access: {
    read: adminsOrSelf,
    create: adminsOnly,
    update: adminsOrSelf,
    delete: adminsOnly,
  },
  hooks: {
    beforeChange: [firstUserIsAdmin],
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
      type: 'select',
      hasMany: true,
      defaultValue: ['editor'],
      saveToJWT: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
      access: {
        create: adminsOnlyField,
        update: adminsOnlyField,
      },
      admin: {
        description: 'Admins manage users and see admin-only tools. Editors manage content.',
        position: 'sidebar',
      },
    },
  ],
}
