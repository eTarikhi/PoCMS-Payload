import crypto from 'node:crypto'
import path from 'node:path'
import { APIError, type CollectionBeforeOperationHook, type CollectionConfig } from 'payload'

import { capabilityAccess } from '@/access/roles'

import { DEFAULT_MAX_ATTACHMENT_BYTES, MAIL_ATTACHMENTS_COLLECTION } from '../constants'

function sanitizeAttachmentFilename(name: string): string {
  const base = path.basename(name || 'attachment.bin')
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+/, '')
  return cleaned.slice(0, 120) || 'attachment.bin'
}

export function createMailAttachmentsCollection(options?: {
  maxAttachmentBytes?: number
}): CollectionConfig {
  const maxBytes = options?.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES

  const randomizeFilenameAndGuardSize: CollectionBeforeOperationHook = ({ args, operation, req }) => {
    if (operation !== 'create') return args
    const incomingFile = req.file
    if (!incomingFile) return args

    if (typeof incomingFile.size === 'number' && incomingFile.size > maxBytes) {
      throw new APIError(
        `Attachment exceeds maximum allowed size (${Math.round(maxBytes / (1024 * 1024))} MB).`,
        413,
      )
    }

    const originalName = incomingFile.name || 'attachment.bin'
    const dataObj = ((args as { data?: Record<string, unknown> }).data ?? {}) as Record<
      string,
      unknown
    >
    if (!dataObj.originalFilename) {
      dataObj.originalFilename = originalName
    }
    if (!dataObj.sha256 && Buffer.isBuffer(incomingFile.data)) {
      dataObj.sha256 = crypto.createHash('sha256').update(incomingFile.data).digest('hex')
    }
    ;(args as { data?: Record<string, unknown> }).data = dataObj

    // Prefix every stored attachment with 96 bits of cryptographic entropy so file keys never collide or become guessable.
    if (!originalName.startsWith('att_')) {
      const randomPrefix = crypto.randomBytes(12).toString('hex')
      incomingFile.name = `att_${randomPrefix}_${sanitizeAttachmentFilename(originalName)}`
    }

    return args
  }

  return {
    slug: MAIL_ATTACHMENTS_COLLECTION,
    labels: {
      singular: 'Mail attachment',
      plural: 'Mail attachments',
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
      useAsTitle: 'originalFilename',
    },
    access: {
      read: capabilityAccess('manageInbox'),
      create: capabilityAccess('manageInbox'),
      update: () => false,
      delete: capabilityAccess('manageInbox'),
    },
    upload: {
      staticDir: path.resolve(process.cwd(), 'media/mail-attachments'),
      filesRequiredOnCreate: false,
    },
    hooks: {
      beforeOperation: [randomizeFilenameAndGuardSize],
    },
    fields: [
      {
        name: 'originalFilename',
        type: 'text',
        required: true,
        defaultValue: 'attachment.bin',
      },
      {
        name: 'resendAttachmentId',
        type: 'text',
        index: true,
      },
      {
        name: 'disposition',
        type: 'select',
        required: true,
        defaultValue: 'attachment',
        options: [
          { label: 'Attachment', value: 'attachment' },
          { label: 'Inline CID', value: 'inline' },
        ],
      },
      {
        name: 'contentId',
        type: 'text',
        index: true,
      },
      {
        name: 'sha256',
        type: 'text',
        index: true,
      },
      {
        name: 'declaredSize',
        type: 'number',
      },
      {
        name: 'declaredMimeType',
        type: 'text',
      },
      {
        name: 'skippedReason',
        type: 'text',
      },
    ],
  }
}
