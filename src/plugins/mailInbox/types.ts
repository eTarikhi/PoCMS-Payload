import type { CollectionConfig } from 'payload'

import type { MailDeliveryStatus, MailDirection, MailFolder } from './constants'

/**
 * Isomorphic types & DTOs shared across `mailInboxPlugin` server modules and Admin UI views.
 */

export type MailInboxIdentity = {
  label: string
  email: string
  default?: boolean
}

export type MailInboxPluginOptions = {
  /** Disable live endpoints/hooks while optionally keeping collections in the schema. */
  enabled?: boolean
  /**
   * Keep `mail-*` collections registered even when `enabled === false` so `payload-types.ts`,
   * Drizzle schemas, and `schema.graphql` never drift across environments.
   * @default true
   */
  alwaysInsertCollections?: boolean
  /** Resend API key (defaults to `process.env.RESEND_API_KEY`). */
  apiKey?: string
  /** Resend Standard Webhooks / Svix signing secret (defaults to `process.env.RESEND_WEBHOOK_SECRET`). */
  webhookSecret?: string
  /** Verified sender identities selectable in the Compose / Reply "From" dropdown. */
  identities?: readonly MailInboxIdentity[]
  /** Mirror `form-submissions` (/contact & Request CV) into `mail-threads`. @default true */
  bridgeFormSubmissions?: boolean
  /** Max attachment byte budget mirrored to storage per file (default 25 MiB). */
  maxAttachmentBytes?: number
  /** Days to retain processed webhook ledger entries before pruning (default 30). */
  webhookRetentionDays?: number
  /** Collection overrides matching official `@payloadcms/*` plugin conventions. */
  threadOverrides?: (collection: CollectionConfig) => CollectionConfig
  messageOverrides?: (collection: CollectionConfig) => CollectionConfig
  attachmentOverrides?: (collection: CollectionConfig) => CollectionConfig
  labelOverrides?: (collection: CollectionConfig) => CollectionConfig
}

export type ParsedEmailAddress = {
  name: string
  address: string
}

export type MailLabelDTO = {
  id: number | string
  name: string
  slug: string
  color: string
  description: string | null
  isSystem: boolean
}

export type MailAttachmentDTO = {
  id: number | string
  filename: string
  originalFilename: string
  mimeType: string
  filesize: number
  url: string | null
  disposition: 'attachment' | 'inline'
  contentId: string | null
  skippedReason: string | null
}

export type MailAuthSummary = {
  spf?: string | null
  dkim?: string | null
  dmarc?: string | null
}

export type MailMessageDTO = {
  id: number | string
  threadId: number | string
  direction: MailDirection
  status: MailDeliveryStatus
  resendEmailId: string | null
  rfcMessageId: string | null
  inReplyTo: string | null
  references: string[]
  from: ParsedEmailAddress
  to: ParsedEmailAddress[]
  cc: ParsedEmailAddress[]
  bcc: ParsedEmailAddress[]
  replyTo: ParsedEmailAddress[]
  subject: string
  snippet: string
  sanitizedHtml: string
  plainText: string
  visibleReplyText: string
  quotedHistoryText: string
  hasRemoteImages: boolean
  blockedRemoteImages: number
  attachments: MailAttachmentDTO[]
  sentAt: string
  deliveredAt: string | null
  bouncedAt: string | null
  lastEventAt: string | null
  openCount: number
  clickCount: number
  errorMessage: string | null
  authResults: MailAuthSummary | null
}

export type MailThreadSummaryDTO = {
  id: number | string
  subject: string
  normalizedSubject: string
  folder: MailFolder
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
  hasDraft: boolean
  messageCount: number
  unreadCount: number
  snippet: string
  counterpartyName: string
  counterpartyEmail: string
  participants: ParsedEmailAddress[]
  labels: MailLabelDTO[]
  lastMessageAt: string
  sourceFormSubmissionId: number | string | null
}

export type MailThreadDetailDTO = MailThreadSummaryDTO & {
  threadKey: string
  messages: MailMessageDTO[]
}

export type InboxFolderCounts = {
  inbox: number
  inboxUnread: number
  starred: number
  sent: number
  archive: number
  spam: number
  spamUnread: number
  trash: number
}

export type MailIntegrationState = {
  outboundConfigured: boolean
  webhookConfigured: boolean
  realtimeMode: 'pg_listen' | 'cursor_poll'
  webhookEndpointPath: string
  defaultFromEmail: string
  defaultFromName: string
}

export type InboxSnapshot = {
  integration: MailIntegrationState
  identities: MailInboxIdentity[]
  labels: MailLabelDTO[]
  counts: InboxFolderCounts
  threads: MailThreadSummaryDTO[]
  page: number
  totalPages: number
  totalDocs: number
  serverTime: string
}

export type ComposeEmailInput = {
  fromEmail?: string
  fromName?: string
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string | string[]
  subject: string
  html?: string
  text?: string
  replyToThreadId?: number | string | null
  replyToMessageId?: number | string | null
  attachmentIds?: Array<number | string>
  saveAsDraft?: boolean
  draftMessageId?: number | string | null
}

export type BulkThreadsAction =
  | 'markRead'
  | 'markUnread'
  | 'star'
  | 'unstar'
  | 'moveFolder'
  | 'addLabel'
  | 'removeLabel'
  | 'deletePermanent'

export type BulkThreadsInput = {
  threadIds: Array<number | string>
  action: BulkThreadsAction
  folder?: MailFolder
  labelId?: number | string
}

export type MailStreamEvent = {
  type:
    | 'snapshot'
    | 'message.received'
    | 'message.sent'
    | 'message.telemetry'
    | 'threads.updated'
    | 'heartbeat'
  threadId?: number | string | null
  messageId?: number | string | null
  unreadCount?: number
  at: string
}
