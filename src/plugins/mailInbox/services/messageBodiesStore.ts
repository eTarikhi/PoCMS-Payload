import { put } from '@vercel/blob'
import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import { executePayloadSql, qualifiedPayloadTable } from '@/lib/payloadSql'

import { ARCHIVE_COLD_MAIL_BODIES_TASK_SLUG, MAIL_MESSAGE_BODIES_TABLE } from '../constants'

export type ColdMailBodyRecord = {
  sanitizedHtml?: string | null
  quotedHistoryText?: string | null
  headersSnapshot?: Record<string, string> | null
  blobKey?: string | null
  archivedAt?: string | null
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type PutColdBlobFn = (args: {
  pathname: string
  body: string
  token: string
}) => Promise<{ url: string }>

/**
 * Isolated per-Payload in-memory cold body store used automatically when `payload.db` has no
 * SQL pool (e.g., deterministic unit-test harnesses).
 */
const inMemoryBodiesByPayload = new WeakMap<object, Map<string, ColdMailBodyRecord>>()

function getInMemoryStore(payload: Payload | null | undefined): Map<string, ColdMailBodyRecord> {
  const key = (payload && typeof payload === 'object' ? payload : globalThis) as object
  let map = inMemoryBodiesByPayload.get(key)
  if (!map) {
    map = new Map<string, ColdMailBodyRecord>()
    inMemoryBodiesByPayload.set(key, map)
  }
  return map
}

function toPositiveIntegerId(rawId: number | string | null | undefined): number | null {
  if (typeof rawId === 'number' && Number.isInteger(rawId) && rawId > 0) return rawId
  if (typeof rawId === 'string' && /^\d+$/.test(rawId.trim())) {
    const parsed = Number.parseInt(rawId.trim(), 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

function normalizeHeadersSnapshot(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
    else if (v !== null && v !== undefined) out[k] = String(v)
  }
  return Object.keys(out).length > 0 ? out : {}
}

/**
 * Upserts cold MIME payload fields (`sanitized_html`, `quoted_history_text`, `headers_snapshot`,
 * `blob_key`, `archived_at`) into the dedicated 1:1 `mail_message_bodies` table (`R-13`).
 *
 * Runs inside the caller's active `req.transactionID` session when present so `ON DELETE CASCADE`
 * foreign-key visibility on newly inserted `mail_messages(id)` rows is immediate and atomic.
 */
export async function upsertMailMessageBody({
  payload,
  req,
  messageId,
  body,
}: {
  payload: Payload
  req?: PayloadRequest | null
  messageId: number | string
  body: Partial<ColdMailBodyRecord>
}): Promise<void> {
  const hasSanitizedHtml = 'sanitizedHtml' in body && body.sanitizedHtml !== undefined
  const hasQuotedHistoryText = 'quotedHistoryText' in body && body.quotedHistoryText !== undefined
  const hasHeadersSnapshot = 'headersSnapshot' in body && body.headersSnapshot !== undefined
  const hasBlobKey = 'blobKey' in body && body.blobKey !== undefined
  const hasArchivedAt = 'archivedAt' in body && body.archivedAt !== undefined

  if (
    !hasSanitizedHtml &&
    !hasQuotedHistoryText &&
    !hasHeadersSnapshot &&
    !hasBlobKey &&
    !hasArchivedAt
  ) {
    return
  }

  const normalizedHeaders = hasHeadersSnapshot
    ? normalizeHeadersSnapshot(body.headersSnapshot)
    : null
  const numericId = toPositiveIntegerId(messageId)

  if (numericId !== null) {
    const bodiesTable = qualifiedPayloadTable(payload, MAIL_MESSAGE_BODIES_TABLE)
    const sqlRes = await executePayloadSql(
      payload,
      `INSERT INTO ${bodiesTable} (
         "message_id",
         "sanitized_html",
         "quoted_history_text",
         "headers_snapshot",
         "blob_key",
         "archived_at",
         "updated_at"
       )
       VALUES ($1::int, $2, $3, $4::jsonb, $5, $6::timestamptz, NOW())
       ON CONFLICT ("message_id") DO UPDATE SET
         "sanitized_html" = CASE WHEN $7::boolean THEN EXCLUDED."sanitized_html" ELSE ${bodiesTable}."sanitized_html" END,
         "quoted_history_text" = CASE WHEN $8::boolean THEN EXCLUDED."quoted_history_text" ELSE ${bodiesTable}."quoted_history_text" END,
         "headers_snapshot" = CASE WHEN $9::boolean THEN EXCLUDED."headers_snapshot" ELSE ${bodiesTable}."headers_snapshot" END,
         "blob_key" = CASE WHEN $10::boolean THEN EXCLUDED."blob_key" ELSE ${bodiesTable}."blob_key" END,
         "archived_at" = CASE WHEN $11::boolean THEN EXCLUDED."archived_at" ELSE ${bodiesTable}."archived_at" END,
         "updated_at" = NOW()`,
      [
        numericId,
        hasSanitizedHtml ? (body.sanitizedHtml ?? null) : null,
        hasQuotedHistoryText ? (body.quotedHistoryText ?? null) : null,
        hasHeadersSnapshot && normalizedHeaders !== null ? JSON.stringify(normalizedHeaders) : null,
        hasBlobKey ? (body.blobKey ?? null) : null,
        hasArchivedAt ? (body.archivedAt ?? null) : null,
        hasSanitizedHtml,
        hasQuotedHistoryText,
        hasHeadersSnapshot,
        hasBlobKey,
        hasArchivedAt,
      ],
      req,
    )
    if (sqlRes !== null) {
      return
    }
  }

  // Fallback for in-memory test harnesses (`payload.db = {}`)
  const store = getInMemoryStore(payload)
  const key = String(messageId)
  const existing = store.get(key) ?? {}
  store.set(key, {
    sanitizedHtml: hasSanitizedHtml ? (body.sanitizedHtml ?? null) : existing.sanitizedHtml,
    quotedHistoryText: hasQuotedHistoryText
      ? (body.quotedHistoryText ?? null)
      : existing.quotedHistoryText,
    headersSnapshot: hasHeadersSnapshot ? normalizedHeaders : existing.headersSnapshot,
    blobKey: hasBlobKey ? (body.blobKey ?? null) : existing.blobKey,
    archivedAt: hasArchivedAt ? (body.archivedAt ?? null) : existing.archivedAt,
  })
}

async function fetchColdBodyFromBlob(
  blobUrl: string,
  options: { token?: string; fetchImpl?: FetchLike },
): Promise<ColdMailBodyRecord | null> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchFn !== 'function') return null

  const token = (options.token ?? process.env.BLOB_READ_WRITE_TOKEN ?? '').trim()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const res = await fetchFn(blobUrl, { headers })
    if (!res.ok) return null
    const parsed = (await res.json()) as Record<string, unknown>
    return {
      sanitizedHtml: typeof parsed.sanitizedHtml === 'string' ? parsed.sanitizedHtml : '',
      quotedHistoryText:
        typeof parsed.quotedHistoryText === 'string' ? parsed.quotedHistoryText : '',
      headersSnapshot: normalizeHeadersSnapshot(parsed.headersSnapshot),
    }
  } catch {
    return null
  }
}

