import pg from 'pg'
import type { CollectionSlug, Endpoint } from 'payload'

import { hasCapability } from '@/access/permissions'

import { MAIL_PG_CHANNEL, MAIL_THREADS_COLLECTION } from '../constants'
import { collectInboxFolderCounts } from '../services/inboxQueries'
import { hasDirectUnpooledPostgresUrl, subscribeLocalMailEvents } from '../services/realtimeBus'
import type { MailStreamEvent } from '../types'

const HEARTBEAT_INTERVAL_MS = 15_000
const CURSOR_POLL_INTERVAL_MS = 4_000
const MAX_STREAM_LIFETIME_MS = 240_000 // Gracefully rotate before Vercel's 300s maxDuration

function encodeSseFrame(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  return new TextEncoder().encode(payload)
}

export function createMailStreamEndpoint(): Endpoint {
  return {
    path: '/mail/stream',
    method: 'get',
    handler: async (req) => {
      if (!req.user) {
        return Response.json({ error: 'Authentication required.' }, { status: 401 })
      }
      if (!hasCapability(req.user, 'manageInbox')) {
        return Response.json({ error: 'Needs the Mail inbox permission.' }, { status: 403 })
      }

      let closed = false
      let unsubscribeLocal: (() => void) | null = null
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null
      let pollTimer: ReturnType<typeof setInterval> | null = null
      let lifetimeTimer: ReturnType<typeof setTimeout> | null = null
      let pgClient: pg.Client | null = null

      const cleanup = async () => {
        if (closed) return
        closed = true
        if (unsubscribeLocal) {
          unsubscribeLocal()
          unsubscribeLocal = null
        }
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
        if (lifetimeTimer) {
          clearTimeout(lifetimeTimer)
          lifetimeTimer = null
        }
        if (pgClient) {
          const client = pgClient
          pgClient = null
          await client.query(`UNLISTEN ${MAIL_PG_CHANNEL}`).catch(() => undefined)
          await client.end().catch(() => undefined)
        }
      }

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const pushEvent = (eventName: string, data: MailStreamEvent) => {
            if (closed) return
            try {
              controller.enqueue(encodeSseFrame(eventName, data))
            } catch {
              void cleanup()
            }
          }

          // Reconnection hint (2.5s) + initial snapshot frame
          controller.enqueue(new TextEncoder().encode('retry: 2500\n\n'))
          const initialCounts = await collectInboxFolderCounts(req.payload, req)
          let watermarkIso = new Date().toISOString()

          pushEvent('mail', {
            type: 'snapshot',
            unreadCount: initialCounts.inboxUnread,
            at: watermarkIso,
          })

          // 1. In-process immediate pub/sub
          unsubscribeLocal = subscribeLocalMailEvents((evt) => {
            watermarkIso = evt.at
            pushEvent('mail', evt)
          })

          // 2. Direct PostgreSQL LISTEN/NOTIFY when an unpooled URL is available; cursor watermark poll otherwise
          const directPg = hasDirectUnpooledPostgresUrl()
          let pgListening = false

          if (directPg.supported && process.env.NODE_ENV !== 'test') {
            try {
              const client = new pg.Client({
                connectionString: directPg.connectionString,
                connectionTimeoutMillis: 4_000,
              })
              await client.connect()
              await client.query(`LISTEN ${MAIL_PG_CHANNEL}`)
              client.on('notification', (msg) => {
                if (msg.channel !== MAIL_PG_CHANNEL || !msg.payload) return
                try {
                  const parsed = JSON.parse(msg.payload) as MailStreamEvent
                  watermarkIso = parsed.at || new Date().toISOString()
                  pushEvent('mail', parsed)
                } catch {
                  // Ignore malformed notification frames.
                }
              })
              client.on('error', () => {
                void cleanup()
              })
              pgClient = client
              pgListening = true
            } catch {
              pgListening = false
            }
          }

          if (!pgListening) {
            pollTimer = setInterval(async () => {
              if (closed) return
              try {
                const changed = await req.payload.find({
                  collection: MAIL_THREADS_COLLECTION as CollectionSlug,
                  where: { updatedAt: { greater_than: watermarkIso } },
                  sort: '-updatedAt',
                  limit: 1,
                  depth: 0,
                  overrideAccess: true,
                })
                if (changed.docs.length > 0) {
                  const newest = changed.docs[0] as unknown as {
                    id: number | string
                    updatedAt?: string
                  }
                  watermarkIso = newest.updatedAt || new Date().toISOString()
                  const counts = await collectInboxFolderCounts(req.payload)
                  pushEvent('mail', {
                    type: 'threads.updated',
                    threadId: newest.id,
                    unreadCount: counts.inboxUnread,
                    at: watermarkIso,
                  })
                }
              } catch {
                // Safe no-op during transient DB blip.
              }
            }, CURSOR_POLL_INTERVAL_MS)
          }

          heartbeatTimer = setInterval(() => {
            if (closed) return
            try {
              controller.enqueue(new TextEncoder().encode(`: keepalive ${Date.now()}\n\n`))
            } catch {
              void cleanup()
            }
          }, HEARTBEAT_INTERVAL_MS)

          lifetimeTimer = setTimeout(() => {
            if (!closed) {
              try {
                controller.close()
              } catch {
                // already closed
              }
              void cleanup()
            }
          }, MAX_STREAM_LIFETIME_MS)

          const abortSignal = (req as { signal?: AbortSignal }).signal
          abortSignal?.addEventListener(
            'abort',
            () => {
              try {
                controller.close()
              } catch {
                // already closed
              }
              void cleanup()
            },
            { once: true },
          )
        },
        async cancel() {
          await cleanup()
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    },
  }
}
