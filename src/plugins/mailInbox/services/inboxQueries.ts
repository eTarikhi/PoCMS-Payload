import { APIError, type CollectionSlug, type Payload, type PayloadRequest, type Where } from 'payload'

import {
  DEFAULT_MAIL_LABELS,
  MAIL_ATTACHMENTS_COLLECTION,
  MAIL_FOLDERS,
  MAIL_LABELS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  MAIL_QUEUE,
  MAIL_THREADS_COLLECTION,
  SEND_OUTBOUND_WORKFLOW_SLUG,
  type MailDeliveryStatus,
  type MailDirection,
  type MailFolder,
} from '../constants'
import { dispatchOutboundMessageById } from '../jobs/outboundWorkflow'
import type {
  BulkThreadsInput,
  ComposeEmailInput,
  InboxFolderCounts,
  InboxSnapshot,
  MailAttachmentDTO,
  MailAuthSummary,
  MailInboxIdentity,
  MailIntegrationState,
  MailLabelDTO,
  MailMessageDTO,
  MailThreadDetailDTO,
  MailThreadSummaryDTO,
  ParsedEmailAddress,
} from '../types'
import {
  buildReplyReferencesChain,
  generateRfcMessageId,
  isValidEmailAddress,
  normalizeMessageId,
  parseAddressList,
} from './emailAddress'
import {
  extractPlainTextFromHtml,
  renderPlainTextToHtml,
  sanitizeEmailHtml,
  splitVisibleReplyAndQuotedHistory,
} from './mimeSanitizer'
import { hasDirectUnpooledPostgresUrl, publishMailStreamEvent } from './realtimeBus'
import { type FetchLike } from './resendClient'
import { recomputeThreadRollups, resolveOrCreateMailThread } from './threading'

export function resolveConfiguredIdentities(
  configured?: readonly MailInboxIdentity[],
  payload?: Payload,
): MailInboxIdentity[] {
  if (configured && configured.length > 0) {
    return [...configured]
  }
  const emailAdapter = payload?.email as
    | { defaultFromAddress?: string; defaultFromName?: string }
    | undefined
  const defaultEmail = emailAdapter?.defaultFromAddress || 'dev@vtarikhi.com'
  const defaultName = emailAdapter?.defaultFromName || 'PoCMS'
  return [
    {
      label: `${defaultName} <${defaultEmail}>`,
      email: defaultEmail,
      default: true,
    },
  ]
}

export function resolveIntegrationState({
  apiKey,
  webhookSecret,
  payload,
}: {
  apiKey?: string
  webhookSecret?: string
  payload?: Payload
}): MailIntegrationState {
  const resolvedApiKey = (apiKey ?? process.env.RESEND_API_KEY ?? '').trim()
  const resolvedSecret = (webhookSecret ?? process.env.RESEND_WEBHOOK_SECRET ?? '').trim()
  const emailAdapter = payload?.email as
    | { defaultFromAddress?: string; defaultFromName?: string }
    | undefined
  const pgCheck = hasDirectUnpooledPostgresUrl()

  return {
    outboundConfigured: Boolean(resolvedApiKey),
    webhookConfigured: Boolean(resolvedSecret),
    realtimeMode: pgCheck.supported ? 'pg_listen' : 'cursor_poll',
    webhookEndpointPath: `${payload?.config?.routes?.api || '/api'}/webhooks/resend`,
    defaultFromEmail: emailAdapter?.defaultFromAddress || 'dev@vtarikhi.com',
    defaultFromName: emailAdapter?.defaultFromName || 'PoCMS',
  }
}

export function mapLabelDoc(raw: unknown): MailLabelDTO | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (rec.id === undefined || rec.id === null) return null
  return {
    id: rec.id as number | string,
    name: String(rec.name ?? 'Label'),
    slug: String(rec.slug ?? 'label'),
    color: typeof rec.color === 'string' && rec.color ? rec.color : '#3B82F6',
    description: typeof rec.description === 'string' ? rec.description : null,
    isSystem: Boolean(rec.isSystem),
  }
}

