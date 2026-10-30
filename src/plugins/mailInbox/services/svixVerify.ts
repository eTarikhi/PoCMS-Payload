import crypto from 'node:crypto'

import { DEFAULT_WEBHOOK_TOLERANCE_SECONDS } from '../constants'

export class WebhookVerificationError extends Error {
  readonly code:
    | 'MISSING_SECRET'
    | 'INVALID_SECRET'
    | 'MISSING_HEADERS'
    | 'INVALID_TIMESTAMP'
    | 'TIMESTAMP_OUT_OF_RANGE'
    | 'INVALID_SIGNATURE'

  constructor(
    code: WebhookVerificationError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'WebhookVerificationError'
    this.code = code
  }
}

export type VerifiedWebhookHeaders = {
  svixId: string
  svixTimestamp: number
  signatureHeader: string
}

const WHSEC_PREFIX = 'whsec_'

export function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret?.trim() ?? ''
  if (!trimmed) {
    throw new WebhookVerificationError('MISSING_SECRET', 'Webhook signing secret is missing.')
  }

  const rawBase64 = trimmed.startsWith(WHSEC_PREFIX)
    ? trimmed.slice(WHSEC_PREFIX.length)
    : trimmed

  if (!rawBase64 || !/^[A-Za-z0-9+/=_-]+$/.test(rawBase64)) {
    throw new WebhookVerificationError(
      'INVALID_SECRET',
      'Webhook signing secret has an invalid base64 format.',
    )
  }

  const normalized = rawBase64.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = Buffer.from(normalized, 'base64')
  if (decoded.length === 0) {
    throw new WebhookVerificationError('INVALID_SECRET', 'Webhook signing secret decoded to 0 bytes.')
  }
  return decoded
}

function readHeader(
  headers: Headers | Record<string, string | null | undefined>,
  ...names: string[]
): string {
  if (typeof (headers as Headers)?.get === 'function') {
    for (const name of names) {
      const val = (headers as Headers).get(name)?.trim()
      if (val) return val
    }
    return ''
  }

  const record = headers as Record<string, string | null | undefined>
  const lowerMap = new Map<string, string>()
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === 'string' && v.trim()) {
      lowerMap.set(k.toLowerCase(), v.trim())
    }
  }
  for (const name of names) {
    const val = lowerMap.get(name.toLowerCase())
    if (val) return val
  }
  return ''
}

/**
 * Verifies a Resend Standard Webhooks / Svix payload against its raw UTF-8 body string.
 * Supports both `svix-*` and `webhook-*` header conventions and multi-key rotation (`v1,sigA v1,sigB`).
 */
export function verifyResendWebhookSignature({
  rawBody,
  headers,
  secret,
  toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  nowMs = Date.now(),
}: {
  rawBody: string
  headers: Headers | Record<string, string | null | undefined>
  secret: string
  toleranceSeconds?: number
  nowMs?: number
}): VerifiedWebhookHeaders {
  const secretBytes = decodeWebhookSecret(secret)

  const svixId = readHeader(headers, 'svix-id', 'webhook-id')
  const timestampRaw = readHeader(headers, 'svix-timestamp', 'webhook-timestamp')
  const signatureHeader = readHeader(headers, 'svix-signature', 'webhook-signature')

  if (!svixId || !timestampRaw || !signatureHeader) {
    throw new WebhookVerificationError(
      'MISSING_HEADERS',
      'Missing required svix-id / svix-timestamp / svix-signature headers.',
    )
  }

  if (!/^\d+$/.test(timestampRaw)) {
    throw new WebhookVerificationError(
      'INVALID_TIMESTAMP',
      'Webhook timestamp must be an integer Unix epoch in seconds.',
    )
  }

  const svixTimestamp = Number.parseInt(timestampRaw, 10)
  const nowSeconds = Math.floor(nowMs / 1000)
  if (!Number.isFinite(svixTimestamp) || Math.abs(nowSeconds - svixTimestamp) > toleranceSeconds) {
    throw new WebhookVerificationError(
      'TIMESTAMP_OUT_OF_RANGE',
      'Webhook timestamp is outside the permitted replay tolerance window.',
    )
  }

  const signedContent = `${svixId}.${timestampRaw}.${rawBody}`
  const expectedDigest = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest()

  const entries = signatureHeader.split(/\s+/).filter(Boolean)
  let matched = false

  for (const entry of entries) {
    const commaIdx = entry.indexOf(',')
    if (commaIdx <= 0) continue
    const version = entry.slice(0, commaIdx)
    const sigBase64 = entry.slice(commaIdx + 1)
    if (version !== 'v1' || !sigBase64) continue

    const candidateDigest = Buffer.from(sigBase64, 'base64')
    if (
      candidateDigest.length === expectedDigest.length &&
      crypto.timingSafeEqual(expectedDigest, candidateDigest)
    ) {
      matched = true
      break
    }
  }

  if (!matched) {
    throw new WebhookVerificationError(
      'INVALID_SIGNATURE',
      'No matching v1 HMAC-SHA256 webhook signature found.',
    )
  }

  return {
    svixId,
    svixTimestamp,
    signatureHeader,
  }
}

/** Deterministic signing helper used by automated integration tests and webhook diagnostics. */
export function createSignedWebhookHeaders({
  rawBody,
  secret,
  svixId = `msg_${crypto.randomBytes(12).toString('hex')}`,
  timestampSeconds = Math.floor(Date.now() / 1000),
}: {
  rawBody: string
  secret: string
  svixId?: string
  timestampSeconds?: number
}): Record<string, string> {
  const secretBytes = decodeWebhookSecret(secret)
  const ts = String(timestampSeconds)
  const sig = crypto
    .createHmac('sha256', secretBytes)
    .update(`${svixId}.${ts}.${rawBody}`, 'utf8')
    .digest('base64')

  return {
    'svix-id': svixId,
    'svix-timestamp': ts,
    'svix-signature': `v1,${sig}`,
  }
}
