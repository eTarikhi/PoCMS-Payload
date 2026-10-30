import fs from 'node:fs/promises'
import path from 'node:path'
import type { CollectionSlug, Payload, PayloadRequest, WorkflowConfig } from 'payload'

import {
  MAIL_ATTACHMENTS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  SEND_OUTBOUND_WORKFLOW_SLUG,
} from '../constants'
import type { ParsedEmailAddress } from '../types'
import { formatAddressHeader, parseAddressList } from '../services/emailAddress'
import { publishMailStreamEvent } from '../services/realtimeBus'
import {
  ResendApiError,
  sendResendEmail,
  type FetchLike,
  type ResendSendAttachmentInput,
} from '../services/resendClient'
import { recomputeThreadRollups } from '../services/threading'

export type SendOutboundInput = {
  messageDocId: number | string
}

async function resolveOutboundAttachments({
  payload,
  req,
  attachmentIds,
  fetchImpl = fetch,
}: {
  payload: Payload
  req?: PayloadRequest
  attachmentIds: ReadonlyArray<number | string>
  fetchImpl?: FetchLike
}): Promise<ResendSendAttachmentInput[]> {
  const prepared: ResendSendAttachmentInput[] = []

  for (const rawId of attachmentIds) {
    const doc = await payload
      .findByID({
        collection: MAIL_ATTACHMENTS_COLLECTION as CollectionSlug,
        id: rawId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch(() => null)
    if (!doc) continue

    const rec = doc as unknown as Record<string, unknown>
    const storedFilename = typeof rec.filename === 'string' ? rec.filename : ''
    const displayFilename =
      (typeof rec.originalFilename === 'string' && rec.originalFilename.trim()) ||
      storedFilename ||
      'attachment.bin'
    const mimeType =
      (typeof rec.mimeType === 'string' && rec.mimeType) ||
      (typeof rec.declaredMimeType === 'string' && rec.declaredMimeType) ||
      'application/octet-stream'
    const cid = typeof rec.contentId === 'string' && rec.contentId.trim() ? rec.contentId.trim() : undefined

    // Try reading from local staticDir first (`media/mail-attachments`); fallback to remote Blob URL if present.
    if (storedFilename) {
      const localPath = path.resolve(process.cwd(), 'media/mail-attachments', storedFilename)
      const localBuf = await fs.readFile(localPath).catch(() => null)
      if (localBuf) {
        prepared.push({
          filename: displayFilename,
          content: localBuf.toString('base64'),
          content_type: mimeType,
          ...(cid ? { content_id: cid } : {}),
        })
        continue
      }
    }

    const remoteUrl = typeof rec.url === 'string' ? rec.url : ''
    if (remoteUrl.startsWith('https://') || remoteUrl.startsWith('http://')) {
      const resp = await fetchImpl(remoteUrl)
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer())
        prepared.push({
          filename: displayFilename,
          content: buf.toString('base64'),
          content_type: mimeType,
          ...(cid ? { content_id: cid } : {}),
        })
      }
    }
  }

  return prepared
}