export function mapAttachmentDoc(raw: unknown): MailAttachmentDTO | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (rec.id === undefined || rec.id === null) return null
  const storedFilename = typeof rec.filename === 'string' ? rec.filename : ''
  const originalFilename =
    (typeof rec.originalFilename === 'string' && rec.originalFilename.trim()) ||
    storedFilename ||
    'attachment.bin'
  const skippedReason =
    typeof rec.skippedReason === 'string' && rec.skippedReason ? rec.skippedReason : null
  const url = skippedReason
    ? null
    : typeof rec.url === 'string' && rec.url
      ? rec.url
      : storedFilename
        ? `/api/${MAIL_ATTACHMENTS_COLLECTION}/file/${encodeURIComponent(storedFilename)}`
        : null

  return {
    id: rec.id as number | string,
    filename: storedFilename || originalFilename,
    originalFilename,
    mimeType:
      (typeof rec.mimeType === 'string' && rec.mimeType) ||
      (typeof rec.declaredMimeType === 'string' && rec.declaredMimeType) ||
      'application/octet-stream',
    filesize:
      typeof rec.filesize === 'number'
        ? rec.filesize
        : typeof rec.declaredSize === 'number'
          ? rec.declaredSize
          : 0,
    url,
    disposition: rec.disposition === 'inline' ? 'inline' : 'attachment',
    contentId: typeof rec.contentId === 'string' ? rec.contentId : null,
    skippedReason,
  }
}

export function mapThreadSummaryDoc(
  raw: Record<string, unknown>,
  labelLookup: ReadonlyMap<string, MailLabelDTO>,
): MailThreadSummaryDTO {
  const rawLabels = Array.isArray(raw.labels) ? raw.labels : []
  const labels: MailLabelDTO[] = []
  for (const item of rawLabels) {
    if (item && typeof item === 'object' && 'name' in item) {
      const mapped = mapLabelDoc(item)
      if (mapped) labels.push(mapped)
    } else if (typeof item === 'number' || typeof item === 'string') {
      const hit = labelLookup.get(String(item))
      if (hit) labels.push(hit)
    }
  }

  const rawSourceForm = raw.sourceFormSubmission
  const sourceFormSubmissionId =
    typeof rawSourceForm === 'number' || typeof rawSourceForm === 'string'
      ? rawSourceForm
      : rawSourceForm && typeof rawSourceForm === 'object' && 'id' in rawSourceForm
        ? (rawSourceForm as { id: number | string }).id
        : null

  return {
    id: raw.id as number | string,
    subject: String(raw.subject ?? '(No subject)'),
    normalizedSubject: String(raw.normalizedSubject ?? '(No subject)'),
    folder: ((raw.folder as MailFolder) || 'inbox'),
    isRead: Boolean(raw.isRead),
    isStarred: Boolean(raw.isStarred),
    hasAttachments: Boolean(raw.hasAttachments),
    hasDraft: Boolean(raw.hasDraft),
    messageCount: typeof raw.messageCount === 'number' ? raw.messageCount : 0,
    unreadCount: typeof raw.unreadCount === 'number' ? raw.unreadCount : 0,
    snippet: String(raw.snippet ?? ''),
    counterpartyName: String(raw.counterpartyName ?? 'Unknown'),
    counterpartyEmail: String(raw.counterpartyEmail ?? ''),
    participants: parseAddressList(raw.participants as ParsedEmailAddress[] | undefined),
    labels,
    lastMessageAt:
      typeof raw.lastMessageAt === 'string'
        ? raw.lastMessageAt
        : typeof raw.updatedAt === 'string'
          ? raw.updatedAt
          : new Date().toISOString(),
    sourceFormSubmissionId,
  }
}

