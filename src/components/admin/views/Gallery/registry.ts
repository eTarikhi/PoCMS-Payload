import type { Field, PayloadComponent, SanitizedConfig } from 'payload'

/** The groups Payload's documentation uses for custom components. */
export type RegistryCategory = 'root' | 'widgets' | 'collections' | 'fields'

export type RegistryEntry = {
  category: RegistryCategory
  /** Where the component is registered, as a config key (`actions`, `views.list.Component`, `Cell`). */
  slot: string
  /** The Component Path as written in the config (`/components/admin/…#Export`). */
  path: string
  /** Collections, globals or fields that register the same component. */
  usedBy: string[]
}

/** Only this project's components (Payload's and plugins' own components are left out). */
const OWN = '/components/admin/'

function componentPath(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'path' in value) {
    const { path, exportName } = value as { path: string; exportName?: string }
    return exportName ? `${path}#${exportName}` : path
  }
  return null
}

/** Calls `visit` for every component path in a (possibly nested) `admin.components` object. */
function walkComponents(
  node: unknown,
  slot: string,
  visit: (slot: string, path: string) => void,
): void {
  if (Array.isArray(node)) {
    for (const item of node) walkComponents(item, slot, visit)
    return
  }
  const path = componentPath(node)
  if (path) {
    if (path.startsWith(OWN)) visit(slot, path)
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      walkComponents(value, slot ? `${slot}.${key}` : key, visit)
    }
  }
}

/** Calls `visit` for every field (at any depth: rows, tabs, groups, arrays, blocks). */
function walkFields(fields: Field[], prefix: string, visit: (field: Field, name: string) => void) {
  for (const field of fields) {
    const name =
      'name' in field && field.name ? `${prefix}${field.name}` : prefix.replace(/\.$/, '')
    visit(field, name)
    const nextPrefix = 'name' in field && field.name ? `${name}.` : prefix
    if ('fields' in field && Array.isArray(field.fields))
      walkFields(field.fields, nextPrefix, visit)
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        const tabPrefix = 'name' in tab && tab.name ? `${prefix}${tab.name}.` : prefix
        walkFields(tab.fields, tabPrefix, visit)
      }
    }
    if (field.type === 'blocks') {
      for (const block of field.blocks) {
        if (typeof block === 'object')
          walkFields(block.fields, `${nextPrefix}${block.slug}.`, visit)
      }
    }
  }
}

const labelOf = (label: unknown, fallback: string): string => {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const record = label as Record<string, string>
    return record.en ?? Object.values(record)[0] ?? fallback
  }
  return fallback
}

/**
 * Every custom component of this project that the running config registers, grouped like Payload's
 * docs (root components, dashboard widgets, collection components, field components). Read from the
 * sanitized config, so the list can't drift from what Payload actually renders.
 */
export function collectRegistry(config: SanitizedConfig): RegistryEntry[] {
  const entries = new Map<string, RegistryEntry>()
  const add = (category: RegistryCategory, slot: string, path: string, owner?: string) => {
    const key = `${category}|${slot}|${path}`
    const entry = entries.get(key) ?? { category, slot, path, usedBy: [] }
    if (owner && !entry.usedBy.includes(owner)) entry.usedBy.push(owner)
    entries.set(key, entry)
  }

  const { admin } = config
  walkComponents(admin.components, '', (slot, path) => add('root', slot, path))
  const avatar = admin.avatar
  if (avatar && typeof avatar === 'object' && 'Component' in avatar) {
    const path = componentPath(avatar.Component as PayloadComponent)
    if (path?.startsWith(OWN)) add('root', 'avatar.Component', path)
  }

  for (const widget of admin.dashboard?.widgets ?? []) {
    const path = componentPath(widget.Component)
    if (path?.startsWith(OWN)) add('widgets', widget.slug, path)
  }

  const entities = [
    ...config.collections.map((c) => ({
      label: labelOf(c.labels?.plural, c.slug),
      admin: c.admin,
      fields: c.fields,
    })),
    ...config.globals.map((g) => ({
      label: labelOf(g.label, g.slug),
      admin: g.admin,
      fields: g.fields,
    })),
  ]
  for (const entity of entities) {
    walkComponents(entity.admin?.components, '', (slot, path) =>
      add('collections', slot, path, entity.label),
    )
    walkFields(entity.fields, '', (field, name) => {
      const components = (field.admin as { components?: unknown } | undefined)?.components
      walkComponents(components, '', (slot, path) =>
        add('fields', slot, path, `${entity.label} › ${name}`),
      )
    })
  }

  return [...entries.values()].sort(
    (a, b) => a.slot.localeCompare(b.slot) || a.path.localeCompare(b.path),
  )
}
