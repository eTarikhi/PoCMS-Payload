import type { CollectionSlug, Payload, PayloadRequest, WorkflowConfig } from 'payload'

import {
  DEFAULT_MAX_ATTACHMENT_BYTES,
  INGEST_INBOUND_WORKFLOW_SLUG,
  MAIL_ATTACHMENTS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  MAIL_WEBHOOK_EVENTS_COLLECTION,
} from '../constants'
import type { MailAuthSummary } from '../types'
import {
  normalizeMessageId,
  parseAddressList,
  parseEmailAddress,
  parseReferencesHeader,
} from '../services/emailAddress'
import {
  renderPlainTextToHtml,
  sanitizeEmailHtml,
  splitVisibleReplyAndQuotedHistory,
} from '../services/mimeSanitizer'
import { publishMailStreamEvent } from '../services/realtimeBus'
import {
  downloadSignedAttachment,
  fetchReceivedEmail,
  listReceivedAttachments,
  type FetchLike,
  type ResendReceivedEmail,
  type ResendSignedAttachment,
} from '../services/resendClient'
import {
  computeDeterministicThreadKey,
  recomputeThreadRollups,
  resolveOrCreateMailThread,
} from '../services/threading'

export type IngestInboundInput = {
  emailId: string
  svixId?: string | null
  threadHintKey?: string | null
}

function getCaseInsensitiveHeader(
  headers: Record<string, string> | null | undefined,
  target: string,
): string {
  if (!headers || typeof headers !== 'object') return ''
  const lower = target.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && typeof v === 'string') {
      return v
    }
  }
  return ''
}

export function parseAuthenticationResults(
  headers: Record<string, string> | null | undefined,
): MailAuthSummary | null {
  const raw =
    getCaseInsensitiveHeader(headers, 'authentication-results') ||
    getCaseInsensitiveHeader(headers, 'arc-authentication-results')
  if (!raw) return null

  const extractToken = (mech: 'spf' | 'dkim' | 'dmarc'): string | null => {
    const re = new RegExp(`\\b${mech}=([a-z0-9_-]+)`, 'i')
    const match = raw.match(re)
    return match ? match[1].toLowerCase() : null
  }

  const spf = extractToken('spf')
  const dkim = extractToken('dkim')
  const dmarc = extractToken('dmarc')
  if (!spf && !dkim && !dmarc) return null
  return { spf, dkim, dmarc }
}

