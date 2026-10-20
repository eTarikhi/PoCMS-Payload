import type { CollectionConfig } from 'payload'

import { hasCapability } from '../access/permissions'

/**
 * Audit log (CR-12 E5): one immutable document per content change, deletion, trash, restore and
 * sign-in. Written by the audit plugin (`src/plugins/auditLog.ts`) with `overrideAccess`, so the
 * log cannot be forged, edited or cleared through the API or the admin.
 *
 * Read with the "Audit log" capability (`viewAuditLog`). The collection shows in the Admin group
 * for those users; Payload's own list supplies search, filters and pagination.
 */
export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: 'Audit entry', plural: 'Audit log' },
  admin: {
    group: 'Admin',
    useAsTitle: 'summary',
    defaultColumns: ['action', 'summary', 'userEmail', 'createdAt'],
    listSearchableFields: ['summary', 'documentTitle', 'userEmail', 'entity'],
    description:
      'Every content change, deletion, trash, restore and sign-in, newest first. Entries are written by the server and cannot be changed or deleted here.',
    // The sidebar entry only exists for users who may read the log.
    hidden: ({ user }) => !hasCapability(user, 'viewAuditLog'),
  },
  // Not a governed collection: access is the capability, not a per-collection access level.
  custom: { permissions: false },
  access: {
    read: ({ req }) => hasCapability(req.user, 'viewAuditLog'),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  // No drafts, no trash, no bulk edits: the log is append-only.
  versions: false,
  fields: [
    {
      name: 'action',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Created', value: 'create' },
        { label: 'Updated', value: 'update' },
        { label: 'Moved to trash', value: 'trash' },
        { label: 'Restored', value: 'restore' },
        { label: 'Deleted permanently', value: 'delete' },
        { label: 'Signed in', value: 'login' },
        { label: 'Signed out', value: 'logout' },
      ],
    },
    {
      name: 'summary',
      type: 'text',
      required: true,
      admin: { description: 'One line: who did what to which document.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'entity',
          type: 'text',
          required: true,
          index: true,
          admin: { width: '50%', description: 'Collection or global slug.' },
        },
        { name: 'entityLabel', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      name: 'entityKind',
      type: 'select',
      defaultValue: 'collection',
      options: [
        { label: 'Collection', value: 'collection' },
        { label: 'Global', value: 'global' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'documentId', type: 'text', index: true, admin: { width: '50%' } },
        { name: 'documentTitle', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'userId',
          type: 'text',
          index: true,
          admin: {
            width: '50%',
            description:
              'Id of the account that acted. A plain id, not a relationship: the entry outlives the account.',
          },
        },
        { name: 'userEmail', type: 'text', admin: { width: '50%' } },
      ],
    },
    { name: 'ip', type: 'text', admin: { description: 'Caller address, when known.' } },
    {
      name: 'changes',
      type: 'json',
      admin: {
        description:
          'Fields that changed, with their previous and new value (sensitive fields and long values are left out).',
      },
    },
  ],
}

export default AuditLogs
