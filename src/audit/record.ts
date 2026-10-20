import type { Payload, PayloadRequest } from 'payload'

/**
 * Writes audit entries (CR-12 E5). Called from the hooks the audit plugin installs on every content
 * collection and global, and from the users collection's sign-in hooks.
 *
 * Entries are written with the Local API and `overrideAccess`, outside the caller's transaction, so
 * a failed log write never fails (or rolls back) the content change itself, and the log cannot be
 * influenced by the caller's access rights. Every failure is logged and swallowed.
 */

export type AuditAction =
  | 'create'
  | 'update'
  | 'trash'
  | 'restore'
  | 'delete'
  | 'login'
  | 'logout'

export type AuditChange = { field: string; from?: unknown; to?: unknown }

export type AuditEntry = {
  action: AuditAction
  summary: string
  entity: string
  entityLabel?: string
  entityKind?: 'collection' | 'global'
  documentId?: string
  documentTitle?: string
  /** Account id. Text, not a relationship: an entry must survive deleting the account. */
  userId?: number | string | null
  userEmail?: string | null
  ip?: string | null
  changes?: AuditChange[]
}

/** Collections that record their own history or are internal: never audited. */
const SYSTEM_COLLECTIONS = new Set([
  'audit-logs',
  'job-runs',
  'pagespeed-reports',
  'payload-jobs',
  'payload-job-stats',
  'payload-locked-documents',
  'payload-migrations',
  'payload-preferences',
  'payload-query-presets',
  'payload-folders',
])

export const isAuditedCollection = (slug: string) => !SYSTEM_COLLECTIONS.has(slug)

/** Fields that are secrets or noise: kept out of the change list. */
const PRIVATE_FIELD =
  /(pass(word|hash)|salt|token|secret|api[-_]?key|authorization|cookie|session|salted|hash|lock_?until|login_?attempts)/i

/** Bookkeeping fields that would make every update look like a change of the whole document. */
const NOISE_FIELD = /^(id|createdAt|updatedAt|sizes|_status|deletedAt)$/

const MAX_CHANGES = 25
const MAX_VALUE_LENGTH = 160
const MAX_ARRAY_ITEMS = 8

/** JSON-safe, short value for the change list: no secrets, no megabytes. */
function summarise(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map(summarise)
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    // A populated relationship: keep its identity, not the whole document.
    if ('id' in record) return { id: record.id }
    return '[object]'
  }
  return String(value)
}

/**
 * The fields a create or update touched, with the previous and new value. Only top-level fields
 * are compared; arrays and groups are compared as a whole (summarised), which keeps the entry
 * readable and the write cheap.
 */
export function changesBetween(
  previousDoc: Record<string, unknown> | null | undefined,
  doc: Record<string, unknown> | null | undefined,
): AuditChange[] {
  if (!doc) return []
  const changes: AuditChange[] = []
  const previous = previousDoc ?? {}
  for (const field of Object.keys(doc)) {
    if (PRIVATE_FIELD.test(field) || NOISE_FIELD.test(field)) continue
    const before = summarise(previous[field])
    const after = summarise(doc[field])
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    changes.push(previousDoc ? { field, from: before, to: after } : { field, to: after })
    if (changes.length >= MAX_CHANGES) break
  }
  return changes
}

/** The caller's address, as Vercel or a reverse proxy reports it. */
export function requestIP(req: PayloadRequest | null | undefined): string | null {
  const headers = req?.headers
  if (!headers) return null
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return headers.get('x-real-ip')?.trim() || null
}

const actorOf = (user: unknown): { id: number | string | null; email: string | null } => {
  if (!user || typeof user !== 'object') return { id: null, email: null }
  const record = user as { id?: number | string; email?: string | null }
  return {
    id: typeof record.id === 'number' || typeof record.id === 'string' ? record.id : null,
    email: typeof record.email === 'string' ? record.email : null,
  }
}

/** Who to name in the summary: the signer, or "System" for automated writes. */
export const actorName = (email: string | null | undefined) => email?.trim() || 'System'

/** Writes one entry. Never throws: a missing table or a failing write is logged only. */
export async function recordAudit(
  payload: Payload,
  entry: AuditEntry,
  req?: PayloadRequest | null,
): Promise<void> {
  const actor = actorOf(req?.user)
  const userEmail = entry.userEmail ?? actor.email ?? null
  const data = {
    action: entry.action,
    summary: entry.summary,
    entity: entry.entity,
    entityLabel: entry.entityLabel ?? entry.entity,
    entityKind: entry.entityKind ?? 'collection',
    documentId: entry.documentId ?? null,
    documentTitle: entry.documentTitle ?? null,
    userId:
      entry.userId !== null && entry.userId !== undefined
        ? String(entry.userId)
        : actor.id !== null
          ? String(actor.id)
          : null,
    userEmail,
    ip: entry.ip ?? requestIP(req),
    changes: entry.changes && entry.changes.length > 0 ? entry.changes : null,
  }
  try {
    // The caller's request, when there is one, keeps the entry in the same transaction as the change
    // it describes: a rolled-back change leaves no entry, and the write cannot deadlock on a row the
    // caller still holds (the log has no foreign keys). The log's own collection has no hooks.
    await payload.create({
      collection: 'audit-logs',
      data: data as never,
      depth: 0,
      overrideAccess: true,
      ...(req ? { req } : {}),
    })
  } catch (error) {
    payload.logger.error({
      msg: 'Audit log write failed',
      err: error instanceof Error ? error : new Error(String(error)),
      action: entry.action,
      entity: entry.entity,
    })
  }
}
