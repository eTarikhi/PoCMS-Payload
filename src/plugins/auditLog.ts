import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterLoginHook,
  CollectionConfig,
  GlobalAfterChangeHook,
  GlobalConfig,
  PayloadRequest,
  Plugin,
} from 'payload'

import type { AuditAction } from '@/collections/AuditLogs'

export const AUDIT_LOG_COLLECTION = 'audit-logs'

const IGNORED_FIELD_DIFF_KEYS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'salt',
  'hash',
  'loginAttempts',
  'lockUntil',
  'resetPasswordToken',
  'resetPasswordExpiration',
  'sessions',
  'permissions',
])

export type ActorSnapshot = {
  actorId: number | string | null
  actorName: string | null
  actorEmail: string | null
  actorLabel: string
}

/** Extracts an immutable snapshot of the user performing an action. */
export const extractActorSnapshot = (user: unknown): ActorSnapshot => {
  if (!user || typeof user !== 'object') {
    return {
      actorId: null,
      actorName: null,
      actorEmail: null,
      actorLabel: 'System',
    }
  }

  const record = user as Record<string, unknown>
  const rawId = record.id
  const actorId = typeof rawId === 'number' || typeof rawId === 'string' ? rawId : null
  const actorName =
    typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : null
  const actorEmail =
    typeof record.email === 'string' && record.email.trim().length > 0 ? record.email.trim() : null

  const actorLabel =
    actorName && actorEmail
      ? `${actorName} (${actorEmail})`
      : actorName ?? actorEmail ?? (actorId !== null ? `User #${actorId}` : 'System')

  return {
    actorId,
    actorName,
    actorEmail,
    actorLabel,
  }
}

/** Determines whether a `change` hook represents a create, normal edit, trash, or trash restore. */
export const resolveAuditAction = ({
  operation,
  doc,
  previousDoc,
}: {
  operation: 'create' | 'update'
  doc: Record<string, unknown> | null | undefined
  previousDoc?: Record<string, unknown> | null
}): Extract<AuditAction, 'create' | 'update' | 'trash' | 'restore'> => {
  if (operation === 'create') return 'create'
  const wasDeleted = Boolean(previousDoc?.deletedAt)
  const isDeleted = Boolean(doc?.deletedAt)
  if (!wasDeleted && isDeleted) return 'trash'
  if (wasDeleted && !isDeleted) return 'restore'
  return 'update'
}

