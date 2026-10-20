import type {
  CollectionConfig,
  GlobalConfig,
  Plugin,
  SanitizedCollectionConfig,
} from 'payload'

type CollectionHooks = NonNullable<CollectionConfig['hooks']>
type AfterChangeHook = NonNullable<CollectionHooks['afterChange']>[number]
type AfterDeleteHook = NonNullable<CollectionHooks['afterDelete']>[number]
type AfterLoginHook = NonNullable<CollectionHooks['afterLogin']>[number]
type AfterLogoutHook = NonNullable<CollectionHooks['afterLogout']>[number]

import {
  actorName,
  changesBetween,
  isAuditedCollection,
  recordAudit,
  requestIP,
} from '../audit/record'

/**
 * Audit log hooks (CR-12 E5). A plugin so a new collection or global is audited without touching
 * its config: every content collection gets `afterChange` and `afterDelete`, every global an
 * `afterChange`, and auth collections get `afterLogin`/`afterLogout`.
 *
 * The system collections (the log itself, job runs, page speed reports, Payload's own tables) are
 * never audited. A collection can opt out with `custom: { audit: false }`; a request can do so with
 * `context: { skipAudit: true }` (used by the seed).
 */

const labelOf = (label: unknown): string | undefined => {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const record = label as Record<string, unknown>
    return typeof record.en === 'string' ? record.en : undefined
  }
  return undefined
}

/** The document's name as editors know it: the title field, the file name, or the id. */
function documentTitle(config: SanitizedCollectionConfig, doc: Record<string, unknown>): string {
  const field = config.admin?.useAsTitle
  if (field) {
    const value = doc[field]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200)
    if (typeof value === 'number') return String(value)
  }
  if (typeof doc.filename === 'string' && doc.filename) return doc.filename
  return `#${String(doc.id ?? '')}`
}

const skip = (req: { context?: Record<string, unknown> }) => req.context?.skipAudit === true

/** afterChange: create, update, trash and restore. */
const collectionAfterChange =
  (): AfterChangeHook =>
  async ({ collection, doc, operation, previousDoc, req }) => {
    if (skip(req) || !isAuditedCollection(collection.slug)) return doc
    const record = doc as Record<string, unknown>
    const previous = previousDoc as Record<string, unknown> | undefined
    const wasTrashed = Boolean(previous?.deletedAt)
    const isTrashed = Boolean(record.deletedAt)
    const action =
      operation === 'create'
        ? 'create'
        : isTrashed && !wasTrashed
          ? 'trash'
          : !isTrashed && wasTrashed
            ? 'restore'
            : 'update'
    const title = documentTitle(collection, record)
    const label = labelOf(collection.labels?.singular) ?? collection.slug
    const subject = `the ${label.toLowerCase()} “${title}”`
    const verb =
      action === 'create'
        ? 'created'
        : action === 'trash'
          ? 'moved to the trash'
          : action === 'restore'
            ? 'restored'
            : 'updated'
    const who = actorName((req.user as { email?: string } | null)?.email)

    await recordAudit(
      req.payload,
      {
        action,
        summary: `${who} ${verb} ${subject}`,
        entity: collection.slug,
        entityLabel: label,
        entityKind: 'collection',
        documentId: String(record.id ?? ''),
        documentTitle: title,
        changes: action === 'update' || action === 'create' ? changesBetween(previous, record) : [],
      },
      req,
    )
    return doc
  }

/** afterDelete: a permanent delete (trashing is an update with `deletedAt`). */
const collectionAfterDelete =
  (): AfterDeleteHook =>
  async ({ collection, doc, req }) => {
    if (skip(req) || !isAuditedCollection(collection.slug)) return doc
    const record = doc as Record<string, unknown>
    const title = documentTitle(collection, record)
    const label = labelOf(collection.labels?.singular) ?? collection.slug
    const who = actorName((req.user as { email?: string } | null)?.email)
    await recordAudit(
      req.payload,
      {
        action: 'delete',
        summary: `${who} deleted the ${label.toLowerCase()} “${title}” permanently`,
        entity: collection.slug,
        entityLabel: label,
        entityKind: 'collection',
        documentId: String(record.id ?? ''),
        documentTitle: title,
      },
      req,
    )
    return doc
  }

