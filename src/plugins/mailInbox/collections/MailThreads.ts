import type { CollectionConfig, CollectionSlug, Field } from 'payload'

import { capabilityAccess } from '@/access/roles'

import {
  MAIL_FOLDERS,
  MAIL_FOLDER_LABELS,
  MAIL_LABELS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  MAIL_THREADS_COLLECTION,
} from '../constants'

export function createMailThreadsCollection(options?: {
  hasFormSubmissions?: boolean
}): CollectionConfig {
  const sourceFormField: Field = options?.hasFormSubmissions
    ? {
        name: 'sourceFormSubmission',
        type: 'relationship',
        relationTo: 'form-submissions' as CollectionSlug,
        index: true,
      }
    : {
        name: 'sourceFormSubmission',
        type: 'text',
        index: true,
      }

  return {
    slug: MAIL_THREADS_COLLECTION,
    labels: {
      singular: 'Mail thread',
      plural: 'Mail threads',
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
        name: 'threadKey',
        type: 'text',
        required: true,
        unique: true,
        index: true,
      },
      {
        name: 'subject',
        type: 'text',
        required: true,
        defaultValue: '(No subject)',
      },
      {
        name: 'normalizedSubject',
        type: 'text',
        required: true,
        index: true,
      },
      {
        name: 'folder',
        type: 'select',
        required: true,
        defaultValue: 'inbox',
        index: true,
        options: MAIL_FOLDERS.map((folder) => ({
          label: MAIL_FOLDER_LABELS[folder],
          value: folder,
        })),
      },
      {
        name: 'isRead',
        type: 'checkbox',
        defaultValue: false,
        index: true,
      },
      {
        name: 'isStarred',
        type: 'checkbox',
        defaultValue: false,
        index: true,
      },
      {
        name: 'hasAttachments',
        type: 'checkbox',
        defaultValue: false,
        index: true,
      },
      {
        name: 'hasDraft',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        name: 'messageCount',
        type: 'number',
        required: true,
        defaultValue: 0,
      },
      {
        name: 'unreadCount',
        type: 'number',
        required: true,
        defaultValue: 0,
      },
      {
        name: 'snippet',
        type: 'text',
      },
      {
        name: 'counterpartyName',
        type: 'text',
        index: true,
      },
      {
        name: 'counterpartyEmail',
        type: 'text',
        index: true,
      },
      {
        name: 'participants',
        type: 'json',
      },
      {
        name: 'labels',
        type: 'relationship',
        relationTo: MAIL_LABELS_COLLECTION as CollectionSlug,
        hasMany: true,
      },
      sourceFormField,
      {
        name: 'lastMessageAt',
        type: 'date',
        required: true,
        index: true,
      },
      {
        name: 'messages',
        type: 'join',
        collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
        on: 'thread',
        defaultLimit: 100,
        defaultSort: 'sentAt',
      },
    ],
  }
}
