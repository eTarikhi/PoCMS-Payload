import type { CollectionSlug, Payload, PayloadRequest, TaskConfig } from 'payload'

import {
  APPLY_TELEMETRY_TASK_SLUG,
  DEFAULT_WEBHOOK_RETENTION_DAYS,
  MAIL_MESSAGES_COLLECTION,
  MAIL_WEBHOOK_EVENTS_COLLECTION,
  PRUNE_WEBHOOK_LEDGER_TASK_SLUG,
  resolveMonotonicDeliveryStatus,
  WEBHOOK_EVENT_TO_STATUS,
  type MailDeliveryStatus,
  type ResendWebhookEventType,
} from '../constants'
import { publishMailStreamEvent } from '../services/realtimeBus'
import { markWebhookLedgerState } from './ingestWorkflow'

export type ApplyTelemetryInput = {
  resendEmailId: string
  eventType: ResendWebhookEventType
  eventAt?: string | null
  svixId?: string | null
  diagnosticMessage?: string | null
}

/**
 * Applies outbound delivery & engagement webhooks (`sent`, `delivered`, `delivery_delayed`,
 * `opened`, `clicked`, `bounced`, `complained`, `failed`, `suppressed`) using a monotonic
 * state rank so out-of-order webhooks never regress terminal or advanced states.
 */
