import crypto from 'node:crypto'

import { DEFAULT_MAX_ATTACHMENT_BYTES } from '../constants'

export const RESEND_API_BASE_URL = 'https://api.resend.com'

export type ResendInboundAttachmentMeta = {
  id: string
  filename?: string | null
  size?: number
  content_type: string
  content_disposition?: 'inline' | 'attachment' | null
  content_id?: string | null
}

export type ResendSignedAttachment = ResendInboundAttachmentMeta & {
  download_url: string
  expires_at: string
}

export type ResendReceivedEmail = {
  object: 'email'
  id: string
  to: string[]
  from: string
  created_at: string
  subject: string
  html: string | null
  text: string | null
  headers: Record<string, string> | null
  bcc: string[]
  cc: string[]
  reply_to: string[]
  message_id: string
  raw?: {
    download_url: string
    expires_at: string
  } | null
  attachments: ResendInboundAttachmentMeta[]
}

export type ResendSendAttachmentInput = {
  filename: string
  content?: string
  path?: string
  content_type?: string
  content_id?: string
}

export type ResendSendEmailInput = {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  reply_to?: string[]
  subject: string
  html?: string
  text?: string
  headers?: Record<string, string>
  attachments?: ResendSendAttachmentInput[]
  tags?: Array<{ name: string; value: string }>
}

export class ResendApiError extends Error {
  readonly status: number
  readonly retryable: boolean
  readonly responseBody: string

  constructor(message: string, status: number, responseBody: string) {
    super(message)
    this.name = 'ResendApiError'
    this.status = status
    this.retryable = status === 408 || status === 429 || status >= 500
    this.responseBody = responseBody
  }
}

export type FetchLike = typeof fetch

async function resendJsonRequest<T>(
  path: string,
  {
    apiKey,
    method = 'GET',
    headers = {},
    body,
    fetchImpl = fetch,
  }: {
    apiKey: string
    method?: 'GET' | 'POST'
    headers?: Record<string, string>
    body?: unknown
    fetchImpl?: FetchLike
  },
): Promise<T> {
  const token = apiKey?.trim()
  if (!token) {
    throw new ResendApiError('RESEND_API_KEY is not configured.', 401, '')
  }

  const res = await fetchImpl(`${RESEND_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const rawText = await res.text()
  if (!res.ok) {
    throw new ResendApiError(
      `Resend API ${method} ${path} failed (${res.status}): ${rawText.slice(0, 300)}`,
      res.status,
      rawText,
    )
  }

  return (rawText ? JSON.parse(rawText) : {}) as T
}

/** Fetches the full inbound MIME body, headers, and metadata from Resend Receiving API. */
export async function fetchReceivedEmail(
  emailId: string,
  options: { apiKey: string; fetchImpl?: FetchLike },
): Promise<ResendReceivedEmail> {
  return resendJsonRequest<ResendReceivedEmail>(
    `/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      apiKey: options.apiKey,
      fetchImpl: options.fetchImpl,
    },
  )
}

/** Lists signed attachment download URLs for an inbound Resend email. */
export async function listReceivedAttachments(
  emailId: string,
  options: { apiKey: string; fetchImpl?: FetchLike },
): Promise<ResendSignedAttachment[]> {
  const response = await resendJsonRequest<{ data?: ResendSignedAttachment[] }>(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    {
      apiKey: options.apiKey,
      fetchImpl: options.fetchImpl,
    },
  )
  return Array.isArray(response?.data) ? response.data : []
}

/**
 * Downloads a signed Resend attachment with strict streaming byte-budget enforcement
 * so oversized payloads cannot exhaust serverless function memory.
 */
export async function downloadSignedAttachment(
  downloadUrl: string,
  options?: {
    maxBytes?: number
    declaredSize?: number
    fetchImpl?: FetchLike
  },
): Promise<
  | { skipped: false; buffer: Buffer; sha256: string; contentType: string | null }
  | { skipped: true; reason: string }
> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES
  if (typeof options?.declaredSize === 'number' && options.declaredSize > maxBytes) {
    return {
      skipped: true,
      reason: `Attachment size (${options.declaredSize} bytes) exceeds max limit (${maxBytes} bytes).`,
    }
  }

  const fetchImpl = options?.fetchImpl ?? fetch
  const res = await fetchImpl(downloadUrl, { method: 'GET' })
  if (!res.ok) {
    throw new ResendApiError(
      `Failed to download signed attachment (${res.status}).`,
      res.status,
      '',
    )
  }

  const contentLengthHeader = res.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await res.body?.cancel().catch(() => undefined)
      return {
        skipped: true,
        reason: `Attachment Content-Length (${contentLength} bytes) exceeds max limit (${maxBytes} bytes).`,
      }
    }
  }

  const hash = crypto.createHash('sha256')
  const chunks: Buffer[] = []
  let totalBytes = 0

  if (res.body) {
    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => undefined)
          return {
            skipped: true,
            reason: `Attachment stream exceeded max limit (${maxBytes} bytes).`,
          }
        }
        const buf = Buffer.from(value)
        hash.update(buf)
        chunks.push(buf)
      }
    }
  } else {
    const arr = await res.arrayBuffer()
    if (arr.byteLength > maxBytes) {
      return {
        skipped: true,
        reason: `Attachment payload (${arr.byteLength} bytes) exceeds max limit (${maxBytes} bytes).`,
      }
    }
    const buf = Buffer.from(arr)
    hash.update(buf)
    chunks.push(buf)
  }

  return {
    skipped: false,
    buffer: Buffer.concat(chunks),
    sha256: hash.digest('hex'),
    contentType: res.headers.get('content-type'),
  }
}

/** Dispatches an outbound email via Resend `POST /emails` with `Idempotency-Key` protection. */
export async function sendResendEmail(
  payload: ResendSendEmailInput,
  options: {
    apiKey: string
    idempotencyKey: string
    fetchImpl?: FetchLike
  },
): Promise<{ id: string }> {
  return resendJsonRequest<{ id: string }>('/emails', {
    apiKey: options.apiKey,
    method: 'POST',
    headers: {
      'Idempotency-Key': options.idempotencyKey.slice(0, 255),
    },
    body: payload,
    fetchImpl: options.fetchImpl,
  })
}