export function mapMessageDoc(raw: Record<string, unknown>): MailMessageDTO {
  const threadId =
    typeof raw.thread === 'object' && raw.thread !== null && 'id' in raw.thread
      ? (raw.thread as { id: number | string }).id
      : (raw.thread as number | string)

  const rawAttachments = Array.isArray(raw.attachments) ? raw.attachments : []
  const attachments = rawAttachments
    .map(mapAttachmentDoc)
    .filter((a): a is MailAttachmentDTO => Boolean(a))

  const refs = Array.isArray(raw.references)
    ? (raw.references as unknown[]).filter((x): x is string => typeof x === 'string')
    : []

  return {
    id: raw.id as number | string,
    threadId,
    direction: ((raw.direction as MailDirection) || 'inbound'),
    status: ((raw.status as MailDeliveryStatus) || 'received'),
    resendEmailId: typeof raw.resendEmailId === 'string' ? raw.resendEmailId : null,
    rfcMessageId: typeof raw.rfcMessageId === 'string' ? raw.rfcMessageId : null,
    inReplyTo: typeof raw.inReplyTo === 'string' ? raw.inReplyTo : null,
    references: refs,
    from: {
      name: String(raw.fromName ?? ''),
      address: String(raw.fromAddress ?? ''),
    },
    to: parseAddressList(raw.toAddresses as ParsedEmailAddress[] | undefined),
    cc: parseAddressList(raw.ccAddresses as ParsedEmailAddress[] | undefined),
    bcc: parseAddressList(raw.bccAddresses as ParsedEmailAddress[] | undefined),
    replyTo: parseAddressList(raw.replyToAddresses as ParsedEmailAddress[] | undefined),
    subject: String(raw.subject ?? '(No subject)'),
    snippet: String(raw.snippet ?? ''),
    sanitizedHtml: String(raw.sanitizedHtml ?? ''),
    plainText: String(raw.plainText ?? ''),
    visibleReplyText: String(raw.visibleReplyText ?? ''),
    quotedHistoryText: String(raw.quotedHistoryText ?? ''),
    hasRemoteImages: Boolean(raw.hasRemoteImages),
    blockedRemoteImages: typeof raw.blockedRemoteImages === 'number' ? raw.blockedRemoteImages : 0,
    attachments,
    sentAt:
      typeof raw.sentAt === 'string'
        ? raw.sentAt
        : typeof raw.createdAt === 'string'
          ? raw.createdAt
          : new Date().toISOString(),
    deliveredAt: typeof raw.deliveredAt === 'string' ? raw.deliveredAt : null,
    bouncedAt: typeof raw.bouncedAt === 'string' ? raw.bouncedAt : null,
    lastEventAt: typeof raw.lastEventAt === 'string' ? raw.lastEventAt : null,
    openCount: typeof raw.openCount === 'number' ? raw.openCount : 0,
    clickCount: typeof raw.clickCount === 'number' ? raw.clickCount : 0,
    errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : null,
    authResults:
      raw.authResults && typeof raw.authResults === 'object'
        ? (raw.authResults as MailAuthSummary)
        : null,
  }
}

export async function collectInboxFolderCounts(
  payload: Payload,
  req?: PayloadRequest,
): Promise<InboxFolderCounts> {
  const countWhere = async (where: Where): Promise<number> => {
    try {
      const res = await payload.count({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        where,
        overrideAccess: true,
        req,
      })
      return res.totalDocs
    } catch {
      return 0
    }
  }

  const [inbox, inboxUnread, starred, sent, archive, spam, spamUnread, trash] = await Promise.all([
    countWhere({ folder: { equals: 'inbox' } }),
    countWhere({
      and: [{ folder: { equals: 'inbox' } }, { isRead: { equals: false } }],
    }),
    countWhere({
      and: [{ isStarred: { equals: true } }, { folder: { not_equals: 'trash' } }],
    }),
    countWhere({ folder: { equals: 'sent' } }),
    countWhere({ folder: { equals: 'archive' } }),
    countWhere({ folder: { equals: 'spam' } }),
    countWhere({
      and: [{ folder: { equals: 'spam' } }, { isRead: { equals: false } }],
    }),
    countWhere({ folder: { equals: 'trash' } }),
  ])

  return {
    inbox,
    inboxUnread,
    starred,
    sent,
    archive,
    spam,
    spamUnread,
    trash,
  }
}

/**
 * Tier-1 Lightweight Inbox Snapshot Query:
 * Projects ONLY conversation header & rollup fields (`mail-threads`), never hydrating HTML/MIME bodies.
 */
