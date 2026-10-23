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
// The verification generators live beside these in src/email/auth.ts and are used the same way;
// passing `verify` in the auth object below would turn verification on, which is not wanted here.
import {
  generateForgotPasswordEmailHTML,
  generateForgotPasswordEmailSubject,
} from '../email/auth'
import { inviteNewUser } from '../email/hooks'

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
  // `auth: true` with the two email generators Payload offers as config options. Verification stays
  // off — turning it on would ask every existing account to confirm its address before it could sign
  // in — but the generators are wired, so switching it on later sends this site's email rather than
  // Payload's default markup.
  auth: {
    forgotPassword: {
      generateEmailHTML: generateForgotPasswordEmailHTML,
      generateEmailSubject: generateForgotPasswordEmailSubject,
    },
    // Kept beside the collection rather than in the auth object: passing `verify` here would enable
    // it, and `undefined` would not say why. See src/email/auth.ts for both generators.
    // verify: { generateEmailHTML: generateVerifyEmailHTML, generateEmailSubject: generateVerifyEmailSubject },
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
    // An account created for somebody else gets an email: a link to choose a password when none was
    // supplied, or a pointer to the sign-in page when an administrator set one.
    afterChange: [inviteNewUser],
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