/**
 * Lazy-hydrates cold MIME bodies (`sanitizedHtml`, `quotedHistoryText`, `headersSnapshot`) for a
 * batch of `mail-messages` documents in a single `WHERE "message_id" = ANY($1::int[])` query.
 *
 * If an archived message's cold payload was offloaded to Vercel Blob (`blob_key` set and inline
 * columns cleared), transparently fetches and rehydrates the JSON payload from Blob storage.
 */
export async function hydrateMailMessageBodies({
  payload,
  req,
  docs,
  fetchImpl,
  blobToken,
}: {
  payload: Payload
  req?: PayloadRequest | null
  docs: Array<Record<string, unknown>>
  fetchImpl?: FetchLike
  blobToken?: string
}): Promise<void> {
  if (!Array.isArray(docs) || docs.length === 0) return

  const numericIds = Array.from(
    new Set(
      docs
        .map((d) => toPositiveIntegerId(d.id as number | string | undefined))
        .filter((id): id is number => id !== null),
    ),
  )

  type SqlBodyRow = {
    message_id: number | string
    sanitized_html: string | null
    quoted_history_text: string | null
    headers_snapshot: Record<string, string> | string | null
    blob_key: string | null
  }

  let sqlLookup: Map<string, ColdMailBodyRecord> | null = null
  if (numericIds.length > 0) {
    const bodiesTable = qualifiedPayloadTable(payload, MAIL_MESSAGE_BODIES_TABLE)
    const sqlRes = await executePayloadSql<SqlBodyRow>(
      payload,
      `SELECT
         "message_id",
         "sanitized_html",
         "quoted_history_text",
         "headers_snapshot",
         "blob_key"
       FROM ${bodiesTable}
       WHERE "message_id" = ANY($1::int[])`,
      [numericIds],
      req,
    )

    if (sqlRes !== null) {
      sqlLookup = new Map<string, ColdMailBodyRecord>()
      for (const row of sqlRes.rows) {
        let parsedHeaders: Record<string, string> | null = null
        if (typeof row.headers_snapshot === 'string') {
          try {
            parsedHeaders = normalizeHeadersSnapshot(JSON.parse(row.headers_snapshot))
          } catch {
            parsedHeaders = null
          }
        } else {
          parsedHeaders = normalizeHeadersSnapshot(row.headers_snapshot)
        }

        sqlLookup.set(String(row.message_id), {
          sanitizedHtml: row.sanitized_html,
          quotedHistoryText: row.quoted_history_text,
          headersSnapshot: parsedHeaders,
          blobKey: row.blob_key,
        })
      }
    }
  }

  const memoryStore = sqlLookup === null ? getInMemoryStore(payload) : null

  await Promise.all(
    docs.map(async (doc) => {
      const key = String(doc.id ?? '')
      if (!key) return
      let record = sqlLookup ? sqlLookup.get(key) : memoryStore?.get(key)

      if (
        record?.blobKey &&
        (record.sanitizedHtml === null || record.sanitizedHtml === undefined) &&
        (record.quotedHistoryText === null || record.quotedHistoryText === undefined)
      ) {
        const fromBlob = await fetchColdBodyFromBlob(record.blobKey, {
          token: blobToken,
          fetchImpl,
        })
        if (fromBlob) {
          record = { ...record, ...fromBlob }
        }
      }

      if (!record) return

      if (record.sanitizedHtml !== undefined && record.sanitizedHtml !== null) {
        doc.sanitizedHtml = record.sanitizedHtml
      }
      if (record.quotedHistoryText !== undefined && record.quotedHistoryText !== null) {
        doc.quotedHistoryText = record.quotedHistoryText
      }
      if (record.headersSnapshot !== undefined && record.headersSnapshot !== null) {
        doc.headersSnapshot = record.headersSnapshot
      }
    }),
  )
}