export async function applyDeliveryTelemetryUpdate({
  payload,
  req,
  resendEmailId,
  eventType,
  eventAt,
  svixId,
  diagnosticMessage,
}: {
  payload: Payload
  req?: PayloadRequest
  resendEmailId: string
  eventType: ResendWebhookEventType
  eventAt?: string | null
  svixId?: string | null
  diagnosticMessage?: string | null
}): Promise<{ matched: boolean; nextStatus: MailDeliveryStatus | null }> {
  const incomingStatus = WEBHOOK_EVENT_TO_STATUS[eventType]
  if (!incomingStatus || !resendEmailId) {
    await markWebhookLedgerState({ payload, req, svixId, state: 'ignored' })
    return { matched: false, nextStatus: null }
  }

  const found = await payload.find({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    where: { resendEmailId: { equals: resendEmailId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const doc = found.docs[0] as unknown as Record<string, unknown> | undefined
  if (!doc?.id) {
    // Transactional email sent outside the Inbox (e.g. password reset): mark webhook ignored cleanly.
    await markWebhookLedgerState({ payload, req, svixId, state: 'ignored' })
    return { matched: false, nextStatus: null }
  }

  const currentStatus = (doc.status as MailDeliveryStatus | undefined) ?? 'sent'
  const nextStatus = resolveMonotonicDeliveryStatus(currentStatus, incomingStatus)
  const timestampIso =
    eventAt && !Number.isNaN(new Date(eventAt).getTime())
      ? new Date(eventAt).toISOString()
      : new Date().toISOString()

  const prevOpenCount = typeof doc.openCount === 'number' ? doc.openCount : 0
  const prevClickCount = typeof doc.clickCount === 'number' ? doc.clickCount : 0

  const patch: Record<string, unknown> = {
    status: nextStatus,
    lastEventAt: timestampIso,
  }

  if (eventType === 'email.delivered' && !doc.deliveredAt) {
    patch.deliveredAt = timestampIso
  }
  if (
    (eventType === 'email.bounced' ||
      eventType === 'email.complained' ||
      eventType === 'email.failed' ||
      eventType === 'email.suppressed') &&
    !doc.bouncedAt
  ) {
    patch.bouncedAt = timestampIso
  }
  if (diagnosticMessage) {
    patch.errorMessage = diagnosticMessage.slice(0, 500)
  }
  if (eventType === 'email.opened') {
    patch.openCount = prevOpenCount + 1
  }
  if (eventType === 'email.clicked') {
    patch.clickCount = prevClickCount + 1
  }

  await payload.update({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    id: doc.id as number | string,
    overrideAccess: true,
    req,
    context: { ...(req?.context ?? {}), skipAuditLog: true },
    data: patch,
  })

  const threadId =
    typeof doc.thread === 'object' && doc.thread !== null && 'id' in doc.thread
      ? (doc.thread as { id: number | string }).id
      : (doc.thread as number | string)

  await markWebhookLedgerState({ payload, req, svixId, state: 'processed' })

  await publishMailStreamEvent(payload, {
    type: 'message.telemetry',
    threadId,
    messageId: doc.id as number | string,
  })

  return {
    matched: true,
    nextStatus,
  }
}

export function createApplyDeliveryTelemetryTask(): TaskConfig {
  return {
    slug: APPLY_TELEMETRY_TASK_SLUG,
    label: 'Apply delivery telemetry',
    retries: 2,
    concurrency: ({ input }) => {
      const rec = (input ?? {}) as Record<string, unknown>
      return `mail:telemetry:${String(rec.resendEmailId ?? 'unknown')}`
    },
    inputSchema: [
      { name: 'resendEmailId', type: 'text', required: true },
      { name: 'eventType', type: 'text', required: true },
      { name: 'eventAt', type: 'text' },
      { name: 'svixId', type: 'text' },
      { name: 'diagnosticMessage', type: 'text' },
    ],
    outputSchema: [
      { name: 'matched', type: 'checkbox' },
      { name: 'nextStatus', type: 'text' },
    ],
    handler: async ({ input, req }) => {
      const typed = input as unknown as ApplyTelemetryInput
      const result = await applyDeliveryTelemetryUpdate({
        payload: req.payload,
        req,
        resendEmailId: typed.resendEmailId,
        eventType: typed.eventType,
        eventAt: typed.eventAt,
        svixId: typed.svixId,
        diagnosticMessage: typed.diagnosticMessage,
      })
      return {
        output: {
          matched: result.matched,
          nextStatus: result.nextStatus ?? '',
        },
      }
    },
  }
}

export async function pruneWebhookEventsLedger({
  payload,
  req,
  retentionDays = DEFAULT_WEBHOOK_RETENTION_DAYS,
}: {
  payload: Payload
  req?: PayloadRequest
  retentionDays?: number
}): Promise<{ deletedCount: number; cutoffIso: string }> {
  const days = retentionDays > 0 ? retentionDays : DEFAULT_WEBHOOK_RETENTION_DAYS
  const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString()

  const deleted = await payload.delete({
    collection: MAIL_WEBHOOK_EVENTS_COLLECTION as CollectionSlug,
    overrideAccess: true,
    req,
    context: { ...(req?.context ?? {}), skipAuditLog: true },
    where: {
      and: [
        { createdAt: { less_than: cutoffIso } },
        { processingState: { in: ['processed', 'ignored'] } },
      ],
    },
  })

  return {
    deletedCount: deleted.docs.length,
    cutoffIso,
  }
}

export function createPruneWebhookLedgerTask(
  defaultRetentionDays = DEFAULT_WEBHOOK_RETENTION_DAYS,
): TaskConfig {
  return {
    slug: PRUNE_WEBHOOK_LEDGER_TASK_SLUG,
    label: 'Prune mail webhook ledger',
    retries: 0,
    inputSchema: [
      {
        name: 'retentionDays',
        type: 'number',
        defaultValue: defaultRetentionDays,
      },
    ],
    outputSchema: [
      { name: 'deletedCount', type: 'number' },
      { name: 'cutoffIso', type: 'text' },
    ],
    handler: async ({ input, req }) => {
      const rec = (input ?? {}) as Record<string, unknown>
      const days =
        typeof rec.retentionDays === 'number' && rec.retentionDays > 0
          ? rec.retentionDays
          : defaultRetentionDays
      const out = await pruneWebhookEventsLedger({
        payload: req.payload,
        req,
        retentionDays: days,
      })
      return { output: out }
    },
  }
}