export async function dispatchOutboundMessageById({
  payload,
  req,
  messageDocId,
  apiKey,
  fetchImpl,
}: {
  payload: Payload
  req?: PayloadRequest
  messageDocId: number | string
  apiKey: string
  fetchImpl?: FetchLike
}): Promise<{ resendEmailId: string; status: 'sent' | 'failed'; alreadySent: boolean }> {
  const msgDoc = await payload.findByID({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    id: messageDocId,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const rec = msgDoc as unknown as Record<string, unknown>

  // Idempotency guard: never re-dispatch a message that already holds a Resend ID.
  if (typeof rec.resendEmailId === 'string' && rec.resendEmailId.trim()) {
    return {
      resendEmailId: rec.resendEmailId,
      status: 'sent',
      alreadySent: true,
    }
  }

  const threadId =
    typeof rec.thread === 'object' && rec.thread !== null && 'id' in rec.thread
      ? (rec.thread as { id: number | string }).id
      : (rec.thread as number | string)

  const fromHeader = formatAddressHeader({
    name: String(rec.fromName ?? ''),
    address: String(rec.fromAddress ?? ''),
  })
  const toList = parseAddressList(rec.toAddresses as ParsedEmailAddress[] | undefined).map(
    formatAddressHeader,
  )
  const ccList = parseAddressList(rec.ccAddresses as ParsedEmailAddress[] | undefined).map(
    formatAddressHeader,
  )
  const bccList = parseAddressList(rec.bccAddresses as ParsedEmailAddress[] | undefined).map(
    formatAddressHeader,
  )
  const replyToList = parseAddressList(rec.replyToAddresses as ParsedEmailAddress[] | undefined).map(
    formatAddressHeader,
  )

  const headers: Record<string, string> = {}
  if (typeof rec.rfcMessageId === 'string' && rec.rfcMessageId.trim()) {
    headers['Message-ID'] = rec.rfcMessageId.trim()
  }
  if (typeof rec.inReplyTo === 'string' && rec.inReplyTo.trim()) {
    headers['In-Reply-To'] = rec.inReplyTo.trim()
  }
  const refs = Array.isArray(rec.references)
    ? (rec.references as unknown[]).filter((x): x is string => typeof x === 'string' && Boolean(x))
    : []
  if (refs.length > 0) {
    headers.References = refs.join(' ')
  }

  const rawAttachments = Array.isArray(rec.attachments)
    ? (rec.attachments as Array<number | string | { id: number | string }>).map((a) =>
        typeof a === 'object' && a !== null && 'id' in a ? a.id : a,
      )
    : []
  const attachments =
    rawAttachments.length > 0
      ? await resolveOutboundAttachments({
          payload,
          req,
          attachmentIds: rawAttachments,
          fetchImpl,
        })
      : undefined

  try {
    const sent = await sendResendEmail(
      {
        from: fromHeader,
        to: toList,
        ...(ccList.length > 0 ? { cc: ccList } : {}),
        ...(bccList.length > 0 ? { bcc: bccList } : {}),
        ...(replyToList.length > 0 ? { reply_to: replyToList } : {}),
        subject: String(rec.subject ?? '(No subject)'),
        ...(typeof rec.sanitizedHtml === 'string' && rec.sanitizedHtml
          ? { html: rec.sanitizedHtml }
          : {}),
        ...(typeof rec.plainText === 'string' && rec.plainText ? { text: rec.plainText } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
        tags: [
          { name: 'source', value: 'pocms_inbox' },
          { name: 'thread_id', value: String(threadId).replace(/[^A-Za-z0-9_-]/g, '_') },
        ],
      },
      {
        apiKey,
        idempotencyKey: `pocms-mail-msg-${String(messageDocId)}`,
        fetchImpl,
      },
    )

    const nowIso = new Date().toISOString()
    await payload.update({
      collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
      id: messageDocId,
      overrideAccess: true,
      req,
      context: { ...(req?.context ?? {}), skipAuditLog: true },
      data: {
        status: 'sent',
        resendEmailId: sent.id,
        lastEventAt: nowIso,
        errorMessage: null,
      } as Record<string, unknown>,
    })

    await recomputeThreadRollups({ payload, req, threadId })
    await publishMailStreamEvent(payload, {
      type: 'message.sent',
      threadId,
      messageId: messageDocId,
    })

    return {
      resendEmailId: sent.id,
      status: 'sent',
      alreadySent: false,
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const isPermanent = error instanceof ResendApiError && !error.retryable

    await payload.update({
      collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
      id: messageDocId,
      overrideAccess: true,
      req,
      context: { ...(req?.context ?? {}), skipAuditLog: true },
      data: {
        status: isPermanent ? 'failed' : 'queued',
        errorMessage: errMsg.slice(0, 500),
        lastEventAt: new Date().toISOString(),
      } as Record<string, unknown>,
    })

    if (isPermanent) {
      await publishMailStreamEvent(payload, {
        type: 'message.telemetry',
        threadId,
        messageId: messageDocId,
      })
      return {
        resendEmailId: '',
        status: 'failed',
        alreadySent: false,
      }
    }

    throw error
  }
}

export function createSendOutboundWorkflow(options?: {
  getApiKey?: () => string
}): WorkflowConfig<SendOutboundInput> {
  const resolveApiKey = options?.getApiKey ?? (() => process.env.RESEND_API_KEY?.trim() ?? '')

  return {
    slug: SEND_OUTBOUND_WORKFLOW_SLUG as never,
    label: 'Send outbound email',
    retries: 3,
    inputSchema: [{ name: 'messageDocId', type: 'text', required: true }],
    concurrency: {
      key: ({ input }) => `mail:send:${String(input?.messageDocId ?? 'unknown')}`,
      exclusive: true,
      supersedes: false,
    },
    handler: async ({ job, req, inlineTask }) => {
      const input = job.input as SendOutboundInput
      await inlineTask('dispatch-resend-email', {
        retries: 2,
        task: async () => {
          const result = await dispatchOutboundMessageById({
            payload: req.payload,
            req,
            messageDocId: input.messageDocId,
            apiKey: resolveApiKey(),
          })
          return { output: result }
        },
      })
    },
  }
}
