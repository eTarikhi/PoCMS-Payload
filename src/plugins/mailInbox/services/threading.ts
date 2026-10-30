import crypto from 'node:crypto'
import type { CollectionSlug, Payload, PayloadRequest, Where } from 'payload'

import {
  MAIL_MESSAGES_COLLECTION,
  MAIL_THREADS_COLLECTION,
  SUBJECT_THREAD_WINDOW_DAYS,
  type MailFolder,
} from '../constants'
import type { ParsedEmailAddress } from '../types'
import {
  extractEmailDomain,
  normalizeMessageId,
  parseAddressList,
  parseReferencesHeader,
} from './emailAddress'

const FREEMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'zoho.com',
  'fastmail.com',
  'hey.com',
])

const REPLY_FORWARD_PREFIX_RE =
  /^(?:\s*(?:\[[^\]]{1,24}\]\s*)*(?:re|fwd?|aw|wg|sv|antw|vs|tr)(?:\[\d+\])?\s*:\s*)+/i

/**
 * Strips iterative `Re:`, `Fwd:`, `AW:`, `WG:`, `SV:`, and `[EXTERNAL]` prefixes and collapses
 * whitespace so subject-based fallback threading groups replies reliably.
 */
export function normalizeConversationSubject(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '')
    .replace(/[\r\n\0]+/g, ' ')
    .replace(REPLY_FORWARD_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || '(No subject)'
}

export function isFreemailDomain(domain: string): boolean {
  return FREEMAIL_DOMAINS.has(domain.trim().toLowerCase())
}

/**
 * Computes a deterministic concurrency & lookup key for a message's conversation thread:
 * - Prefers the root RFC 5322 Message-ID (`references[0]` -> `inReplyTo` -> `rfcMessageId`) when threading headers exist.
 * - Falls back to a normalized subject + counterparty hash.
 */
export function computeDeterministicThreadKey({
  rfcMessageId,
  inReplyTo,
  references,
  subject,
  counterpartyEmail,
}: {
  rfcMessageId?: string | null
  inReplyTo?: string | null
  references?: readonly string[] | string | null
  subject?: string | null
  counterpartyEmail?: string | null
}): string {
  const refs = parseReferencesHeader(references)
  const normInReplyTo = normalizeMessageId(inReplyTo)
  const normOwnId = normalizeMessageId(rfcMessageId)

  const anchorId = refs[0] || normInReplyTo
  if (anchorId) {
    const digest = crypto.createHash('sha256').update(anchorId.toLowerCase()).digest('hex').slice(0, 32)
    return `rfc:${digest}`
  }

  const normSubject = normalizeConversationSubject(subject).toLowerCase()
  const cp = (counterpartyEmail ?? '').trim().toLowerCase()
  if (cp && normSubject !== '(no subject)') {
    const digest = crypto
      .createHash('sha256')
      .update(`${cp}::${normSubject}`)
      .digest('hex')
      .slice(0, 32)
    return `subj:${digest}`
  }

  if (normOwnId) {
    const digest = crypto.createHash('sha256').update(normOwnId.toLowerCase()).digest('hex').slice(0, 32)
    return `msg:${digest}`
  }

  return `rnd:${crypto.randomBytes(16).toString('hex')}`
}

/**
 * Three-tier conversation thread resolver:
 * 1. Exact RFC 5322 `In-Reply-To` / `References` lookup against existing `mail-messages.rfcMessageId`.
 * 2. Deterministic `threadKey` lookup on `mail-threads`.
 * 3. Active 30-day normalized-subject + counterparty email fallback (excluding trashed/spam threads).
 */
