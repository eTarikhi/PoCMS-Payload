/**
 * Isomorphic constants, enums, and monotonic delivery status state weights for `mailInboxPlugin`.
 *
 * IMPORTANT: Keep this file free of `node:*`, `payload` runtime, and `next/*` server imports so
 * both server workflows/endpoints and `'use client'` Admin Inbox views can share it safely.
 */

export const MAIL_THREADS_COLLECTION = 'mail-threads' as const
export const MAIL_MESSAGES_COLLECTION = 'mail-messages' as const
export const MAIL_ATTACHMENTS_COLLECTION = 'mail-attachments' as const
export const MAIL_LABELS_COLLECTION = 'mail-labels' as const
export const MAIL_WEBHOOK_EVENTS_COLLECTION = 'mail-webhook-events' as const

export const MAIL_COLLECTIONS = [
  MAIL_THREADS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  MAIL_ATTACHMENTS_COLLECTION,
  MAIL_LABELS_COLLECTION,
  MAIL_WEBHOOK_EVENTS_COLLECTION,
] as const

export const MAIL_QUEUE = 'mail' as const
export const MAIL_PG_CHANNEL = 'pocms_mail_events' as const

export const INGEST_INBOUND_WORKFLOW_SLUG = 'ingestInboundEmail' as const
export const SEND_OUTBOUND_WORKFLOW_SLUG = 'sendOutboundEmail' as const
export const APPLY_TELEMETRY_TASK_SLUG = 'applyDeliveryTelemetry' as const
export const PRUNE_WEBHOOK_LEDGER_TASK_SLUG = 'pruneWebhookLedger' as const

export const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MiB
export const DEFAULT_WEBHOOK_RETENTION_DAYS = 30
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300 // ±5 minutes Svix replay window
export const SUBJECT_THREAD_WINDOW_DAYS = 30

export const MAIL_FOLDERS = ['inbox', 'sent', 'archive', 'spam', 'trash'] as const
export type MailFolder = (typeof MAIL_FOLDERS)[number]

export const MAIL_FOLDER_LABELS: Record<MailFolder, string> = {
  inbox: 'Inbox',
  sent: 'Sent',
  archive: 'Archive',
  spam: 'Spam',
  trash: 'Trash',
}

export const MAIL_DIRECTIONS = ['inbound', 'outbound', 'form_submission'] as const
export type MailDirection = (typeof MAIL_DIRECTIONS)[number]

export const MAIL_DELIVERY_STATUSES = [
  'received',
  'draft',
  'queued',
  'scheduled',
  'sent',
  'delivery_delayed',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed',
  'suppressed',
] as const

export type MailDeliveryStatus = (typeof MAIL_DELIVERY_STATUSES)[number]

export const MAIL_DELIVERY_STATUS_LABELS: Record<MailDeliveryStatus, string> = {
  received: 'Received',
  draft: 'Draft',
  queued: 'Queued',
  scheduled: 'Scheduled',
  sent: 'Sent',
  delivery_delayed: 'Delayed',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked',
  bounced: 'Bounced',
  complained: 'Spam complaint',
  failed: 'Failed',
  suppressed: 'Suppressed',
}

/**
 * Monotonic weights preventing out-of-order Resend webhooks (e.g. a late `email.sent` arriving
 * after `email.delivered` or `email.bounced`) from regressing message delivery state.
 */
export const DELIVERY_STATUS_RANK: Record<MailDeliveryStatus, number> = {
  draft: 0,
  queued: 10,
  scheduled: 15,
  sent: 20,
  delivery_delayed: 25,
  delivered: 30,
  opened: 35,
  clicked: 40,
  received: 50,
  suppressed: 85,
  failed: 90,
  bounced: 95,
  complained: 100,
}

export const TERMINAL_FAILURE_STATUSES = new Set<MailDeliveryStatus>([
  'bounced',
  'complained',
  'failed',
  'suppressed',
])

export const RESEND_WEBHOOK_EVENT_TYPES = [
  'email.received',
  'email.sent',
  'email.scheduled',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
  'email.failed',
  'email.suppressed',
] as const

export type ResendWebhookEventType = (typeof RESEND_WEBHOOK_EVENT_TYPES)[number]

export const WEBHOOK_EVENT_TO_STATUS: Partial<Record<ResendWebhookEventType, MailDeliveryStatus>> = {
  'email.received': 'received',
  'email.scheduled': 'scheduled',
  'email.sent': 'sent',
  'email.delivery_delayed': 'delivery_delayed',
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
}

/** Resolves the next monotonic delivery status given a current status and incoming webhook status. */
export function resolveMonotonicDeliveryStatus(
  current: MailDeliveryStatus | null | undefined,
  incoming: MailDeliveryStatus,
): MailDeliveryStatus {
  if (!current) return incoming
  if (TERMINAL_FAILURE_STATUSES.has(current)) return current
  const currentRank = DELIVERY_STATUS_RANK[current] ?? 0
  const incomingRank = DELIVERY_STATUS_RANK[incoming] ?? 0
  return incomingRank >= currentRank ? incoming : current
}

export const DEFAULT_MAIL_LABELS = [
  {
    name: 'Lead',
    slug: 'lead',
    color: '#3B82F6',
    description: 'Inbound project or consulting inquiry.',
    isSystem: true,
  },
  {
    name: 'CV Request',
    slug: 'cv-request',
    color: '#10B981',
    description: 'Visitor requested CV / resume dossier.',
    isSystem: true,
  },
  {
    name: 'Client',
    slug: 'client',
    color: '#8B5CF6',
    description: 'Active client communication.',
    isSystem: true,
  },
  {
    name: 'Urgent',
    slug: 'urgent',
    color: '#EF4444',
    description: 'Time-sensitive thread requiring prompt follow-up.',
    isSystem: true,
  },
] as const
