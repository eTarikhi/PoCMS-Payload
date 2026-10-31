import type { VercelPostgresAdapterArgs } from '@payloadcms/db-vercel-postgres'

type PostgresSchemaHook = NonNullable<VercelPostgresAdapterArgs['beforeSchemaInit']>[number]

type RawColumnRef = {
  table: string
  name: string
  onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action'
}

type RawColumn = {
  name: string
  type: string
  notNull?: boolean
  reference?: RawColumnRef
}

type RawIndex = {
  name: string
  on: string | string[]
  unique?: boolean
}

type RawForeignKey = {
  name: string
  columns: string[]
  foreignColumns: Array<{ table: string; name: string }>
  onDelete?: string
  onUpdate?: string
}

type RawTable = {
  name: string
  columns: Record<string, RawColumn>
  indexes?: Record<string, RawIndex>
  foreignKeys?: Record<string, RawForeignKey>
}

type RawAdapterShape = {
  rawTables?: Record<string, RawTable>
  indexes?: Set<string>
}

function removeSingleColumnIndexesOn(
  table: RawTable,
  adapterIndexes: Set<string> | undefined,
  columnKeysToRemove: ReadonlySet<string>,
): void {
  if (!table.indexes) return
  for (const [idxKey, idx] of Object.entries(table.indexes)) {
    if (idx.unique) continue
    const singleCol =
      typeof idx.on === 'string'
        ? idx.on
        : Array.isArray(idx.on) && idx.on.length === 1
          ? idx.on[0]
          : null
    if (singleCol && columnKeysToRemove.has(singleCol)) {
      adapterIndexes?.delete(idx.name)
      delete table.indexes[idxKey]
    }
  }
}

function addCompositeIndex(
  table: RawTable,
  adapterIndexes: Set<string> | undefined,
  key: string,
  indexName: string,
  columns: string[],
): void {
  if (!columns.every((colKey) => colKey in table.columns)) return
  table.indexes ??= {}
  table.indexes[key] = {
    name: indexName,
    on: columns,
    unique: false,
  }
  adapterIndexes?.add(indexName)
}

/**
 * Phase 1 Drizzle `beforeSchemaInit` hook (`R-06`, `R-08`, `R-09`):
 *
 * Mutates Payload's abstract `rawTables` before `buildDrizzleTable` and `generate:db-schema` run so
 * `src/payload-generated-schema.ts`, `pushDevSchema()`, and `payload migrate:create` stay 100% aligned:
 *
 * 1. **R-06 (FK Referential Integrity)**:
 *    - `mail_messages.thread_id`: switches `ON DELETE SET NULL` -> `ON DELETE CASCADE` (matching `.notNull()`).
 *    - `form_submissions.form_id`: drops `.notNull()` so `ON DELETE SET NULL` preserves historical leads when a form template is deleted.
 * 2. **R-08 (Leading FK & Query-Aligned Composite Indexes)**:
 *    - Rewrites all 7 inverted `*_texts` `(order, parent_id)` indexes to `(parent_id, path, "order")`.
 *    - Adds `(folder, is_read, is_starred)` and `(folder, last_message_at)` on `mail_threads`.
 *    - Replaces standalone `mail_messages(thread_id)` with `(thread_id, sent_at)`.
 *    - Replaces standalone `_articles_v(parent_id)` and `_projects_v(parent_id)` with `(parent_id, updated_at)`.
 *    - Replaces standalone `payload_jobs(queue)` with `(queue, wait_until, created_at)`.
 * 3. **R-09 (Write-Amplification Index Pruning)**:
 *    - Drops low-selectivity boolean B-tree indexes (`autosave` on `_articles_v`/`_projects_v`, `processing`/`has_error` on `payload_jobs`, and standalone boolean/status indexes on `mail_threads`/`mail_messages`).
 */
