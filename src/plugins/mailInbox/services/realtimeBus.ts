import { EventEmitter } from 'node:events'
import type { Payload } from 'payload'

import { MAIL_PG_CHANNEL } from '../constants'
import type { MailStreamEvent } from '../types'

/**
 * Dual-mode Mail Realtime Bus:
 * 1. Immediate in-process `EventEmitter` (`maxListeners = 150`) for single-instance & dev SSE streams.
 * 2. PostgreSQL `NOTIFY pocms_mail_events` (<512B JSON payload) for multi-instance deployments when
 *    a direct (non-`-pooler`) `POSTGRES_URL_NON_POOLING` connection is available.
 */

const emitter = new EventEmitter()
emitter.setMaxListeners(150)

export function hasDirectUnpooledPostgresUrl(env: NodeJS.ProcessEnv = process.env): {
  supported: boolean
  connectionString: string
} {
  const unpooled = (env.POSTGRES_URL_NON_POOLING ?? env.DATABASE_URL_UNPOOLED ?? '').trim()
  if (unpooled && !unpooled.includes('-pooler.')) {
    return { supported: true, connectionString: unpooled }
  }
  const primary = (env.POSTGRES_URL ?? '').trim()
  if (primary && !primary.includes('-pooler.') && !primary.includes('pgbouncer=true')) {
    return { supported: true, connectionString: primary }
  }
  return { supported: false, connectionString: '' }
}

export function subscribeLocalMailEvents(
  listener: (event: MailStreamEvent) => void,
): () => void {
  emitter.on('mail-event', listener)
  return () => {
    emitter.off('mail-event', listener)
  }
}

export async function publishMailStreamEvent(
  payload: Payload | null | undefined,
  event: Omit<MailStreamEvent, 'at'> & { at?: string },
): Promise<void> {
  const fullEvent: MailStreamEvent = {
    ...event,
    at: event.at ?? new Date().toISOString(),
  }

  emitter.emit('mail-event', fullEvent)

  const dbPool = (payload?.db as { pool?: { query?: (sql: string, params?: unknown[]) => Promise<unknown> } } | undefined)?.pool
  if (typeof dbPool?.query === 'function') {
    try {
      const compactJson = JSON.stringify(fullEvent).slice(0, 1000)
      await dbPool.query(`SELECT pg_notify($1, $2)`, [MAIL_PG_CHANNEL, compactJson])
    } catch {
      // Safe no-op when database pool is mocked or unavailable in unit tests.
    }
  }
}