export async function collectInboxSnapshot({
  payload,
  req,
  folder = 'inbox',
  starredOnly = false,
  unreadOnly = false,
  labelId,
  search,
  page = 1,
  limit = 40,
  pluginOptions,
}: {
  payload: Payload
  req?: PayloadRequest
  folder?: MailFolder | 'starred'
  starredOnly?: boolean
  unreadOnly?: boolean
  labelId?: string | number | null
  search?: string | null
  page?: number
  limit?: number
  pluginOptions?: {
    apiKey?: string
    webhookSecret?: string
    identities?: readonly MailInboxIdentity[]
  }
}): Promise<InboxSnapshot> {
  const integration = resolveIntegrationState({
    apiKey: pluginOptions?.apiKey,
    webhookSecret: pluginOptions?.webhookSecret,
    payload,
  })
  const identities = resolveConfiguredIdentities(pluginOptions?.identities, payload)

  let labels: MailLabelDTO[] = []
  try {
    const labelRes = await payload.find({
      collection: MAIL_LABELS_COLLECTION as CollectionSlug,
      sort: 'name',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })
    labels = labelRes.docs.map(mapLabelDoc).filter((l): l is MailLabelDTO => Boolean(l))
  } catch {
    labels = []
  }

  const labelLookup = new Map<string, MailLabelDTO>(labels.map((l) => [String(l.id), l]))
  const counts = await collectInboxFolderCounts(payload, req)

  const clauses: Where[] = []
  if (folder === 'starred' || starredOnly) {
    clauses.push({ isStarred: { equals: true } })
    clauses.push({ folder: { not_equals: 'trash' } })
  } else if ((MAIL_FOLDERS as readonly string[]).includes(folder)) {
    clauses.push({ folder: { equals: folder } })
  }

  if (unreadOnly) {
    clauses.push({ isRead: { equals: false } })
  }
  if (labelId !== undefined && labelId !== null && labelId !== '') {
    clauses.push({ labels: { contains: labelId } })
  }

  const trimmedSearch = (search ?? '').trim()
  if (trimmedSearch) {
    const fromPrefixMatch = trimmedSearch.match(/^from:(\S+)(?:\s+(.*))?$/i)
    if (fromPrefixMatch) {
      const senderTerm = fromPrefixMatch[1]
      const restTerm = (fromPrefixMatch[2] ?? '').trim()
      clauses.push({
        or: [
          { counterpartyEmail: { like: senderTerm } },
          { counterpartyName: { like: senderTerm } },
        ],
      })
      if (restTerm) {
        clauses.push({
          or: [{ subject: { like: restTerm } }, { snippet: { like: restTerm } }],
        })
      }
    } else {
      clauses.push({
        or: [
          { subject: { like: trimmedSearch } },
          { snippet: { like: trimmedSearch } },
          { counterpartyName: { like: trimmedSearch } },
          { counterpartyEmail: { like: trimmedSearch } },
        ],
      })
    }
  }

  const where: Where =
    clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { and: clauses }

  try {
    const threadRes = await payload.find({
      collection: MAIL_THREADS_COLLECTION as CollectionSlug,
      where,
      sort: '-lastMessageAt',
      page: Math.max(1, page),
      limit: Math.min(100, Math.max(1, limit)),
      depth: 0,
      overrideAccess: true,
      req,
      select: {
        subject: true,
        normalizedSubject: true,
        folder: true,
        isRead: true,
        isStarred: true,
        hasAttachments: true,
        hasDraft: true,
        messageCount: true,
        unreadCount: true,
        snippet: true,
        counterpartyName: true,
        counterpartyEmail: true,
        participants: true,
        labels: true,
        lastMessageAt: true,
        sourceFormSubmission: true,
        updatedAt: true,
      },
    })

    const threads = (threadRes.docs as unknown as Array<Record<string, unknown>>).map((doc) =>
      mapThreadSummaryDoc(doc, labelLookup),
    )

    return {
      integration,
      identities,
      labels,
      counts,
      threads,
      page: threadRes.page ?? 1,
      totalPages: threadRes.totalPages ?? 1,
      totalDocs: threadRes.totalDocs ?? threads.length,
      serverTime: new Date().toISOString(),
    }
  } catch {
    return {
      integration,
      identities,
      labels,
      counts,
      threads: [],
      page: 1,
      totalPages: 1,
      totalDocs: 0,
      serverTime: new Date().toISOString(),
    }
  }
}

/**
 * Tier-2 Full Thread Hydration:
 * Loads all ordered messages + attachments for a single conversation thread and optionally marks it read.
 */
