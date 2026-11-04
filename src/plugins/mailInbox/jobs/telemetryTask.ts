import type { CollectionSlug, Payload, PayloadRequest, TaskConfig } from 'payload'

import { executePayloadSql, qualifiedPayloadTable } from '@/lib/payloadSql'

import {
  APPLY_TELEMETRY_TASK_SLUG,
  DEFAULT_WEBHOOK_RETENTION_DAYS,
  DEFAULT_WEBHOOK_SNAPSHOT_COMPACT_HOURS,
  MAIL_MESSAGES_COLLECTION,
  MAIL_QUEUE,
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
  compactAfterHours = DEFAULT_WEBHOOK_SNAPSHOT_COMPACT_HOURS,
}: {
  payload: Payload
  req?: PayloadRequest
  retentionDays?: number
  compactAfterHours?: number
}): Promise<{
  deletedCount: number
  compactedCount: number
  cutoffIso: string
  compactCutoffIso: string
}> {
  const days = retentionDays > 0 ? retentionDays : DEFAULT_WEBHOOK_RETENTION_DAYS
  const hours = compactAfterHours >= 0 ? compactAfterHours : DEFAULT_WEBHOOK_SNAPSHOT_COMPACT_HOURS
  const nowMs = Date.now()
  const cutoffIso = new Date(nowMs - days * 86_400_000).toISOString()
  const compactCutoffIso = new Date(nowMs - hours * 3_600_000).toISOString()

  // Step 1 (R-12): Compact lingering `payload_snapshot` JSONB blobs on processed/ignored rows older
  // than `compactAfterHours` while retaining the lightweight `svix_id` row for 30-day replay defense.
  let compactedCount = 0
  const eventsTable = qualifiedPayloadTable(payload, 'mail_webhook_events')
  const sqlCompact = await executePayloadSql(
    payload,
    `UPDATE ${eventsTable}
     SET "payload_snapshot" = NULL, "updated_at" = NOW()
     WHERE "processing_state" IN ('processed', 'ignored')
       AND "payload_snapshot" IS NOT NULL
       AND "created_at" < $1::timestamptz`,
    [compactCutoffIso],
    req,
  )

  if (sqlCompact !== null) {
    compactedCount = sqlCompact.rowCount ?? 0
  } else {
    const staleSnapshots = await payload.find({
      collection: MAIL_WEBHOOK_EVENTS_COLLECTION as CollectionSlug,
      where: {
        and: [
          { createdAt: { less_than: compactCutoffIso } },
          { createdAt: { greater_than_equal: cutoffIso } },
          { processingState: { in: ['processed', 'ignored'] } },
        ],
      },
      limit: 500,
      depth: 0,
      overrideAccess: true,
      req,
    })

    for (const rawDoc of staleSnapshots.docs) {
      const rec = rawDoc as unknown as Record<string, unknown>
      if (rec.id !== undefined && rec.payloadSnapshot !== null && rec.payloadSnapshot !== undefined) {
        await payload.update({
          collection: MAIL_WEBHOOK_EVENTS_COLLECTION as CollectionSlug,
          id: rec.id as number | string,
          overrideAccess: true,
          req,
          context: { ...(req?.context ?? {}), skipAuditLog: true },
          data: { payloadSnapshot: null } as Record<string, unknown>,
        })
        compactedCount += 1
      }
    }
  }

  // Step 2: Hard-delete expired processed/ignored idempotency rows past `retentionDays`.
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
    compactedCount,
    cutoffIso,
    compactCutoffIso,
  }
}

export function createPruneWebhookLedgerTask(
  defaultRetentionDays = DEFAULT_WEBHOOK_RETENTION_DAYS,
): TaskConfig {
  return {
    slug: PRUNE_WEBHOOK_LEDGER_TASK_SLUG,
    label: 'Prune mail webhook ledger',
    retries: 0,
    schedule: [
      {
        cron: '45 3 * * *',
        queue: MAIL_QUEUE,
      },
    ],
    inputSchema: [
      {
        name: 'retentionDays',
        type: 'number',
        defaultValue: defaultRetentionDays,
      },
      {
        name: 'compactAfterHours',
        type: 'number',
        defaultValue: DEFAULT_WEBHOOK_SNAPSHOT_COMPACT_HOURS,
      },
    ],
    outputSchema: [
      { name: 'deletedCount', type: 'number' },
      { name: 'compactedCount', type: 'number' },
      { name: 'cutoffIso', type: 'text' },
      { name: 'compactCutoffIso', type: 'text' },
    ],
    handler: async ({ input, req }) => {
      const rec = (input ?? {}) as Record<string, unknown>
      const days =
        typeof rec.retentionDays === 'number' && rec.retentionDays > 0
          ? rec.retentionDays
          : defaultRetentionDays
      const compactHours =
        typeof rec.compactAfterHours === 'number' && rec.compactAfterHours >= 0
          ? rec.compactAfterHours
          : DEFAULT_WEBHOOK_SNAPSHOT_COMPACT_HOURS
      const out = await pruneWebhookEventsLedger({
        payload: req.payload,
        req,
        retentionDays: days,
        compactAfterHours: compactHours,
      })
      return { output: out }
    },
  }
}
