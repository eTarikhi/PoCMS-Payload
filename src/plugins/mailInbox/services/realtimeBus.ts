import { EventEmitter } from 'node:events'
import type { Payload } from 'payload'

import { resolvePayloadPoolClient } from '@/lib/payloadSql'
import { isServerlessAutoscalingPostgresUrl } from '@/lib/postgresAdapterConfig'

import { MAIL_PG_CHANNEL } from '../constants'
import type { MailStreamEvent } from '../types'

/**
 * Dual-mode Mail Realtime Bus:
 * 1. Immediate in-process `EventEmitter` (`maxListeners = 150`) for single-instance & dev SSE streams.
 * 2. PostgreSQL `NOTIFY pocms_mail_events` (<1KB JSON payload) via Payload's active primary pool
 *    (`db.pool` or `db.drizzle.$client`).
 *
 * Neon Scale-to-Zero Safeguard:
 * Dedicated unpooled `LISTEN` sessions hold an open backend PID that blocks Neon's
 * `suspend_timeout_seconds` scale-to-zero. On serverless autoscaling hosts (`*.neon.tech`,
 * `vercel-storage.com`), `LISTEN` defaults to `false` unless `MAIL_STREAM_PG_LISTEN=true` is
 * explicitly configured; on local/self-hosted PostgreSQL it defaults to `true`.
 */

const emitter = new EventEmitter()
emitter.setMaxListeners(150)

export function hasDirectUnpooledPostgresUrl(
  env: Record<string, string | undefined> = process.env,
): {
  supported: boolean
  connectionString: string
} {
  const explicitFlag = (env.MAIL_STREAM_PG_LISTEN ?? '').trim().toLowerCase()
  if (explicitFlag === 'false' || explicitFlag === '0') {
    return { supported: false, connectionString: '' }
  }

  const unpooled = (env.POSTGRES_URL_NON_POOLING ?? env.DATABASE_URL_UNPOOLED ?? '').trim()
  const primary = (env.POSTGRES_URL ?? '').trim()

  const candidate =
    unpooled && !unpooled.includes('-pooler.') && !unpooled.includes('pgbouncer=true')
      ? unpooled
      : primary && !primary.includes('-pooler.') && !primary.includes('pgbouncer=true')
        ? primary
        : ''

  if (!candidate) {
    return { supported: false, connectionString: '' }
  }

  if (explicitFlag !== 'true' && explicitFlag !== '1') {
    if (isServerlessAutoscalingPostgresUrl(candidate)) {
      return { supported: false, connectionString: '' }
    }
  }

  return { supported: true, connectionString: candidate }
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

  const dbPool = resolvePayloadPoolClient(payload)
  if (dbPool) {
    try {
      const compactJson = JSON.stringify(fullEvent).slice(0, 1000)
      await dbPool.query(`SELECT pg_notify($1, $2)`, [MAIL_PG_CHANNEL, compactJson])
    } catch {
      // Safe no-op when database pool is mocked or unavailable in unit tests.
    }
  }
}