export const phase1BeforeSchemaInit: PostgresSchemaHook = ({ adapter, schema }) => {
  const rawAdapter = adapter as unknown as RawAdapterShape
  const rawTables = rawAdapter.rawTables
  if (!rawTables) return schema

  const indexSet = rawAdapter.indexes

  // R-06.1: mail_messages.thread_id -> ON DELETE CASCADE
  const mailMessages = rawTables.mail_messages
  if (mailMessages?.columns?.thread?.reference) {
    mailMessages.columns.thread.reference.onDelete = 'cascade'
  }
  if (mailMessages?.foreignKeys) {
    for (const fk of Object.values(mailMessages.foreignKeys)) {
      if (fk.columns.length === 1 && fk.columns[0] === 'thread') {
        fk.onDelete = 'cascade'
      }
    }
  }

  // R-06.2: form_submissions.form_id -> nullable in PostgreSQL so ON DELETE SET NULL never violates NOT NULL
  const formSubmissions = rawTables.form_submissions
  if (formSubmissions?.columns?.form) {
    formSubmissions.columns.form.notNull = false
  }

  // R-08.1: Fix all inverted `*_texts` composite indexes `(order, parent)` -> `(parent, path, order)`
  for (const table of Object.values(rawTables)) {
    if (!table.indexes) continue
    for (const [idxKey, idx] of Object.entries(table.indexes)) {
      if (
        Array.isArray(idx.on) &&
        idx.on.length === 2 &&
        idx.on[0] === 'order' &&
        idx.on[1] === 'parent' &&
        'parent' in table.columns &&
        'order' in table.columns
      ) {
        indexSet?.delete(idx.name)
        const nextName = `${table.name}_parent_path_order_idx`.slice(0, 60)
        const nextCols = 'path' in table.columns ? ['parent', 'path', 'order'] : ['parent', 'order']
        table.indexes[idxKey] = {
          ...idx,
          name: nextName,
          on: nextCols,
        }
        indexSet?.add(nextName)
      }
    }
  }

  // R-08.2 & R-09: mail_threads covering counts + folder timeline composite indexes
  const mailThreads = rawTables.mail_threads
  if (mailThreads) {
    removeSingleColumnIndexesOn(
      mailThreads,
      indexSet,
      new Set(['folder', 'isRead', 'isStarred', 'hasAttachments']),
    )
    addCompositeIndex(mailThreads, indexSet, 'countsCoverIdx', 'mail_threads_counts_cover_idx', [
      'folder',
      'isRead',
      'isStarred',
    ])
    addCompositeIndex(
      mailThreads,
      indexSet,
      'folderLastMsgIdx',
      'mail_threads_folder_last_msg_idx',
      ['folder', 'lastMessageAt'],
    )
  }

  // R-08.3 & R-09: mail_messages (thread_id, sent_at) composite index
  if (mailMessages) {
    removeSingleColumnIndexesOn(
      mailMessages,
      indexSet,
      new Set(['thread', 'direction', 'status', 'isRead']),
    )
    addCompositeIndex(mailMessages, indexSet, 'threadSentIdx', 'mail_messages_thread_sent_idx', [
      'thread',
      'sentAt',
    ])
  }

  // R-08.4 & R-09: _articles_v & _projects_v (parent_id, updated_at) + drop autosave boolean B-tree
  const articlesVersions = rawTables._articles_v
  if (articlesVersions) {
    removeSingleColumnIndexesOn(articlesVersions, indexSet, new Set(['parent', 'autosave']))
    addCompositeIndex(
      articlesVersions,
      indexSet,
      'parentUpdatedIdx',
      '_articles_v_parent_updated_idx',
      ['parent', 'updatedAt'],
    )
  }

  const projectsVersions = rawTables._projects_v
  if (projectsVersions) {
    removeSingleColumnIndexesOn(projectsVersions, indexSet, new Set(['parent', 'autosave']))
    addCompositeIndex(
      projectsVersions,
      indexSet,
      'parentUpdatedIdx',
      '_projects_v_parent_updated_idx',
      ['parent', 'updatedAt'],
    )
  }

  // R-08.5 & R-09: payload_jobs (queue, wait_until, created_at) + drop processing/has_error boolean B-trees
  const payloadJobs = rawTables.payload_jobs
  if (payloadJobs) {
    removeSingleColumnIndexesOn(
      payloadJobs,
      indexSet,
      new Set(['queue', 'processing', 'hasError']),
    )
    addCompositeIndex(
      payloadJobs,
      indexSet,
      'queueWaitCreatedIdx',
      'payload_jobs_queue_wait_created_idx',
      ['queue', 'waitUntil', 'createdAt'],
    )
  }

  return schema
}
