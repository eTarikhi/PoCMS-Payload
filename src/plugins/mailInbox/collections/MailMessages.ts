import type { CollectionConfig, CollectionSlug } from 'payload'

import { capabilityAccess } from '@/access/roles'

import {
  MAIL_ATTACHMENTS_COLLECTION,
  MAIL_DELIVERY_STATUSES,
  MAIL_DELIVERY_STATUS_LABELS,
  MAIL_DIRECTIONS,
  MAIL_MESSAGES_COLLECTION,
  MAIL_THREADS_COLLECTION,
} from '../constants'

export function createMailMessagesCollection(): CollectionConfig {
  return {
    slug: MAIL_MESSAGES_COLLECTION,
    labels: {
      singular: 'Mail message',
      plural: 'Mail messages',
    },
    custom: {
      permissions: false,
      tanstackList: false,
      listSummary: false,
      graphqlTab: false,
    },
    admin: {
      group: 'Admin',
      hidden: true,
      useAsTitle: 'subject',
    },
    access: {
      read: capabilityAccess('manageInbox'),
      create: capabilityAccess('manageInbox'),
      update: capabilityAccess('manageInbox'),
      delete: capabilityAccess('manageInbox'),
    },
    fields: [
      {
        name: 'thread',
        type: 'relationship',
        relationTo: MAIL_THREADS_COLLECTION as CollectionSlug,
        required: true,
        index: true,
      },
      {
        name: 'direction',
        type: 'select',
        required: true,
        index: true,
        defaultValue: 'inbound',
        options: MAIL_DIRECTIONS.map((value) => ({
          label:
            value === 'inbound'
              ? 'Inbound'
              : value === 'outbound'
                ? 'Outbound'
                : 'Form submission',
          value,
        })),
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        index: true,
        defaultValue: 'received',
        options: MAIL_DELIVERY_STATUSES.map((value) => ({
          label: MAIL_DELIVERY_STATUS_LABELS[value],
          value,
        })),
      },
      {
        name: 'isRead',
        type: 'checkbox',
        defaultValue: false,
        index: true,
      },
      {
        name: 'resendEmailId',
        type: 'text',
        unique: true,
        index: true,
      },
      {
        name: 'rfcMessageId',
        type: 'text',
        index: true,
      },
      {
        name: 'inReplyTo',
        type: 'text',
        index: true,
      },
      {
        name: 'references',
        type: 'json',
      },
      {
        name: 'fromAddress',
        type: 'text',
        required: true,
        index: true,
      },
      {
        name: 'fromName',
        type: 'text',
      },
      {
        name: 'toAddresses',
        type: 'json',
      },
      {
        name: 'ccAddresses',
        type: 'json',
      },
      {
        name: 'bccAddresses',
        type: 'json',
      },
      {
        name: 'replyToAddresses',
        type: 'json',
      },
      {
        name: 'subject',
        type: 'text',
        required: true,
        defaultValue: '(No subject)',
      },
      {
        name: 'snippet',
        type: 'text',
      },
      {
        name: 'sanitizedHtml',
        type: 'textarea',
      },
      {
        name: 'plainText',
        type: 'textarea',
      },
      {
        name: 'visibleReplyText',
        type: 'textarea',
      },
      {
        name: 'quotedHistoryText',
        type: 'textarea',
      },
      {
        name: 'hasRemoteImages',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        name: 'blockedRemoteImages',
        type: 'number',
        defaultValue: 0,
      },
      {
        name: 'attachments',
        type: 'relationship',
        relationTo: MAIL_ATTACHMENTS_COLLECTION as CollectionSlug,
        hasMany: true,
      },
      {
        name: 'sentAt',
        type: 'date',
        required: true,
        index: true,
      },
      {
        name: 'deliveredAt',
        type: 'date',
      },
      {
        name: 'bouncedAt',
        type: 'date',
      },
      {
        name: 'lastEventAt',
        type: 'date',
      },
      {
        name: 'openCount',
        type: 'number',
        defaultValue: 0,
      },
      {
        name: 'clickCount',
        type: 'number',
        defaultValue: 0,
      },
      {
        name: 'errorMessage',
        type: 'text',
      },
      {
        name: 'authResults',
        type: 'json',
      },
      {
        name: 'headersSnapshot',
        type: 'json',
      },
    ],
  }
}