/** Resolves a human-readable title snapshot for any document. */
export const extractDocumentTitle = (
  doc: Record<string, unknown> | null | undefined,
  useAsTitle?: string,
): string => {
  if (!doc) return ''
  const candidates = [
    useAsTitle ? doc[useAsTitle] : undefined,
    doc.title,
    doc.name,
    doc.sureName,
    doc.category,
    doc.label,
    doc.filename,
    doc.email,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return doc.id !== undefined ? `#${String(doc.id)}` : ''
}

/** Computes top-level field names whose JSON representation changed between `previousDoc` and `doc`. */
export const computeChangedFields = (
  doc: Record<string, unknown> | null | undefined,
  previousDoc: Record<string, unknown> | null | undefined,
): string[] => {
  if (!doc || !previousDoc) return []
  const keys = new Set([...Object.keys(doc), ...Object.keys(previousDoc)])
  const changed: string[] = []
  for (const key of keys) {
    if (IGNORED_FIELD_DIFF_KEYS.has(key)) continue
    if (JSON.stringify(doc[key]) !== JSON.stringify(previousDoc[key])) {
      changed.push(key)
    }
  }
  return changed.sort()
}

const ACTION_VERBS: Record<AuditAction, string> = {
  create: 'created',
  update: 'edited',
  trash: 'trashed',
  restore: 'restored',
  delete: 'deleted',
  login: 'signed in',
  backup: 'backed up',
  maintenance: 'maintained',
}

export const buildAuditSummary = ({
  action,
  actor,
  entityLabel,
  documentTitle,
}: {
  action: AuditAction
  actor: ActorSnapshot
  entityLabel: string
  documentTitle?: string
}): string => {
  const who = actor.actorName ?? actor.actorEmail ?? actor.actorLabel
  if (action === 'login') {
    return `${who} signed in`
  }
  const verb = ACTION_VERBS[action]
  const target = documentTitle ? `${entityLabel} "${documentTitle}"` : entityLabel
  return `${who} ${verb} ${target}`
}

const extractRequestMetadata = (req: PayloadRequest): { ip: string | null; userAgent: string | null } => {
  try {
    const headers = req.headers
    if (!headers || typeof headers.get !== 'function') {
      return { ip: null, userAgent: null }
    }
    const forwarded = headers.get('x-forwarded-for')
    const ip =
      (forwarded ? forwarded.split(',')[0]?.trim() : null) ||
      headers.get('x-real-ip')?.trim() ||
      null
    const userAgent = headers.get('user-agent')?.trim() || null
    return { ip, userAgent }
  } catch {
    return { ip: null, userAgent: null }
  }
}

const labelOfEntity = (
  label: unknown,
  fallback: string,
): string => {
  if (typeof label === 'string' && label.trim().length > 0) return label
  if (label && typeof label === 'object') {
    const record = label as Record<string, unknown>
    if (typeof record.en === 'string') return record.en
  }
  return fallback
}

async function writeAuditEntry(
  req: PayloadRequest,
  entry: {
    action: AuditAction
    entityKind: 'collection' | 'global' | 'auth' | 'database'
    entityType: string
    documentId?: string | null
    documentTitle?: string | null
    actor: ActorSnapshot
    summary: string
    meta?: Record<string, unknown> | null
  },
): Promise<void> {
  try {
    const { ip, userAgent } = extractRequestMetadata(req)
    // Numeric vs string actor IDs: pass actor ID only when valid for the users collection.
    const actorValue =
      typeof entry.actor.actorId === 'number'
        ? entry.actor.actorId
        : typeof entry.actor.actorId === 'string' && /^\d+$/.test(entry.actor.actorId)
          ? Number(entry.actor.actorId)
          : undefined

    await req.payload.create({
      collection: AUDIT_LOG_COLLECTION,
      overrideAccess: true,
      req,
      context: { ...(req.context ?? {}), skipAuditLog: true, skipRevalidate: true },
      data: {
        action: entry.action,
        entityKind: entry.entityKind,
        entityType: entry.entityType,
        documentId: entry.documentId ?? null,
        documentTitle: entry.documentTitle ?? null,
        ...(actorValue !== undefined ? { actor: actorValue } : {}),
        actorName: entry.actor.actorName,
        actorEmail: entry.actor.actorEmail,
        actorLabel: entry.actor.actorLabel,
        summary: entry.summary,
        ip,
        userAgent,
        meta: entry.meta ?? null,
      },
    })
  } catch (error) {
    req.payload?.logger?.error(
      `[audit-log] Failed to record ${entry.action} on ${entry.entityType}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Records an immutable audit trail entry for database management operations
 * (logical backup, restore, repair/vacuum, provider snapshots, branches, compute controls).
 */
export async function recordDatabaseAuditLog(
  req: PayloadRequest,
  input: {
    action: Extract<AuditAction, 'backup' | 'restore' | 'maintenance' | 'create' | 'delete'>
    entityType: string
    documentId?: string | null
    documentTitle?: string | null
    summary?: string
    meta?: Record<string, unknown> | null
  },
): Promise<void> {
  const actor = extractActorSnapshot(req.user)
  const who = actor.actorName ?? actor.actorEmail ?? actor.actorLabel
  const defaultSummary =
    input.summary ??
    `${who} ${ACTION_VERBS[input.action]} ${input.entityType}${input.documentTitle ? ` "${input.documentTitle}"` : ''}`

  await writeAuditEntry(req, {
    action: input.action,
    entityKind: 'database',
    entityType: input.entityType,
    documentId: input.documentId ?? null,
    documentTitle: input.documentTitle ?? null,
    actor,
    summary: defaultSummary,
    meta: input.meta ?? null,
  })
}

const shouldAuditCollection = (collection: CollectionConfig): boolean => {
  if (collection.slug === AUDIT_LOG_COLLECTION) return false
  if (collection.slug.startsWith('payload-')) return false
  if (collection.custom?.auditLog === false) return false
  return true
}

function createCollectionAfterChange(collection: CollectionConfig): CollectionAfterChangeHook {
  const useAsTitle = collection.admin?.useAsTitle
  const entityLabel = labelOfEntity(collection.labels?.singular, collection.slug)

  return async ({ context, doc, operation, previousDoc, req }) => {
    if (context?.skipAuditLog) return doc
    // Skip high-frequency 1-second draft autosave ticks; explicit saves & publishes are still logged.
    if (operation === 'update' && Boolean(req?.query?.autosave)) return doc

    const docRecord = (doc ?? {}) as Record<string, unknown>
    const prevRecord = (previousDoc ?? null) as Record<string, unknown> | null
    const changedFields =
      operation === 'update' ? computeChangedFields(docRecord, prevRecord) : []

    // Payload updates internal auth fields (sessions, loginAttempts, lockUntil) on login/logout
    // without meaningful user field changes. Skip those noise updates; sign-ins are logged via afterLogin.
    if (collection.auth && operation === 'update' && changedFields.length === 0) {
      return doc
    }

    const action = resolveAuditAction({ operation, doc: docRecord, previousDoc: prevRecord })
    const actor = extractActorSnapshot(req.user)
    const documentTitle = extractDocumentTitle(docRecord, useAsTitle)

    await writeAuditEntry(req, {
      action,
      entityKind: 'collection',
      entityType: collection.slug,
      documentId: docRecord.id !== undefined ? String(docRecord.id) : null,
      documentTitle,
      actor,
      summary: buildAuditSummary({ action, actor, entityLabel, documentTitle }),
      meta: changedFields.length > 0 ? { changedFields } : null,
    })

    return doc
  }
}

function createCollectionAfterDelete(collection: CollectionConfig): CollectionAfterDeleteHook {
  const useAsTitle = collection.admin?.useAsTitle
  const entityLabel = labelOfEntity(collection.labels?.singular, collection.slug)

  return async ({ context, doc, id, req }) => {
    if (context?.skipAuditLog) return doc

    const docRecord = (doc ?? {}) as Record<string, unknown>
    const actor = extractActorSnapshot(req.user)
    const documentTitle = extractDocumentTitle(docRecord, useAsTitle) || `#${String(id)}`

    await writeAuditEntry(req, {
      action: 'delete',
      entityKind: 'collection',
      entityType: collection.slug,
      documentId: String(id),
      documentTitle,
      actor,
      summary: buildAuditSummary({
        action: 'delete',
        actor,
        entityLabel,
        documentTitle,
      }),
    })

    return doc
  }
}

function createCollectionAfterLogin(collection: CollectionConfig): CollectionAfterLoginHook {
  return async ({ context, req, user }) => {
    if (context?.skipAuditLog) return user

    const userRecord = (user ?? {}) as Record<string, unknown>
    const actor = extractActorSnapshot(userRecord)
    const documentTitle = extractDocumentTitle(userRecord, collection.admin?.useAsTitle)

    await writeAuditEntry(req, {
      action: 'login',
      entityKind: 'auth',
      entityType: collection.slug,
      documentId: userRecord.id !== undefined ? String(userRecord.id) : null,
      documentTitle,
      actor,
      summary: buildAuditSummary({
        action: 'login',
        actor,
        entityLabel: collection.slug,
        documentTitle,
      }),
    })

    return user
  }
}

function createGlobalAfterChange(globalConfig: GlobalConfig): GlobalAfterChangeHook {
  const entityLabel = labelOfEntity(globalConfig.label, globalConfig.slug)

  return async ({ context, doc, previousDoc, req }) => {
    if (context?.skipAuditLog) return doc

    const docRecord = (doc ?? {}) as Record<string, unknown>
    const prevRecord = (previousDoc ?? null) as Record<string, unknown> | null
    const changedFields = computeChangedFields(docRecord, prevRecord)
    const actor = extractActorSnapshot(req.user)

    await writeAuditEntry(req, {
      action: 'update',
      entityKind: 'global',
      entityType: globalConfig.slug,
      documentId: null,
      documentTitle: entityLabel,
      actor,
      summary: buildAuditSummary({
        action: 'update',
        actor,
        entityLabel,
      }),
      meta: changedFields.length > 0 ? { changedFields } : null,
    })

    return doc
  }
}

/**
 * Payload plugin that attaches audit hooks to every governed/admin collection, auth collection,
 * and global, recording creates, edits, trashes, restores, deletes, and user sign-ins into `audit-logs`.
 */
export const auditLogPlugin = (): Plugin => (config) => ({
  ...config,
  collections: (config.collections ?? []).map((collection) => {
    if (!shouldAuditCollection(collection)) return collection

    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterChange: [
          ...(collection.hooks?.afterChange ?? []),
          createCollectionAfterChange(collection),
        ],
        afterDelete: [
          ...(collection.hooks?.afterDelete ?? []),
          createCollectionAfterDelete(collection),
        ],
        ...(collection.auth
          ? {
              afterLogin: [
                ...(collection.hooks?.afterLogin ?? []),
                createCollectionAfterLogin(collection),
              ],
            }
          : {}),
      },
    }
  }),
  globals: (config.globals ?? []).map((globalConfig) => {
    if (globalConfig.slug.startsWith('payload-')) return globalConfig
    if (globalConfig.custom?.auditLog === false) return globalConfig
    return {
      ...globalConfig,
      hooks: {
        ...globalConfig.hooks,
        afterChange: [
          ...(globalConfig.hooks?.afterChange ?? []),
          createGlobalAfterChange(globalConfig),
        ],
      },
    }
  }),
})
