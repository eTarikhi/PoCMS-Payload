/** Recently opened documents and globals, kept in localStorage for the command menu. */
export type RecentEntry = {
  path: string
  title: string
  slug: string
  kind: 'collection' | 'global'
  at: number
}

const KEY = 'pocms-recent-documents'
const LIMIT = 8

export function readRecent(): RecentEntry[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(value) ? (value as RecentEntry[]).slice(0, LIMIT) : []
  } catch {
    return []
  }
}

export function rememberRecent(entry: RecentEntry): void {
  try {
    const rest = readRecent().filter((item) => item.path !== entry.path)
    window.localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, LIMIT)))
  } catch {
    // Private mode or a full quota: the menu just shows no recent items.
  }
}

/** `/admin/collections/articles/6` or `/admin/globals/footer`, relative to the admin route. */
export function parseDocumentPath(pathname: string, adminRoute: string) {
  const rest = pathname.startsWith(adminRoute) ? pathname.slice(adminRoute.length) : ''
  const doc = /^\/collections\/([^/]+)\/([^/]+)$/.exec(rest)
  if (doc && doc[2] !== 'create') return { kind: 'collection' as const, slug: doc[1] }
  const global = /^\/globals\/([^/]+)$/.exec(rest)
  if (global) return { kind: 'global' as const, slug: global[1] }
  return null
}
