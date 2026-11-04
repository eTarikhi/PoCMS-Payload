import { APIError, type CollectionSlug, type Endpoint } from 'payload'

import { hasCapability } from '@/access/permissions'

import { MAIL_FOLDERS, MAIL_LABELS_COLLECTION, type MailFolder } from '../constants'
import {
  collectInboxFolderCounts,
  collectInboxSnapshot,
  composeOrSendMail,
  executeBulkThreadAction,
  loadMailThreadDetail,
  mapLabelDoc,
} from '../services/inboxQueries'
import type { BulkThreadsInput, ComposeEmailInput, MailInboxIdentity } from '../types'

function forbidIfUnauthorized(user: unknown): Response | null {
  if (!user) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 })
  }
  if (!hasCapability(user, 'manageInbox')) {
    return Response.json({ error: 'Needs the Mail inbox permission.' }, { status: 403 })
  }
  return null
}

export function createMailActionEndpoints(options?: {
  apiKey?: string
  webhookSecret?: string
  identities?: readonly MailInboxIdentity[]
}): Endpoint[] {
  return [
    {
      path: '/mail/unread-count',
      method: 'get',
      handler: async (req) => {
        const denied = forbidIfUnauthorized(req.user)
        if (denied) return denied

        const counts = await collectInboxFolderCounts(req.payload, req)
        return Response.json({
          inboxUnread: counts.inboxUnread,
          spamUnread: counts.spamUnread,
        })
      },
    },
    {
      path: '/mail/inbox',
      method: 'get',
      handler: async (req) => {
        const denied = forbidIfUnauthorized(req.user)
        if (denied) return denied

        const url = new URL(req.url || 'http://localhost/api/mail/inbox')
        const rawFolder = url.searchParams.get('folder') || 'inbox'
        const folder: MailFolder | 'starred' =
          rawFolder === 'starred'
            ? 'starred'
            : (MAIL_FOLDERS as readonly string[]).includes(rawFolder)
              ? (rawFolder as MailFolder)
              : 'inbox'

        const starredOnly = url.searchParams.get('starred') === 'true'
        const unreadOnly = url.searchParams.get('unread') === 'true'
        const labelId = url.searchParams.get('labelId')
        const search = url.searchParams.get('q')
        const page = Number.parseInt(url.searchParams.get('page') || '1', 10) || 1
        const limit = Number.parseInt(url.searchParams.get('limit') || '40', 10) || 40

        const snapshot = await collectInboxSnapshot({
          payload: req.payload,
          req,
          folder,
          starredOnly,
          unreadOnly,
          labelId,
          search,
          page,
          limit,
          pluginOptions: options,
        })

        return Response.json(snapshot)
      },
    },
    {
      path: '/mail/threads/:id',
      method: 'get',
      handler: async (req) => {
        const denied = forbidIfUnauthorized(req.user)
        if (denied) return denied

        const rawId = req.routeParams?.id
        const threadId =
          typeof rawId === 'string' && /^\d+$/.test(rawId)
            ? Number.parseInt(rawId, 10)
            : (rawId as string | number | undefined)

        if (!threadId) {
          return Response.json({ error: 'Missing thread ID.' }, { status: 400 })
        }

        const url = new URL(req.url || 'http://localhost/api/mail/threads/0')
        const markAsRead = url.searchParams.get('markRead') !== 'false'

        const detail = await loadMailThreadDetail({
          payload: req.payload,
          req,
          threadId,
          markAsRead,
        })

        if (!detail) {
          return Response.json({ error: 'Thread not found.' }, { status: 404 })
        }

        return Response.json({ thread: detail })
      },
    },
    {
      path: '/mail/send',
      method: 'post',
      handler: async (req) => {
        const denied = forbidIfUnauthorized(req.user)
        if (denied) return denied

        const body = (await req.json?.().catch(() => null)) as ComposeEmailInput | null
        if (!body || typeof body !== 'object') {
          return Response.json({ error: 'Invalid request body.' }, { status: 400 })
        }

        try {
          const result = await composeOrSendMail({
            payload: req.payload,
            req,
            input: body,
            apiKey: options?.apiKey,
            identities: options?.identities,
          })

          const thread = await loadMailThreadDetail({
            payload: req.payload,
            req,
            threadId: result.threadId,
            markAsRead: false,
          })

          return Response.json({
            ok: true,
            dispatched: result.dispatched,
            message: result.message,
            thread,
          })
        } catch (error) {
          const status = error instanceof APIError ? error.status : 500
          const message = error instanceof Error ? error.message : 'Failed to send email.'
          return Response.json({ error: message }, { status })
        }
      },
    },
    {
      path: '/mail/threads/bulk',
      method: 'patch',
      handler: async (req) => {
        const denied = forbidIfUnauthorized(req.user)
        if (denied) return denied

        const body = (await req.json?.().catch(() => null)) as BulkThreadsInput | null
        if (!body || !Array.isArray(body.threadIds) || !body.action) {
          return Response.json({ error: 'Missing threadIds or bulk action.' }, { status: 400 })
        }

        const result = await executeBulkThreadAction({
          payload: req.payload,
          req,
          input: body,
        })
        const counts = await collectInboxFolderCounts(req.payload, req)

        return Response.json({
          ok: true,
          updatedCount: result.updatedCount,
          counts,
        })
      },
    },
    {
      path: '/mail/labels',
      method: 'post',
      handler: async (req) => {
        const denied = forbidIfUnauthorized(req.user)
        if (denied) return denied

        const body = (await req.json?.().catch(() => null)) as {
          action?: 'create' | 'delete'
          name?: string
          color?: string
          id?: number | string
        } | null

        if (!body?.action) {
          return Response.json({ error: 'Missing label action.' }, { status: 400 })
        }

        if (body.action === 'create') {
          const name = (body.name ?? '').trim()
          if (!name) {
            return Response.json({ error: 'Label name is required.' }, { status: 400 })
          }
          const created = await req.payload.create({
            collection: MAIL_LABELS_COLLECTION as CollectionSlug,
            overrideAccess: true,
            req,
            data: {
              name,
              color: body.color || '#3B82F6',
            } as Record<string, unknown>,
          })
          return Response.json({ ok: true, label: mapLabelDoc(created) })
        }

        if (body.action === 'delete' && body.id !== undefined) {
          const target = await req.payload
            .findByID({
              collection: MAIL_LABELS_COLLECTION as CollectionSlug,
              id: body.id,
              depth: 0,
              overrideAccess: true,
              req,
            })
            .catch(() => null)
          if (!target) {
            return Response.json({ error: 'Label not found.' }, { status: 404 })
          }
          if ((target as unknown as { isSystem?: boolean }).isSystem) {
            return Response.json(
              { error: 'System labels cannot be deleted.' },
              { status: 400 },
            )
          }
          await req.payload.delete({
            collection: MAIL_LABELS_COLLECTION as CollectionSlug,
            id: body.id,
            overrideAccess: true,
            req,
          })
          return Response.json({ ok: true })
        }

        return Response.json({ error: 'Unsupported label action.' }, { status: 400 })
      },
    },
  ]
}