export async function markWebhookLedgerState({
  payload,
  req,
  svixId,
  state,
  errorMessage,
}: {
  payload: Payload
  req?: PayloadRequest
  svixId?: string | null
  state: 'processed' | 'ignored' | 'failed'
  errorMessage?: string | null
}): Promise<void> {
  if (!svixId) return
  try {
    const found = await payload.find({
      collection: MAIL_WEBHOOK_EVENTS_COLLECTION as CollectionSlug,
      where: { svixId: { equals: svixId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const doc = found.docs[0] as unknown as Record<string, unknown> | undefined
    if (!doc?.id) return

    const prevAttempts = typeof doc.attempts === 'number' ? doc.attempts : 0
    await payload.update({
      collection: MAIL_WEBHOOK_EVENTS_COLLECTION as CollectionSlug,
      id: doc.id as number | string,
      overrideAccess: true,
      req,
      context: { ...(req?.context ?? {}), skipAuditLog: true },
      data: {
        processingState: state,
        attempts: prevAttempts + 1,
        processedAt: new Date().toISOString(),
        errorMessage: errorMessage ?? null,
      } as Record<string, unknown>,
    })
  } catch {
    // Non-fatal if webhook ledger row was pruned or absent.
  }
}

export async function mirrorInboundAttachments({
  payload,
  req,
  signedAttachments,
  maxAttachmentBytes = DEFAULT_MAX_ATTACHMENT_BYTES,
  fetchImpl,
}: {
  payload: Payload
  req?: PayloadRequest
  signedAttachments: readonly ResendSignedAttachment[]
  maxAttachmentBytes?: number
  fetchImpl?: FetchLike
}): Promise<{
  attachmentDocIds: Array<number | string>
  cidUrlMap: Record<string, string>
}> {
  const attachmentDocIds: Array<number | string> = []
  const cidUrlMap: Record<string, string> = {}

  for (const att of signedAttachments) {
    const existing = att.id
      ? await payload.find({
          collection: MAIL_ATTACHMENTS_COLLECTION as CollectionSlug,
          where: { resendAttachmentId: { equals: att.id } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
      : { docs: [] }

    if (existing.docs[0]) {
      const existingDoc = existing.docs[0] as unknown as Record<string, unknown>
      attachmentDocIds.push(existing.docs[0].id)
      const cid = typeof att.content_id === 'string' ? att.content_id.replace(/^<|>$/g, '').trim() : ''
      if (cid && typeof existingDoc.url === 'string' && existingDoc.url) {
        cidUrlMap[cid] = existingDoc.url
      }
      continue
    }

    const originalFilename = (att.filename ?? '').trim() || `attachment-${att.id || 'file'}.bin`
    const disposition = att.content_disposition === 'inline' ? 'inline' : 'attachment'
    const cleanCid =
      typeof att.content_id === 'string' ? att.content_id.replace(/^<|>$/g, '').trim() : ''

    const downloaded = await downloadSignedAttachment(att.download_url, {
      maxBytes: maxAttachmentBytes,
      declaredSize: att.size,
      fetchImpl,
    })

    if (downloaded.skipped) {
      const placeholder = await payload.create({
        collection: MAIL_ATTACHMENTS_COLLECTION as CollectionSlug,
        overrideAccess: true,
        req,
        context: { ...(req?.context ?? {}), skipAuditLog: true },
        data: {
          originalFilename,
          resendAttachmentId: att.id || null,
          disposition,
          contentId: cleanCid || null,
          declaredSize: att.size ?? null,
          declaredMimeType: att.content_type || 'application/octet-stream',
          skippedReason: downloaded.reason,
        } as Record<string, unknown>,
      })
      attachmentDocIds.push(placeholder.id)
      continue
    }

    const mimeType =
      att.content_type || downloaded.contentType || 'application/octet-stream'

    const saved = await payload.create({
      collection: MAIL_ATTACHMENTS_COLLECTION as CollectionSlug,
      overrideAccess: true,
      req,
      context: { ...(req?.context ?? {}), skipAuditLog: true },
      file: {
        data: downloaded.buffer,
        mimetype: mimeType,
        name: originalFilename,
        size: downloaded.buffer.length,
      },
      data: {
        originalFilename,
        resendAttachmentId: att.id || null,
        disposition,
        contentId: cleanCid || null,
        sha256: downloaded.sha256,
        declaredSize: downloaded.buffer.length,
        declaredMimeType: mimeType,
      } as Record<string, unknown>,
    })

    attachmentDocIds.push(saved.id)
    const savedRec = saved as unknown as Record<string, unknown>
    const resolvedUrl =
      typeof savedRec.url === 'string' && savedRec.url
        ? savedRec.url
        : typeof savedRec.filename === 'string' && savedRec.filename
          ? `/api/${MAIL_ATTACHMENTS_COLLECTION}/file/${encodeURIComponent(savedRec.filename)}`
          : ''

    if (cleanCid && resolvedUrl) {
      cidUrlMap[cleanCid] = resolvedUrl
    }
  }

  return { attachmentDocIds, cidUrlMap }
}

export async function persistInboundEmailMessage({
  payload,
  req,
  receivedEmail,
  attachmentDocIds,
  cidUrlMap,
  svixId,
}: {
  payload: Payload
  req?: PayloadRequest
  receivedEmail: ResendReceivedEmail
  attachmentDocIds: Array<number | string>
  cidUrlMap: Record<string, string>
  svixId?: string | null
}): Promise<{
  threadId: number | string
  messageId: number | string
  duplicate: boolean
}> {
  // Idempotency guard: if Resend email_id was already ingested, return existing doc cleanly.
  const duplicateCheck = await payload.find({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    where: { resendEmailId: { equals: receivedEmail.id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (duplicateCheck.docs[0]) {
    const existingMsg = duplicateCheck.docs[0] as unknown as Record<string, unknown>
    const existingThreadId =
      typeof existingMsg.thread === 'object' && existingMsg.thread !== null && 'id' in existingMsg.thread
        ? (existingMsg.thread as { id: number | string }).id
        : (existingMsg.thread as number | string)
    await markWebhookLedgerState({ payload, req, svixId, state: 'processed' })
    return {
      threadId: existingThreadId,
      messageId: duplicateCheck.docs[0].id,
      duplicate: true,
    }
  }

  const fromParsed = parseEmailAddress(receivedEmail.from)
  const toList = parseAddressList(receivedEmail.to)
  const ccList = parseAddressList(receivedEmail.cc)
  const bccList = parseAddressList(receivedEmail.bcc)
  const replyToList = parseAddressList(receivedEmail.reply_to)

  const headers = receivedEmail.headers ?? {}
  const rfcMessageId =
    normalizeMessageId(receivedEmail.message_id) ||
    normalizeMessageId(getCaseInsensitiveHeader(headers, 'message-id'))
  const inReplyTo = normalizeMessageId(getCaseInsensitiveHeader(headers, 'in-reply-to'))
  const references = parseReferencesHeader(getCaseInsensitiveHeader(headers, 'references'))
  const authResults = parseAuthenticationResults(headers)

  const sanitized = receivedEmail.html
    ? sanitizeEmailHtml(receivedEmail.html, { cidUrlMap })
    : {
        sanitizedHtml: renderPlainTextToHtml(receivedEmail.text),
        hasRemoteImages: false,
        blockedRemoteImages: 0,
        resolvedCidCount: 0,
      }

  const { fullPlainText, visibleReplyText, quotedHistoryText, snippet } =
    splitVisibleReplyAndQuotedHistory(receivedEmail.text, receivedEmail.html)

  // Auto-route high-confidence DMARC+SPF failures directly to Spam while keeping normal mail in Inbox.
  const isSuspiciousSpam =
    authResults?.dmarc === 'fail' && authResults?.spf === 'fail' && authResults?.dkim === 'fail'
  const targetFolder = isSuspiciousSpam ? 'spam' : 'inbox'

  const sentAtIso = receivedEmail.created_at
    ? new Date(receivedEmail.created_at).toISOString()
    : new Date().toISOString()

  const counterparty = replyToList[0]?.address ? replyToList[0] : fromParsed

  const { threadId } = await resolveOrCreateMailThread({
    payload,
    req,
    rfcMessageId,
    inReplyTo,
    references,
    subject: receivedEmail.subject,
    counterparty: {
      name: fromParsed.name || counterparty.name,
      address: counterparty.address || fromParsed.address,
    },
    initialFolder: targetFolder,
    nowIso: sentAtIso,
  })

  const createdMessage = await payload.create({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    overrideAccess: true,
    req,
    context: { ...(req?.context ?? {}), skipAuditLog: true },
    data: {
      thread: threadId,
      direction: 'inbound',
      status: 'received',
      isRead: false,
      resendEmailId: receivedEmail.id,
      rfcMessageId: rfcMessageId || null,
      inReplyTo: inReplyTo || null,
      references,
      fromAddress: fromParsed.address || 'unknown@invalid.local',
      fromName: fromParsed.name || '',
      toAddresses: toList,
      ccAddresses: ccList,
      bccAddresses: bccList,
      replyToAddresses: replyToList,
      subject: (receivedEmail.subject ?? '').trim() || '(No subject)',
      snippet,
      sanitizedHtml: sanitized.sanitizedHtml,
      plainText: fullPlainText,
      visibleReplyText,
      quotedHistoryText,
      hasRemoteImages: sanitized.hasRemoteImages,
      blockedRemoteImages: sanitized.blockedRemoteImages,
      attachments: attachmentDocIds,
      sentAt: sentAtIso,
      lastEventAt: sentAtIso,
      authResults,
      headersSnapshot: headers,
    } as Record<string, unknown>,
  })

  await recomputeThreadRollups({
    payload,
    req,
    threadId,
    reopenInboxOnInbound: targetFolder === 'inbox',
  })

  await markWebhookLedgerState({ payload, req, svixId, state: 'processed' })

  await publishMailStreamEvent(payload, {
    type: 'message.received',
    threadId,
    messageId: createdMessage.id,
  })

  return {
    threadId,
    messageId: createdMessage.id,
    duplicate: false,
  }
}

/**
 * Full end-to-end inbound ingestion helper (also callable directly in tests with a custom `fetchImpl`).
 */
export async function ingestReceivedEmailEndToEnd({
  payload,
  req,
  emailId,
  svixId,
  apiKey,
  maxAttachmentBytes = DEFAULT_MAX_ATTACHMENT_BYTES,
  fetchImpl,
}: {
  payload: Payload
  req?: PayloadRequest
  emailId: string
  svixId?: string | null
  apiKey: string
  maxAttachmentBytes?: number
  fetchImpl?: FetchLike
}) {
  const receivedEmail = await fetchReceivedEmail(emailId, { apiKey, fetchImpl })
  const hasInboundAttachments =
    Array.isArray(receivedEmail.attachments) && receivedEmail.attachments.length > 0
  const signedAttachments = hasInboundAttachments
    ? await listReceivedAttachments(emailId, { apiKey, fetchImpl })
    : []

  const { attachmentDocIds, cidUrlMap } = await mirrorInboundAttachments({
    payload,
    req,
    signedAttachments,
    maxAttachmentBytes,
    fetchImpl,
  })

  return persistInboundEmailMessage({
    payload,
    req,
    receivedEmail,
    attachmentDocIds,
    cidUrlMap,
    svixId,
  })
}

/**
 * Payload v3.90.2 Checkpointed Workflow (`ingestInboundEmail`):
 * Uses `inlineTask` checkpoints so if Step 3 fails transiently, Steps 1 & 2 do not re-download
 * attachments from Resend, and uses `concurrency` locking per conversation thread key!
 */
export function createIngestInboundWorkflow(options?: {
  getApiKey?: () => string
  maxAttachmentBytes?: number
}): WorkflowConfig<IngestInboundInput> {
  const resolveApiKey = options?.getApiKey ?? (() => process.env.RESEND_API_KEY?.trim() ?? '')
  const maxBytes = options?.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES

  return {
    slug: INGEST_INBOUND_WORKFLOW_SLUG as never,
    label: 'Ingest inbound email',
    retries: 3,
    inputSchema: [
      { name: 'emailId', type: 'text', required: true },
      { name: 'svixId', type: 'text' },
      { name: 'threadHintKey', type: 'text' },
    ],
    concurrency: {
      key: ({ input }) => {
        const hint = input?.threadHintKey?.trim()
        return hint ? `mail:thread:${hint}` : `mail:inbound:${input?.emailId ?? 'unknown'}`
      },
      exclusive: true,
      supersedes: false,
    },
    handler: async ({ job, req, inlineTask }) => {
      const input = job.input as IngestInboundInput
      const apiKey = resolveApiKey()

      try {
        const fetched = await inlineTask('fetch-inbound', {
          retries: 2,
          task: async () => {
            const email = await fetchReceivedEmail(input.emailId, { apiKey })
            const attachments =
              Array.isArray(email.attachments) && email.attachments.length > 0
                ? await listReceivedAttachments(input.emailId, { apiKey })
                : []
            return {
              output: {
                email,
                attachments,
              },
            }
          },
        })

        const mirrored = await inlineTask('mirror-attachments', {
          retries: 2,
          task: async () => {
            const out = await mirrorInboundAttachments({
              payload: req.payload,
              req,
              signedAttachments: fetched.attachments,
              maxAttachmentBytes: maxBytes,
            })
            return { output: out }
          },
        })

        await inlineTask('persist-message', {
          retries: 1,
          task: async () => {
            const out = await persistInboundEmailMessage({
              payload: req.payload,
              req,
              receivedEmail: fetched.email,
              attachmentDocIds: mirrored.attachmentDocIds,
              cidUrlMap: mirrored.cidUrlMap,
              svixId: input.svixId,
            })
            return { output: out }
          },
        })
      } catch (error) {
        await markWebhookLedgerState({
          payload: req.payload,
          req,
          svixId: input.svixId,
          state: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  }
}

export { computeDeterministicThreadKey }