const defaultPutColdBlob: PutColdBlobFn = async ({ pathname, body, token }) => {
  const uploaded = await put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    token,
  })
  return { url: uploaded.url }
}

/**
 * Offloads cold MIME bodies (`sanitized_html`, `quoted_history_text`, `headers_snapshot`) of
 * archived/trashed threads older than `olderThanDays` to private Vercel Blob objects (`R-13`),
 * clearing inline PostgreSQL TOAST pages while retaining `blob_key` for transparent lazy reads.
 */
export async function archiveColdMailBodies({
  payload,
  req,
  olderThanDays = 90,
  batchSize = 50,
  blobToken,
  putBlobImpl = defaultPutColdBlob,
}: {
  payload: Payload
  req?: PayloadRequest | null
  olderThanDays?: number
  batchSize?: number
  blobToken?: string
  putBlobImpl?: PutColdBlobFn
}): Promise<{
  archivedCount: number
  skippedReason?: string
  cutoffIso: string
}> {
  const days = olderThanDays > 0 ? olderThanDays : 90
  const limit = Math.min(500, Math.max(1, batchSize))
  const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString()
  const token = (blobToken ?? process.env.BLOB_READ_WRITE_TOKEN ?? '').trim()

  if (!token || token.includes('placeholder')) {
    return {
      archivedCount: 0,
      skippedReason: 'BLOB_READ_WRITE_TOKEN is not configured.',
      cutoffIso,
    }
  }

  const bodiesTable = qualifiedPayloadTable(payload, MAIL_MESSAGE_BODIES_TABLE)
  const messagesTable = qualifiedPayloadTable(payload, 'mail_messages')
  const threadsTable = qualifiedPayloadTable(payload, 'mail_threads')

  type CandidateRow = {
    message_id: number
    sanitized_html: string | null
    quoted_history_text: string | null
    headers_snapshot: Record<string, string> | null
  }

  const candidatesRes = await executePayloadSql<CandidateRow>(
    payload,
    `SELECT
       b."message_id",
       b."sanitized_html",
       b."quoted_history_text",
       b."headers_snapshot"
     FROM ${bodiesTable} b
     INNER JOIN ${messagesTable} m ON m."id" = b."message_id"
     INNER JOIN ${threadsTable} t ON t."id" = m."thread_id"
     WHERE b."blob_key" IS NULL
       AND t."folder" IN ('archive', 'trash')
       AND m."sent_at" < $1::timestamptz
       AND (
         COALESCE(LENGTH(b."sanitized_html"), 0) +
         COALESCE(LENGTH(b."quoted_history_text"), 0)
       ) > 1024
     ORDER BY m."sent_at" ASC
     LIMIT $2::int`,
    [cutoffIso, limit],
    req,
  )

  if (!candidatesRes || candidatesRes.rows.length === 0) {
    return { archivedCount: 0, cutoffIso }
  }

  let archivedCount = 0
  for (const row of candidatesRes.rows) {
    const serialized = JSON.stringify({
      version: 1,
      messageId: row.message_id,
      sanitizedHtml: row.sanitized_html ?? '',
      quotedHistoryText: row.quoted_history_text ?? '',
      headersSnapshot: row.headers_snapshot ?? {},
    })

    const uploaded = await putBlobImpl({
      pathname: `mail-bodies/msg-${row.message_id}.json`,
      body: serialized,
      token,
    })

    await executePayloadSql(
      payload,
      `UPDATE ${bodiesTable}
       SET
         "blob_key" = $2,
         "archived_at" = NOW(),
         "sanitized_html" = NULL,
         "quoted_history_text" = NULL,
         "headers_snapshot" = NULL,
         "updated_at" = NOW()
       WHERE "message_id" = $1::int`,
      [row.message_id, uploaded.url],
      req,
    )
    archivedCount += 1
  }

  return {
    archivedCount,
    cutoffIso,
  }
}