export async function resolveOrCreateMailThread({
  payload,
  req,
  explicitThreadId,
  rfcMessageId,
  inReplyTo,
  references,
  subject,
  counterparty,
  initialFolder,
  nowIso = new Date().toISOString(),
}: {
  payload: Payload
  req?: PayloadRequest
  explicitThreadId?: number | string | null
  rfcMessageId?: string | null
  inReplyTo?: string | null
  references?: readonly string[] | string | null
  subject?: string | null
  counterparty: ParsedEmailAddress
  initialFolder: MailFolder
  nowIso?: string
}): Promise<{ threadId: number | string; threadKey: string; created: boolean }> {
  const normalizedSubject = normalizeConversationSubject(subject)
  const cleanSubject = String(subject ?? '').trim() || '(No subject)'
  const refs = parseReferencesHeader(references)
  const normInReplyTo = normalizeMessageId(inReplyTo)

  if (explicitThreadId !== null && explicitThreadId !== undefined && explicitThreadId !== '') {
    const existing = await payload
      .findByID({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        id: explicitThreadId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch(() => null)
    if (existing) {
      const rec = existing as unknown as Record<string, unknown>
      return {
        threadId: existing.id,
        threadKey: String(rec.threadKey ?? `id:${existing.id}`),
        created: false,
      }
    }
  }

  // Tier 1: Exact RFC 5322 header graph match (`In-Reply-To` + `References`)
  const candidateRfcIds = Array.from(new Set([normInReplyTo, ...refs].filter(Boolean)))
  if (candidateRfcIds.length > 0) {
    const matchedMessages = await payload.find({
      collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
      where: {
        rfcMessageId: { in: candidateRfcIds },
      },
      sort: '-sentAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const matchedDoc = matchedMessages.docs[0] as unknown as Record<string, unknown> | undefined
    const matchedThread = matchedDoc?.thread
    const resolvedId =
      typeof matchedThread === 'number' || typeof matchedThread === 'string'
        ? matchedThread
        : matchedThread && typeof matchedThread === 'object' && 'id' in matchedThread
          ? (matchedThread as { id: number | string }).id
          : null

    if (resolvedId !== null) {
      const parentThread = await payload
        .findByID({
          collection: MAIL_THREADS_COLLECTION as CollectionSlug,
          id: resolvedId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        .catch(() => null)
      if (parentThread) {
        const rec = parentThread as unknown as Record<string, unknown>
        return {
          threadId: parentThread.id,
          threadKey: String(rec.threadKey ?? `id:${parentThread.id}`),
          created: false,
        }
      }
    }
  }

  const threadKey = computeDeterministicThreadKey({
    rfcMessageId,
    inReplyTo: normInReplyTo,
    references: refs,
    subject: cleanSubject,
    counterpartyEmail: counterparty.address,
  })

  // Tier 2: Deterministic threadKey match
  const byKey = await payload.find({
    collection: MAIL_THREADS_COLLECTION as CollectionSlug,
    where: {
      threadKey: { equals: threadKey },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (byKey.docs[0]) {
    const doc = byKey.docs[0]
    return {
      threadId: doc.id,
      threadKey,
      created: false,
    }
  }

  // Tier 3: Normalized subject + counterparty match within 30-day window
  if (counterparty.address && normalizedSubject !== '(No subject)') {
    const windowCutoff = new Date(
      new Date(nowIso).getTime() - SUBJECT_THREAD_WINDOW_DAYS * 86_400_000,
    ).toISOString()

    const domain = extractEmailDomain(counterparty.address)
    const whereClause: Where = {
      and: [
        { normalizedSubject: { equals: normalizedSubject } },
        { counterpartyEmail: { equals: counterparty.address.toLowerCase() } },
        { lastMessageAt: { greater_than_equal: windowCutoff } },
        { folder: { not_in: ['trash', 'spam'] } },
      ],
    }

    // Extra safety: never merge generic 1-word subjects ("Hi", "Hello", "Test") on freemail domains without RFC headers.
    const isTrivialSubject = normalizedSubject.length < 6 && isFreemailDomain(domain)
    if (!isTrivialSubject) {
      const bySubject = await payload.find({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        where: whereClause,
        sort: '-lastMessageAt',
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (bySubject.docs[0]) {
        const rec = bySubject.docs[0] as unknown as Record<string, unknown>
        return {
          threadId: bySubject.docs[0].id,
          threadKey: String(rec.threadKey ?? threadKey),
          created: false,
        }
      }
    }
  }

  // Create new conversation thread
  const createdThread = await payload.create({
    collection: MAIL_THREADS_COLLECTION as CollectionSlug,
    overrideAccess: true,
    req,
    context: { ...(req?.context ?? {}), skipAuditLog: true },
    data: {
      threadKey,
      subject: cleanSubject,
      normalizedSubject,
      folder: initialFolder,
      isRead: initialFolder === 'sent',
      isStarred: false,
      hasAttachments: false,
      hasDraft: false,
      messageCount: 0,
      unreadCount: 0,
      snippet: '',
      counterpartyName: counterparty.name || counterparty.address || 'Unknown',
      counterpartyEmail: counterparty.address || '',
      participants: counterparty.address ? [counterparty] : [],
      lastMessageAt: nowIso,
    } as Record<string, unknown>,
  })

  return {
    threadId: createdThread.id,
    threadKey,
    created: true,
  }
}

/**
 * Recomputes denormalized rollup fields (`messageCount`, `unreadCount`, `isRead`, `hasAttachments`,
 * `hasDraft`, `snippet`, `lastMessageAt`, `participants`, and folder auto-reopen on new inbound reply)
 * from the thread's child `mail-messages`.
 */
export async function recomputeThreadRollups({
  payload,
  req,
  threadId,
  reopenInboxOnInbound = false,
}: {
  payload: Payload
  req?: PayloadRequest
  threadId: number | string
  reopenInboxOnInbound?: boolean
}): Promise<void> {
  const threadDoc = await payload
    .findByID({
      collection: MAIL_THREADS_COLLECTION as CollectionSlug,
      id: threadId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    .catch(() => null)
  if (!threadDoc) return

  const messagesRes = await payload.find({
    collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
    where: {
      thread: { equals: threadId },
    },
    sort: 'sentAt',
    limit: 250,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const docs = messagesRes.docs as unknown as Array<Record<string, unknown>>
  if (docs.length === 0) return

  let unreadCount = 0
  let hasAttachments = false
  let hasDraft = false
  let lastMessageAt = ''
  let latestSnippet = ''
  const participantMap = new Map<string, ParsedEmailAddress>()

  for (const msg of docs) {
    const status = String(msg.status ?? '')
    const isMsgRead = Boolean(msg.isRead)
    if (status === 'draft') {
      hasDraft = true
    }
    if (!isMsgRead && status !== 'draft') {
      unreadCount += 1
    }
    const attArr = Array.isArray(msg.attachments) ? msg.attachments : []
    if (attArr.length > 0) {
      hasAttachments = true
    }
    const sentAt = typeof msg.sentAt === 'string' ? msg.sentAt : String(msg.createdAt ?? '')
    if (sentAt && (!lastMessageAt || sentAt >= lastMessageAt)) {
      lastMessageAt = sentAt
      if (typeof msg.snippet === 'string' && msg.snippet.trim()) {
        latestSnippet = msg.snippet.trim()
      }
    }

    const fromAddr = String(msg.fromAddress ?? '').trim().toLowerCase()
    const fromName = String(msg.fromName ?? '').trim()
    if (fromAddr) {
      participantMap.set(fromAddr, {
        name: fromName || participantMap.get(fromAddr)?.name || '',
        address: fromAddr,
      })
    }

    for (const addr of parseAddressList(msg.toAddresses as ParsedEmailAddress[] | undefined)) {
      if (addr.address && !participantMap.has(addr.address)) {
        participantMap.set(addr.address, addr)
      }
    }
  }

  const threadRec = threadDoc as unknown as Record<string, unknown>
  const currentFolder = (threadRec.folder as MailFolder) || 'inbox'
  let nextFolder = currentFolder
  // Just like Gmail/Resend Inboxes: if an archived or sent thread receives a fresh inbound reply, surface it back in Inbox!
  if (reopenInboxOnInbound && (currentFolder === 'archive' || currentFolder === 'sent')) {
    nextFolder = 'inbox'
  }

  await payload.update({
    collection: MAIL_THREADS_COLLECTION as CollectionSlug,
    id: threadId,
    overrideAccess: true,
    req,
    context: { ...(req?.context ?? {}), skipAuditLog: true },
    data: {
      folder: nextFolder,
      messageCount: docs.length,
      unreadCount,
      isRead: unreadCount === 0,
      hasAttachments,
      hasDraft,
      snippet: latestSnippet.slice(0, 180),
      lastMessageAt: lastMessageAt || new Date().toISOString(),
      participants: Array.from(participantMap.values()),
    } as Record<string, unknown>,
  })
}