type GlobalAfterChangeHook = NonNullable<NonNullable<GlobalConfig['hooks']>['afterChange']>[number]

/** Global afterChange: one document per global, so every write is an update. */
const globalAfterChange = (): GlobalAfterChangeHook => async ({ doc, global, previousDoc, req }) => {
  if (skip(req) || !isAuditedCollection(global.slug)) return doc
  const label = labelOf(global.label) ?? global.slug
  const who = actorName((req.user as { email?: string } | null)?.email)
  const changes = changesBetween(
    previousDoc as Record<string, unknown> | undefined,
    doc as Record<string, unknown>,
  )
  await recordAudit(
    req.payload,
    {
      action: 'update',
      summary: `${who} updated the ${label.toLowerCase()}`,
      entity: global.slug,
      entityLabel: label,
      entityKind: 'global',
      changes,
    },
    req,
  )
  return doc
}

const afterLogin =
  (): AfterLoginHook =>
  async ({ collection, req, user }) => {
    if (skip(req) || !isAuditedCollection(collection.slug)) return user
    const record = user as Record<string, unknown>
    const email = typeof record.email === 'string' ? record.email : null
    await recordAudit(
      req.payload,
      {
        action: 'login',
        summary: `${actorName(email)} signed in`,
        entity: collection.slug,
        entityLabel: labelOf(collection.labels?.plural) ?? 'Users',
        entityKind: 'collection',
        documentId: String(record.id ?? ''),
        documentTitle: email ?? undefined,
        userEmail: email,
        userId: (record.id as number | string | undefined) ?? null,
        ip: requestIP(req),
      },
      req,
    )
    return user
  }

const afterLogout =
  (): AfterLogoutHook =>
  async ({ collection, req }) => {
    if (skip(req) || !isAuditedCollection(collection.slug)) return undefined
    const record = (req.user ?? null) as Record<string, unknown> | null
    const email = typeof record?.email === 'string' ? record.email : null
    await recordAudit(
      req.payload,
      {
        action: 'logout',
        summary: `${actorName(email)} signed out`,
        entity: collection.slug,
        entityLabel: labelOf(collection.labels?.plural) ?? 'Users',
        entityKind: 'collection',
        documentId: record?.id ? String(record.id) : undefined,
        documentTitle: email ?? undefined,
        userEmail: email,
        userId: (record?.id as number | string | undefined) ?? null,
        ip: requestIP(req),
      },
      req,
    )
    return undefined
  }

const append = <T>(hooks: T[] | undefined, next: T): T[] => [...(hooks ?? []), next]

const withCollectionHooks = (collection: CollectionConfig): CollectionConfig => {
  if (collection.custom?.audit === false || !isAuditedCollection(collection.slug))
    return collection
  const hooks = collection.hooks ?? {}
  return {
    ...collection,
    hooks: {
      ...hooks,
      afterChange: append(hooks.afterChange, collectionAfterChange()),
      afterDelete: append(hooks.afterDelete, collectionAfterDelete()),
      ...(collection.auth
        ? {
            afterLogin: append(hooks.afterLogin, afterLogin()),
            afterLogout: append(hooks.afterLogout, afterLogout()),
          }
        : {}),
    },
  }
}

const withGlobalHooks = (global: GlobalConfig): GlobalConfig => {
  if (global.custom?.audit === false || !isAuditedCollection(global.slug)) return global
  return {
    ...global,
    hooks: {
      ...global.hooks,
      afterChange: append(global.hooks?.afterChange, globalAfterChange()),
    },
  }
}

/**
 * Installs the audit hooks. Run it before the admin UI plugin so the collections it maps keep
 * their hooks, and after any plugin that adds collections or globals.
 */
export const auditLogPlugin = (): Plugin => (config) => ({
  ...config,
  collections: (config.collections ?? []).map(withCollectionHooks),
  globals: (config.globals ?? []).map(withGlobalHooks),
})
