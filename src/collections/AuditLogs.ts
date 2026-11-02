import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload'
import { APIError } from 'payload'

import { hasCapability } from '@/access/permissions'
import { capabilityAccess } from '@/access/roles'

export const AUDIT_ACTIONS = [
  { label: 'Created', value: 'create' },
  { label: 'Edited', value: 'update' },
  { label: 'Trashed', value: 'trash' },
  { label: 'Restored', value: 'restore' },
  { label: 'Deleted', value: 'delete' },
  { label: 'Signed in', value: 'login' },
  { label: 'Backup', value: 'backup' },
  { label: 'Maintenance', value: 'maintenance' },
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]['value']

export const preventAuditLogMutation: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation !== 'create') {
    throw new APIError('Audit log entries are immutable and cannot be modified.', 403)
  }
  return data
}

export const preventAuditLogDeletion: CollectionBeforeDeleteHook = () => {
  throw new APIError('Audit log entries are immutable and cannot be deleted.', 403)
}

/**
 * Immutable audit trail guarded by the `viewAuditLog` capability (ADR 0011).
 * Entries are written exclusively by `auditLogPlugin` via the Local API (`overrideAccess: true`).
 * External creates, updates, and deletes are rejected both by `access` and by `beforeChange` / `beforeDelete` hooks.
 */
export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  enableQueryPresets: true,
  labels: {
    singular: 'Audit log',
    plural: 'Audit logs',
  },
  // Guarded by the `viewAuditLog` capability under Roles -> Tools rather than a CRUD level.
  custom: {
    permissions: false,
    graphqlTab: false,
  },
  admin: {
    group: 'Admin',
    useAsTitle: 'summary',
    defaultColumns: ['createdAt', 'action', 'actorLabel', 'entityType', 'documentTitle'],
    description:
      'Immutable record of who created, edited, trashed, restored, deleted, or signed in.',
    hidden: ({ user }) => !hasCapability(user, 'viewAuditLog'),
  },
  access: {
    read: capabilityAccess('viewAuditLog'),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeChange: [preventAuditLogMutation],
    beforeDelete: [preventAuditLogDeletion],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'action',
          type: 'select',
          required: true,
          index: true,
          options: [...AUDIT_ACTIONS],
          admin: { readOnly: true, width: '30%' },
        },
        {
          name: 'entityKind',
          type: 'select',
          required: true,
          defaultValue: 'collection',
          options: [
            { label: 'Collection', value: 'collection' },
            { label: 'Global', value: 'global' },
            { label: 'Auth', value: 'auth' },
            { label: 'Database', value: 'database' },
          ],
          admin: { readOnly: true, width: '30%' },
        },
        {
          name: 'entityType',
          type: 'text',
          required: true,
          index: true,
          label: 'Collection / Global',
          admin: { readOnly: true, width: '40%' },
        },
      ],
    },
    {
      name: 'summary',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'documentId',
          type: 'text',
          index: true,
          admin: { readOnly: true, width: '35%' },
        },
        {
          name: 'documentTitle',
          type: 'text',
          admin: { readOnly: true, width: '65%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'actor',
          type: 'relationship',
          relationTo: 'users',
          index: true,
          admin: { readOnly: true, width: '34%' },
        },
        {
          name: 'actorName',
          type: 'text',
          admin: { readOnly: true, width: '33%' },
        },
        {
          name: 'actorEmail',
          type: 'text',
          admin: { readOnly: true, width: '33%' },
        },
      ],
    },
    {
      name: 'actorLabel',
      type: 'text',
      label: 'Actor',
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'ip',
          type: 'text',
          label: 'IP Address',
          admin: { readOnly: true, width: '40%' },
        },
        {
          name: 'userAgent',
          type: 'text',
          label: 'User Agent',
          admin: { readOnly: true, width: '60%' },
        },
      ],
    },
    {
      name: 'meta',
      type: 'json',
      label: 'Metadata',
      admin: { readOnly: true },
    },
  ],
}