export function createArchiveColdMailBodiesTask(): TaskConfig {
  return {
    slug: ARCHIVE_COLD_MAIL_BODIES_TASK_SLUG,
    label: 'Archive cold mail MIME bodies to Blob',
    retries: 1,
    schedule: [
      {
        cron: '20 4 * * 0',
        queue: 'mail',
      },
    ],
    inputSchema: [
      {
        name: 'olderThanDays',
        type: 'number',
        defaultValue: 90,
      },
      {
        name: 'batchSize',
        type: 'number',
        defaultValue: 50,
      },
    ],
    outputSchema: [
      { name: 'archivedCount', type: 'number' },
      { name: 'cutoffIso', type: 'text' },
      { name: 'skippedReason', type: 'text' },
    ],
    handler: async ({ input, req }) => {
      const rec = (input ?? {}) as Record<string, unknown>
      const olderThanDays =
        typeof rec.olderThanDays === 'number' && rec.olderThanDays > 0 ? rec.olderThanDays : 90
      const batchSize =
        typeof rec.batchSize === 'number' && rec.batchSize > 0 ? rec.batchSize : 50

      const out = await archiveColdMailBodies({
        payload: req.payload,
        req,
        olderThanDays,
        batchSize,
      })

      return {
        output: {
          archivedCount: out.archivedCount,
          cutoffIso: out.cutoffIso,
          skippedReason: out.skippedReason ?? '',
        },
      }
    },
  }
}