export async function loadMailThreadDetail({
  payload,
  req,
  threadId,
  markAsRead = true,
}: {
  payload: Payload
  req?: PayloadRequest
  threadId: number | string
  markAsRead?: boolean
}): Promise<MailThreadDetailDTO | null> {
  const threadDoc = await payload
    .findByID({
      collection: MAIL_THREADS_COLLECTION as CollectionSlug,
      id: threadId,
      depth: 1,
      overrideAccess: true,
      req,
    })
    .catch(() => null)

  if (!threadDoc) return null

  const messagesRes = await payload.find({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    where: { thread: { equals: threadId } },
    sort: 'sentAt',
    limit: 200,
    depth: 1,
    overrideAccess: true,
    req,
  })

  const messageDocs = messagesRes.docs as unknown as Array<Record<string, unknown>>

  if (markAsRead) {
    const unreadIds = messageDocs
      .filter((m) => !m.isRead && m.status !== 'draft')
      .map((m) => m.id as number | string)

    if (unreadIds.length > 0) {
      await Promise.all(
        unreadIds.map((id) =>
          payload.update({
            collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
            id,
            overrideAccess: true,
            req,
            context: { ...(req?.context ?? {}), skipAuditLog: true },
            data: { isRead: true } as Record<string, unknown>,
          }),
        ),
      )
      for (const m of messageDocs) {
        if (!m.isRead && m.status !== 'draft') m.isRead = true
      }
      await recomputeThreadRollups({ payload, req, threadId })
      ;(threadDoc as unknown as Record<string, unknown>).isRead = true
      ;(threadDoc as unknown as Record<string, unknown>).unreadCount = 0
      await publishMailStreamEvent(payload, {
        type: 'threads.updated',
        threadId,
      })
    }
  }

  // Hydrate any unpopulated attachment IDs or label IDs (e.g. depth=0 callers or custom adapters)
  const unpopulatedAttachmentIds = new Set<number | string>()
  for (const m of messageDocs) {
    if (Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (typeof att === 'number' || typeof att === 'string') {
          unpopulatedAttachmentIds.add(att)
        }
      }
    }
  }
  if (unpopulatedAttachmentIds.size > 0) {
    const attLookup = new Map<string, Record<string, unknown>>()
    for (const attId of unpopulatedAttachmentIds) {
      const attDoc = await payload
        .findByID({
          collection: MAIL_ATTACHMENTS_COLLECTION as CollectionSlug,
          id: attId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        .catch(() => null)
      if (attDoc) {
        attLookup.set(String(attId), attDoc as unknown as Record<string, unknown>)
      }
    }
    for (const m of messageDocs) {
      if (Array.isArray(m.attachments)) {
        m.attachments = m.attachments.map((att) =>
          typeof att === 'number' || typeof att === 'string'
            ? (attLookup.get(String(att)) ?? att)
            : att,
        )
      }
    }
  }

  const labelLookup = new Map<string, MailLabelDTO>()
  const rawThreadLabels = (threadDoc as unknown as Record<string, unknown>).labels
  if (Array.isArray(rawThreadLabels)) {
    for (const item of rawThreadLabels) {
      if (typeof item === 'number' || typeof item === 'string') {
        const lblDoc = await payload
          .findByID({
            collection: MAIL_LABELS_COLLECTION as CollectionSlug,
            id: item,
            depth: 0,
            overrideAccess: true,
            req,
          })
          .catch(() => null)
        const mapped = mapLabelDoc(lblDoc)
        if (mapped) labelLookup.set(String(item), mapped)
      }
    }
  }

  const summary = mapThreadSummaryDoc(
    threadDoc as unknown as Record<string, unknown>,
    labelLookup,
  )
  const rec = threadDoc as unknown as Record<string, unknown>

  return {
    ...summary,
    threadKey: String(rec.threadKey ?? ''),
    messages: messageDocs.map(mapMessageDoc),
  }
}

/**
 * Composes, saves as draft, or dispatches an outbound email / thread reply with full RFC 5322
 * `Message-ID`, `In-Reply-To`, and `References` continuity.
 */
export async function composeOrSendMail({
  payload,
  req,
  input,
  apiKey,
  identities,
  runImmediate = true,
  fetchImpl,
}: {
  payload: Payload
  req?: PayloadRequest
  input: ComposeEmailInput
  apiKey?: string
  identities?: readonly MailInboxIdentity[]
  runImmediate?: boolean
  fetchImpl?: FetchLike
}): Promise<{
  threadId: number | string
  message: MailMessageDTO
  dispatched: boolean
}> {
  const configuredIdentities = resolveConfiguredIdentities(identities, payload)
  const defaultIdentity =
    configuredIdentities.find((i) => i.default) ?? configuredIdentities[0]

  const requestedFrom = (input.fromEmail ?? '').trim().toLowerCase()
  const matchedIdentity = configuredIdentities.find(
    (i) => i.email.toLowerCase() === requestedFrom,
  )
  const senderEmail = matchedIdentity?.email ?? defaultIdentity.email
  const senderName =
    (input.fromName ?? '').trim() ||
    matchedIdentity?.label.replace(/<[^>]+>/g, '').trim() ||
    'PoCMS'

  const toList = parseAddressList(input.to)
  const ccList = parseAddressList(input.cc)
  const bccList = parseAddressList(input.bcc)
  const replyToList = parseAddressList(input.replyTo)

  const saveAsDraft = Boolean(input.saveAsDraft)
  if (!saveAsDraft) {
    if (toList.length === 0 || !toList.every((item) => isValidEmailAddress(item.address))) {
      throw new APIError('At least one valid recipient email address ("to") is required.', 400)
    }
  }

  const subject = (input.subject ?? '').trim() || '(No subject)'
  const rawHtml = (input.html ?? '').trim()
  const rawText = (input.text ?? '').trim()

  if (!saveAsDraft && !rawHtml && !rawText) {
    throw new APIError('Email body cannot be empty.', 400)
  }

  const sanitizedHtml = rawHtml
    ? sanitizeEmailHtml(rawHtml, { allowRemoteImages: true }).sanitizedHtml
    : renderPlainTextToHtml(rawText)
  const plainText = rawText || extractPlainTextFromHtml(sanitizedHtml)
  const { visibleReplyText, quotedHistoryText, snippet } = splitVisibleReplyAndQuotedHistory(
    plainText,
    sanitizedHtml,
  )

  // Inspect parent message if replying inside an existing thread to chain RFC 5322 headers
  let inReplyTo = ''
  let references: string[] = []
  if (input.replyToMessageId) {
    const parentMsg = await payload
      .findByID({
        collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
        id: input.replyToMessageId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch(() => null)
    if (parentMsg) {
      const pRec = parentMsg as unknown as Record<string, unknown>
      const parentRfcId = normalizeMessageId(pRec.rfcMessageId as string | undefined)
      const parentRefs = Array.isArray(pRec.references)
        ? (pRec.references as string[])
        : []
      if (parentRfcId) {
        inReplyTo = parentRfcId
        references = buildReplyReferencesChain(parentRefs, parentRfcId)
      }
    }
  } else if (input.replyToThreadId) {
    const latestInThread = await payload.find({
      collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
      where: {
        and: [
          { thread: { equals: input.replyToThreadId } },
          { status: { not_equals: 'draft' } },
        ],
      },
      sort: '-sentAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const latestDoc = latestInThread.docs[0] as unknown as Record<string, unknown> | undefined
    if (latestDoc) {
      const parentRfcId = normalizeMessageId(latestDoc.rfcMessageId as string | undefined)
      const parentRefs = Array.isArray(latestDoc.references)
        ? (latestDoc.references as string[])
        : []
      if (parentRfcId) {
        inReplyTo = parentRfcId
        references = buildReplyReferencesChain(parentRefs, parentRfcId)
      }
    }
  }

  const rfcMessageId = generateRfcMessageId(senderEmail)
  const nowIso = new Date().toISOString()
  const primaryRecipient = toList[0] ?? { name: 'Draft recipient', address: '' }

  const { threadId } = await resolveOrCreateMailThread({
    payload,
    req,
    explicitThreadId: input.replyToThreadId,
    rfcMessageId,
    inReplyTo,
    references,
    subject,
    counterparty: primaryRecipient,
    initialFolder: 'sent',
    nowIso,
  })

  const resolvedApiKey = (apiKey ?? process.env.RESEND_API_KEY ?? '').trim()
  if (!saveAsDraft && !resolvedApiKey) {
    throw new APIError(
      'RESEND_API_KEY is not configured. Save as draft or configure RESEND_API_KEY to dispatch live emails.',
      503,
    )
  }

  const messagePayloadData: Record<string, unknown> = {
    thread: threadId,
    direction: 'outbound',
    status: saveAsDraft ? 'draft' : 'queued',
    isRead: true,
    rfcMessageId,
    inReplyTo: inReplyTo || null,
    references,
    fromAddress: senderEmail,
    fromName: senderName,
    toAddresses: toList,
    ccAddresses: ccList,
    bccAddresses: bccList,
    replyToAddresses: replyToList,
    subject,
    snippet,
    sanitizedHtml,
    plainText,
    visibleReplyText,
    quotedHistoryText,
    hasRemoteImages: false,
    blockedRemoteImages: 0,
    attachments: input.attachmentIds ?? [],
    sentAt: nowIso,
    lastEventAt: nowIso,
  }

  // Note: Do NOT pass `skipAuditLog: true` here so authenticated human-composed emails ARE recorded in AuditLogs!
  const messageDoc = input.draftMessageId
    ? await payload.update({
        collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
        id: input.draftMessageId,
        overrideAccess: true,
        req,
        data: messagePayloadData,
      })
    : await payload.create({
        collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
        overrideAccess: true,
        req,
        data: messagePayloadData,
      })

  await recomputeThreadRollups({ payload, req, threadId })

  if (saveAsDraft) {
    const hydrated = await payload.findByID({
      collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
      id: messageDoc.id,
      depth: 1,
      overrideAccess: true,
      req,
    })
    return {
      threadId,
      message: mapMessageDoc(hydrated as unknown as Record<string, unknown>),
      dispatched: false,
    }
  }

  if (runImmediate) {
    try {
      await dispatchOutboundMessageById({
        payload,
        req,
        messageDocId: messageDoc.id,
        apiKey: resolvedApiKey,
        fetchImpl,
      })
    } catch {
      // Transient 429/5xx failure: enqueue onto durable `mail` job queue for exponential backoff retry!
      await payload.jobs.queue({
        workflow: SEND_OUTBOUND_WORKFLOW_SLUG as never,
        input: { messageDocId: String(messageDoc.id) } as never,
        queue: MAIL_QUEUE,
        req,
      })
    }
  } else {
    await payload.jobs.queue({
      workflow: SEND_OUTBOUND_WORKFLOW_SLUG as never,
      input: { messageDocId: String(messageDoc.id) } as never,
      queue: MAIL_QUEUE,
      req,
    })
  }

  const finalDoc = await payload.findByID({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    id: messageDoc.id,
    depth: 1,
    overrideAccess: true,
    req,
  })

  return {
    threadId,
    message: mapMessageDoc(finalDoc as unknown as Record<string, unknown>),
    dispatched: (finalDoc as unknown as { status?: string }).status === 'sent',
  }
}

/**
 * Executes bulk triage actions across one or more threads (`markRead`, `markUnread`, `star`, `unstar`,
 * `moveFolder`, `addLabel`, `removeLabel`, `deletePermanent`).
 */
export async function executeBulkThreadAction({
  payload,
  req,
  input,
}: {
  payload: Payload
  req?: PayloadRequest
  input: BulkThreadsInput
}): Promise<{ updatedCount: number }> {
  const uniqueIds = Array.from(new Set(input.threadIds ?? [])).filter(
    (id) => id !== null && id !== undefined && id !== '',
  )
  if (uniqueIds.length === 0) {
    return { updatedCount: 0 }
  }

  let updatedCount = 0

  for (const threadId of uniqueIds) {
    if (input.action === 'deletePermanent') {
      const childMsgs = await payload.find({
        collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
        where: { thread: { equals: threadId } },
        limit: 500,
        depth: 0,
        overrideAccess: true,
        req,
      })
      const attachmentIdsToDelete = new Set<number | string>()
      for (const msg of childMsgs.docs) {
        const rec = msg as unknown as Record<string, unknown>
        if (Array.isArray(rec.attachments)) {
          for (const att of rec.attachments) {
            const id = typeof att === 'object' && att !== null && 'id' in att ? (att as { id: number | string }).id : (att as number | string)
            if (id !== undefined && id !== null) attachmentIdsToDelete.add(id)
          }
        }
        await payload.delete({
          collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
          id: msg.id,
          overrideAccess: true,
          req,
          context: { ...(req?.context ?? {}), skipAuditLog: true },
        })
      }
      for (const attId of attachmentIdsToDelete) {
        await payload
          .delete({
            collection: MAIL_ATTACHMENTS_COLLECTION as CollectionSlug,
            id: attId,
            overrideAccess: true,
            req,
            context: { ...(req?.context ?? {}), skipAuditLog: true },
          })
          .catch(() => null)
      }
      await payload.delete({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        id: threadId,
        overrideAccess: true,
        req,
      })
      updatedCount += 1
      continue
    }

    if (input.action === 'markRead' || input.action === 'markUnread') {
      const targetRead = input.action === 'markRead'
      const childMsgs = await payload.find({
        collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
        where: { thread: { equals: threadId } },
        limit: 250,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (targetRead) {
        for (const msg of childMsgs.docs) {
          if (!(msg as unknown as { isRead?: boolean }).isRead) {
            await payload.update({
              collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
              id: msg.id,
              overrideAccess: true,
              req,
              context: { ...(req?.context ?? {}), skipAuditLog: true },
              data: { isRead: true } as Record<string, unknown>,
            })
          }
        }
      } else if (childMsgs.docs.length > 0) {
        // Mark the latest non-draft message unread so unreadCount reflects accurately.
        const lastNonDraft = [...childMsgs.docs]
          .reverse()
          .find((m) => (m as unknown as { status?: string }).status !== 'draft')
        if (lastNonDraft) {
          await payload.update({
            collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
            id: lastNonDraft.id,
            overrideAccess: true,
            req,
            context: { ...(req?.context ?? {}), skipAuditLog: true },
            data: { isRead: false } as Record<string, unknown>,
          })
        }
      }
      await recomputeThreadRollups({ payload, req, threadId })
      updatedCount += 1
      continue
    }

    if (input.action === 'star' || input.action === 'unstar') {
      await payload.update({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        id: threadId,
        overrideAccess: true,
        req,
        context: { ...(req?.context ?? {}), skipAuditLog: true },
        data: { isStarred: input.action === 'star' } as Record<string, unknown>,
      })
      updatedCount += 1
      continue
    }

    if (input.action === 'moveFolder' && input.folder && (MAIL_FOLDERS as readonly string[]).includes(input.folder)) {
      await payload.update({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        id: threadId,
        overrideAccess: true,
        req,
        data: { folder: input.folder } as Record<string, unknown>,
      })
      updatedCount += 1
      continue
    }

    if ((input.action === 'addLabel' || input.action === 'removeLabel') && input.labelId !== undefined) {
      const existing = await payload
        .findByID({
          collection: MAIL_THREADS_COLLECTION as CollectionSlug,
          id: threadId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        .catch(() => null)
      if (!existing) continue
      const rec = existing as unknown as Record<string, unknown>
      const currentIds = Array.isArray(rec.labels)
        ? (rec.labels as Array<number | string | { id: number | string }>).map((l) =>
            typeof l === 'object' && l !== null && 'id' in l ? l.id : l,
          )
        : []
      const nextSet = new Map<string, number | string>(
        currentIds.map((id) => [String(id), id]),
      )
      if (input.action === 'addLabel') {
        nextSet.set(String(input.labelId), input.labelId)
      } else {
        nextSet.delete(String(input.labelId))
      }
      await payload.update({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        id: threadId,
        overrideAccess: true,
        req,
        context: { ...(req?.context ?? {}), skipAuditLog: true },
        data: { labels: Array.from(nextSet.values()) } as Record<string, unknown>,
      })
      updatedCount += 1
    }
  }

  if (updatedCount > 0) {
    await publishMailStreamEvent(payload, {
      type: 'threads.updated',
      threadId: uniqueIds[0],
    })
  }

  return { updatedCount }
}

/** Idempotently seeds default inbox labels (`Lead`, `CV Request`, `Client`, `Urgent`) on `onInit`. */
export async function ensureDefaultMailLabels(payload: Payload): Promise<void> {
  try {
    for (const def of DEFAULT_MAIL_LABELS) {
      const existing = await payload.find({
        collection: MAIL_LABELS_COLLECTION as CollectionSlug,
        where: { slug: { equals: def.slug } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (existing.docs.length === 0) {
        await payload.create({
          collection: MAIL_LABELS_COLLECTION as CollectionSlug,
          overrideAccess: true,
          context: { skipAuditLog: true },
          data: {
            name: def.name,
            slug: def.slug,
            color: def.color,
            description: def.description,
            isSystem: def.isSystem,
          } as Record<string, unknown>,
        })
      }
    }
  } catch (error) {
    payload?.logger?.warn?.(
      `[mail-inbox] Skipping default mail label bootstrap until schema is migrated: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
