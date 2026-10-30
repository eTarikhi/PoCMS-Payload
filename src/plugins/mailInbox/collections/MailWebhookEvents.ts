import type { CollectionConfig } from 'payload'

import { adminsOnly } from '@/access/roles'

import { MAIL_WEBHOOK_EVENTS_COLLECTION } from '../constants'

export function createMailWebhookEventsCollection(): CollectionConfig {
  return {
    slug: MAIL_WEBHOOK_EVENTS_COLLECTION,
    labels: {
      singular: 'Mail webhook event',
      plural: 'Mail webhook events',
    },
    custom: {
      permissions: false,
      auditLog: false,
      tanstackList: false,
      listSummary: false,
      graphqlTab: false,
    },
    admin: {
      group: 'Admin',
      hidden: true,
      useAsTitle: 'svixId',
    },
    access: {
      read: adminsOnly,
      create: () => false,
      update: () => false,
      delete: adminsOnly,
    },
    fields: [
      {
        name: 'svixId',
        type: 'text',
        required: true,
        unique: true,
        index: true,
      },
      {
        name: 'eventType',
        type: 'text',
        required: true,
        index: true,
      },
      {
        name: 'resendEmailId',
        type: 'text',
        index: true,
      },
      {
        name: 'svixTimestamp',
        type: 'number',
      },
      {
        name: 'processingState',
        type: 'select',
        required: true,
        defaultValue: 'queued',
        index: true,
        options: [
          { label: 'Queued', value: 'queued' },
          { label: 'Processed', value: 'processed' },
          { label: 'Ignored', value: 'ignored' },
          { label: 'Failed', value: 'failed' },
        ],
      },
      {
        name: 'attempts',
        type: 'number',
        defaultValue: 0,
      },
      {
        name: 'processedAt',
        type: 'date',
      },
      {
        name: 'errorMessage',
        type: 'text',
      },
      {
        name: 'payloadSnapshot',
        type: 'json',
      },
    ],
  }
}
