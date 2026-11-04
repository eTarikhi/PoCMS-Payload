import type { CollectionSlug, Endpoint, Payload } from 'payload'

import {
  APPLY_TELEMETRY_TASK_SLUG,
  INGEST_INBOUND_WORKFLOW_SLUG,
  MAIL_QUEUE,
  MAIL_WEBHOOK_EVENTS_COLLECTION,
  RESEND_WEBHOOK_EVENT_TYPES,
  type ResendWebhookEventType,
} from '../constants'
import { computeDeterministicThreadKey } from '../jobs/ingestWorkflow'
import { parseEmailAddress } from '../services/emailAddress'
import {
  verifyResendWebhookSignature,
  WebhookVerificationError,
} from '../services/svixVerify'

type ResendWebhookEnvelope = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    message_id?: string
    from?: string
    to?: string[]
    subject?: string
    created_at?: string
    bounce?: { message?: string; type?: string; subType?: string }
    failed?: { reason?: string }
  }
}

function isDuplicateConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rec = error as Record<string, unknown>
  if (rec.code === '23505') return true
  const msg = typeof rec.message === 'string' ? rec.message.toLowerCase() : ''
  return (
    msg.includes('duplicate') ||
    msg.includes('unique') ||
    msg.includes('svix')
  )
}

function scheduleBackgroundMailQueueDrain(payload: Payload): void {
  if (process.env.NODE_ENV === 'test') return

  const drainPromise = payload.jobs
    .run({
      queue: MAIL_QUEUE,
      limit: 5,
    })
    .catch((err) => {
      payload?.logger?.warn?.(
        `[mail-inbox] Background mail queue drain warning: ${err instanceof Error ? err.message : String(err)}`,
      )
    })

  // If deployed on Vercel Serverless, register the promise with `@vercel/functions` waitUntil when available.
  const globalWaitUntil = (globalThis as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil
  if (typeof globalWaitUntil === 'function') {
    globalWaitUntil(drainPromise)
  }
}

export function createResendWebhookEndpoint(options?: {
  getWebhookSecret?: () => string
}): Endpoint {
  const resolveSecret =
    options?.getWebhookSecret ?? (() => process.env.RESEND_WEBHOOK_SECRET?.trim() ?? '')

  return {
    path: '/webhooks/resend',
    method: 'post',
    handler: async (req) => {
      const secret = resolveSecret()
      if (!secret) {
        return Response.json(
          { error: 'RESEND_WEBHOOK_SECRET is not configured on this server.' },
          { status: 503 },
        )
      }

      const rawBody = typeof req.text === 'function' ? await req.text() : ''

      let verified
      try {
        verified = verifyResendWebhookSignature({
          rawBody,
          headers: req.headers,
          secret,
        })
      } catch (error) {
        const message =
          error instanceof WebhookVerificationError
            ? error.message
            : 'Invalid webhook signature.'
        return Response.json({ error: message }, { status: 401 })
      }

      let parsed: ResendWebhookEnvelope
      try {
        parsed = JSON.parse(rawBody) as ResendWebhookEnvelope
      } catch {
        return Response.json({ error: 'Invalid JSON webhook body.' }, { status: 400 })
      }

      const eventType = typeof parsed?.type === 'string' ? parsed.type.trim() : ''
      if (!eventType) {
        return Response.json({ error: 'Missing webhook event type.' }, { status: 400 })
      }

      const resendEmailId =
        typeof parsed?.data?.email_id === 'string' ? parsed.data.email_id.trim() : ''

      // Fast idempotency check before inserting into the unique `svixId` ledger
      const existing = await req.payload.find({
        collection: MAIL_WEBHOOK_EVENTS_COLLECTION as CollectionSlug,
        where: { svixId: { equals: verified.svixId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (existing.docs.length > 0) {
        return Response.json({ ok: true, duplicate: true, svixId: verified.svixId })
      }

      const isSupportedMailEvent = (RESEND_WEBHOOK_EVENT_TYPES as readonly string[]).includes(
        eventType,
      )

      try {
        await req.payload.create({
          collection: MAIL_WEBHOOK_EVENTS_COLLECTION as CollectionSlug,
          overrideAccess: true,
          req,
          context: { ...(req.context ?? {}), skipAuditLog: true },
          data: {
            svixId: verified.svixId,
            eventType,
            resendEmailId: resendEmailId || null,
            svixTimestamp: verified.svixTimestamp,
            processingState: isSupportedMailEvent ? 'queued' : 'ignored',
            attempts: 0,
            ...(isSupportedMailEvent ? {} : { processedAt: new Date().toISOString() }),
            payloadSnapshot: parsed,
          } as Record<string, unknown>,
        })
      } catch (error) {
        if (isDuplicateConstraintError(error)) {
          return Response.json({ ok: true, duplicate: true, svixId: verified.svixId })
        }
        throw error
      }

      if (!isSupportedMailEvent || !resendEmailId) {
        return Response.json({
          ok: true,
          ignored: true,
          svixId: verified.svixId,
          eventType,
        })
      }

      if (eventType === 'email.received') {
        const fromAddr = parseEmailAddress(parsed.data?.from).address
        const threadHintKey = computeDeterministicThreadKey({
          rfcMessageId: parsed.data?.message_id,
          subject: parsed.data?.subject,
          counterpartyEmail: fromAddr,
        })

        await req.payload.jobs.queue({
          workflow: INGEST_INBOUND_WORKFLOW_SLUG as never,
          input: {
            emailId: resendEmailId,
            svixId: verified.svixId,
            threadHintKey,
          } as never,
          queue: MAIL_QUEUE,
          req,
        })
      } else {
        const diagnosticMessage =
          parsed.data?.bounce?.message ||
          parsed.data?.failed?.reason ||
          null

        await req.payload.jobs.queue({
          task: APPLY_TELEMETRY_TASK_SLUG as never,
          input: {
            resendEmailId,
            eventType: eventType as ResendWebhookEventType,
            eventAt: parsed.data?.created_at || parsed.created_at || null,
            svixId: verified.svixId,
            diagnosticMessage,
          } as never,
          queue: MAIL_QUEUE,
          req,
        })
      }

      scheduleBackgroundMailQueueDrain(req.payload)

      return Response.json(
        {
          ok: true,
          queued: true,
          svixId: verified.svixId,
          eventType,
        },
        { status: 202 },
      )
    },
  }
}
