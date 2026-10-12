import { labelToString } from '../lib/format'
import type { AdminNavGroup, NavEntityInput } from './types'

/**
 * Builds the TailAdmin sidebar tree out of Payload's own navigation data.
 *
 * Payload groups collections/globals in the admin nav via `admin.group`. This
 * helper reproduces that grouping so the TailAdmin shell shows exactly the
 * entities the current user is allowed to see, in the same order Payload would
 * show them — instead of a hard-coded demo menu.
 *
 * It is intentionally framework agnostic and side-effect free: the same
 * function runs on the server (root views, where `SanitizedCollectionConfig`
 * is available) and on the client (the `Nav` override, where only
 * `ClientCollectionConfig` is available).
 */
export function buildNavGroups(args: {
  entities: NavEntityInput[]
  locale?: string
  /** Return `false` to drop an entity (permissions, visibility, ...). */
  canAccess?: (entity: NavEntityInput) => boolean
}): AdminNavGroup[] {
  const { entities, locale, canAccess } = args
  const groups = new Map<string, AdminNavGroup>()
  const ungrouped: AdminNavGroup = { label: 'Menu', entities: [] }

  for (const entity of entities) {
    if (entity.hidden) continue
    if (canAccess && !canAccess(entity)) continue

    const label = labelToString(entity.label, entity.slug, locale)
    const groupName =
      typeof entity.group === 'string' && entity.group.trim().length > 0
        ? entity.group.trim()
        : null

    const target = groupName
      ? (groups.get(groupName) ??
        (() => {
          const created: AdminNavGroup = { label: groupName, entities: [] }
          groups.set(groupName, created)
          return created
        })())
      : ungrouped

    target.entities.push({
      slug: entity.slug,
      label,
      type: entity.type,
      href: entity.type === 'global' ? `/admin/globals/${entity.slug}` : `/admin/collections/${entity.slug}`,
    })
  }

  const result: AdminNavGroup[] = []
  if (ungrouped.entities.length > 0) result.push(ungrouped)
  result.push(...Array.from(groups.values()).filter((group) => group.entities.length > 0))
  return result
}

/** Flattens nav groups into a single list (used for search / quick links). */
export function flattenNavGroups(groups: AdminNavGroup[]): AdminNavGroup['entities'] {
  return groups.flatMap((group) => group.entities)
}
