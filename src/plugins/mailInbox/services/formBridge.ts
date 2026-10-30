import type { CollectionAfterChangeHook, CollectionSlug } from 'payload'

import {
  MAIL_LABELS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  MAIL_THREADS_COLLECTION,
} from '../constants'
import { escapeHtml } from './mimeSanitizer'
import { publishMailStreamEvent } from './realtimeBus'
import { recomputeThreadRollups, resolveOrCreateMailThread } from './threading'

type SubmissionFieldEntry = {
  field?: string | null
  value?: unknown
}

function extractFieldMap(entries: readonly SubmissionFieldEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    const key = typeof entry?.field === 'string' ? entry.field.trim() : ''
    const val =
      typeof entry?.value === 'string'
        ? entry.value.trim()
        : entry?.value !== null && entry?.value !== undefined
          ? String(entry.value).trim()
          : ''
    if (key && val) {
      map.set(key, val)
    }
  }
  return map
}

function pickFirst(map: Map<string, string>, keys: readonly string[]): string {
  const lowerLookup = new Map<string, string>()
  for (const [k, v] of map.entries()) {
    lowerLookup.set(k.toLowerCase(), v)
  }
  for (const candidate of keys) {
    const hit = lowerLookup.get(candidate.toLowerCase())
    if (hit) return hit
  }
  return ''
}

/**
 * Non-destructive `afterChange` hook attached to `form-submissions` when `bridgeFormSubmissions !== false`.
 * Mirrors visitor `/contact` and `Request CV` submissions into `mail-threads` + `mail-messages` so
 * operators can triage, label, and reply via Resend directly from `/admin/inbox`.
 */
export function createFormSubmissionToInboxHook(): CollectionAfterChangeHook {
  return async ({ doc, operation, req }) => {
    if (operation !== 'create' || !doc) return doc

    try {
      const record = doc as Record<string, unknown>
      const rawEntries = Array.isArray(record.submissionData)
        ? (record.submissionData as SubmissionFieldEntry[])
        : []
      if (rawEntries.length === 0) return doc

      const fieldMap = extractFieldMap(rawEntries)
      const senderName = pickFirst(fieldMap, [
        'name',
        'fullName',
        'full_name',
        'full-name',
        'sender',
      ])
      const senderEmail = pickFirst(fieldMap, [
        'email',
        'workEmail',
        'work_email',
        'work-email',
      ]).toLowerCase()

      let formTitle = 'Website Form'
      let formSlug = ''
      const rawForm = record.form
      if (rawForm && typeof rawForm === 'object') {
        const formObj = rawForm as Record<string, unknown>
        if (typeof formObj.title === 'string' && formObj.title.trim()) formTitle = formObj.title.trim()
        if (typeof formObj.slug === 'string' && formObj.slug.trim()) formSlug = formObj.slug.trim()
      } else if (typeof rawForm === 'number' || typeof rawForm === 'string') {
        const fetchedForm = await req.payload
          .findByID({
            collection: 'forms' as CollectionSlug,
            id: rawForm,
            depth: 0,
            overrideAccess: true,
            req,
          })
          .catch(() => null)
        if (fetchedForm) {
          const fRec = fetchedForm as unknown as Record<string, unknown>
          if (typeof fRec.title === 'string' && fRec.title.trim()) formTitle = fRec.title.trim()
          if (typeof fRec.slug === 'string' && fRec.slug.trim()) formSlug = fRec.slug.trim()
        }
      }

      const explicitSubject = pickFirst(fieldMap, ['subject', 'topic', 'projectType', 'role'])
      const isCvRequest =
        formSlug === 'request-cv' || formTitle.toLowerCase().includes('cv')
      const subject = explicitSubject
        ? `[${formTitle}] ${explicitSubject}`
        : isCvRequest
          ? `CV Request from ${senderName || senderEmail || 'Visitor'}`
          : `New ${formTitle} inquiry from ${senderName || senderEmail || 'Visitor'}`

      const plainLines: string[] = []
      const htmlRows: string[] = []
      for (const [k, v] of fieldMap.entries()) {
        if (k.startsWith('_')) continue
        plainLines.push(`${k}: ${v}`)
        htmlRows.push(
          `<tr><td style="padding: 6px 12px 6px 0; font-weight: 600; vertical-align: top; color: #64748b;">${escapeHtml(k)}</td><td style="padding: 6px 0; white-space: pre-wrap;">${escapeHtml(v)}</td></tr>`,
        )
      }

      const plainText = plainLines.join('\n')
      const sanitizedHtml = `<div style="font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.5;"><p style="margin: 0 0 12px; font-weight: 600;">Submitted via ${escapeHtml(formTitle)}</p><table style="border-collapse: collapse; width: 100%;">${htmlRows.join('')}</table></div>`
      const messageBody =
        pickFirst(fieldMap, ['message', 'notes', 'details', 'context']) || plainText
      const snippet = messageBody.replace(/\s+/g, ' ').trim().slice(0, 180)
      const nowIso =
        typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString()

      const counterparty = {
        name: senderName || senderEmail || 'Website Visitor',
        address: senderEmail,
      }

      const { threadId } = await resolveOrCreateMailThread({
        payload: req.payload,
        req,
        rfcMessageId: `<form-submission-${String(record.id)}@pocms.local>`,
        subject,
        counterparty,
        initialFolder: 'inbox',
        nowIso,
      })

      // Auto-resolve matching default label ('cv-request' or 'lead')
      const targetLabelSlug = isCvRequest ? 'cv-request' : 'lead'
      const labelLookup = await req.payload
        .find({
          collection: MAIL_LABELS_COLLECTION as CollectionSlug,
          where: { slug: { equals: targetLabelSlug } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
        .catch(() => null)
      const labelId = labelLookup?.docs?.[0]?.id

      await req.payload.update({
        collection: MAIL_THREADS_COLLECTION as CollectionSlug,
        id: threadId,
        overrideAccess: true,
        req,
        context: { ...(req.context ?? {}), skipAuditLog: true },
        data: {
          sourceFormSubmission: record.id,
          ...(labelId !== undefined ? { labels: [labelId] } : {}),
        } as Record<string, unknown>,
      })

      const createdMsg = await req.payload.create({
        collection: MAIL_MESSAGES_COLLECTION as CollectionSlug,
        overrideAccess: true,
        req,
        context: { ...(req.context ?? {}), skipAuditLog: true },
        data: {
          thread: threadId,
          direction: 'form_submission',
          status: 'received',
          isRead: false,
          rfcMessageId: `<form-submission-${String(record.id)}@pocms.local>`,
          fromAddress: senderEmail || 'noreply@pocms.local',
          fromName: counterparty.name,
          toAddresses: [],
          ccAddresses: [],
          bccAddresses: [],
          replyToAddresses: senderEmail ? [counterparty] : [],
          subject,
          snippet,
          sanitizedHtml,
          plainText,
          visibleReplyText: messageBody,
          quotedHistoryText: '',
          hasRemoteImages: false,
          blockedRemoteImages: 0,
          sentAt: nowIso,
          lastEventAt: nowIso,
        } as Record<string, unknown>,
      })

      await recomputeThreadRollups({
        payload: req.payload,
        req,
        threadId,
        reopenInboxOnInbound: true,
      })

      await publishMailStreamEvent(req.payload, {
        type: 'message.received',
        threadId,
        messageId: createdMsg.id,
      })
    } catch (error) {
      req.payload?.logger?.warn?.(
        `[mail-inbox] Non-fatal error bridging form-submission #${String((doc as { id?: unknown })?.id)} into inbox: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return doc
  }
}
