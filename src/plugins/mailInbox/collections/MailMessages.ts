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
import { upsertMailMessageBody } from '../services/messageBodiesStore'

export function createMailMessagesCollection(): CollectionConfig {
  return {
    slug: MAIL_MESSAGES_COLLECTION,
    lockDocuments: false,
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
    hooks: {
      afterChange: [
        async ({ context, doc, data, req }) => {
          if (context?.skipMailBodyHook) return doc
          const rec = (data ?? {}) as Record<string, unknown>
          const docRec = (doc ?? {}) as Record<string, unknown>
          if (
            docRec.id !== undefined &&
            docRec.id !== null &&
            ('sanitizedHtml' in rec || 'quotedHistoryText' in rec || 'headersSnapshot' in rec)
          ) {
            await upsertMailMessageBody({
              payload: req.payload,
              req,
              messageId: docRec.id as number | string,
              body: {
                ...(rec.sanitizedHtml !== undefined
                  ? { sanitizedHtml: rec.sanitizedHtml as string | null }
                  : {}),
                ...(rec.quotedHistoryText !== undefined
                  ? { quotedHistoryText: rec.quotedHistoryText as string | null }
                  : {}),
                ...(rec.headersSnapshot !== undefined
                  ? {
                      headersSnapshot: rec.headersSnapshot as Record<string, string> | null,
                    }
                  : {}),
              },
            })
          }
          return doc
        },
      ],
    },
    fields: [
      // Covered by composite `mail_messages_thread_sent_idx` (thread_id, sent_at) and
      // `ON DELETE CASCADE` FK in `phase1BeforeSchemaInit`.
      {
        name: 'thread',
        type: 'relationship',
        relationTo: MAIL_THREADS_COLLECTION as CollectionSlug,
        required: true,
      },
      {
        name: 'direction',
        type: 'select',
        required: true,
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
      // R-13: Cold MIME fields are virtual on `mail_messages` and stored lazily in the 1:1
      // `mail_message_bodies` table (with optional Vercel Blob tiering for archived threads).
      {
        name: 'sanitizedHtml',
        type: 'textarea',
        virtual: true,
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
        virtual: true,
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
        virtual: true,
      },
    ],
  }
}
