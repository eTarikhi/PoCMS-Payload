/**
 * Shared, fully serialisable data shapes for the TailAdmin admin-UI pilot.
 *
 * Payload root views are React Server Components: they query the Local API and
 * hand plain JSON to client components. These types are the contract between
 * the two sides, so they must never contain `Date`, `Payload`, class instances
 * or functions.
 */

export type EntityType = 'collection' | 'global'

/** One row of the "content by collection" breakdown. */
export type CollectionStat = {
  /** Payload collection/global slug. */
  slug: string
  /** Human label resolved from `labels.plural` / `admin.group`. */
  label: string
  /** Document count, or `null` when the count query failed or was denied. */
  count: number | null
  /** Admin URL for the entity, e.g. `/admin/collections/articles`. */
  href: string
  type: EntityType
  /** `admin.group` when the collection is grouped in the nav. */
  group?: string
  /** Populated instead of `count` when the query threw. */
  error?: string
  /** Whether the current user may read the collection at all. */
  readable: boolean
}

/** One row of the "recently updated" table. */
export type RecentDocument = {
  id: string
  title: string
  collectionSlug: string
  collectionLabel: string
  href: string
  updatedAt: string | null
  createdAt: string | null
  /** Draft/published badge, when the collection has versions enabled. */
  status: 'draft' | 'published' | null
}

/** One point of the content-growth area chart. */
export type GrowthPoint = {
  /** `2026-10` */
  key: string
  /** `Oct 26` */
  label: string
  value: number
}

export type GrowthSeries = {
  collectionSlug: string
  collectionLabel: string
  points: GrowthPoint[]
  total: number
}

/** Everything the TailAdmin dashboard renders, computed once on the server. */
export type ContentStats = {
  /** ISO timestamp of when the payload was assembled. */
  generatedAt: string
  totals: {
    collections: number
    globals: number
    documents: number
    media: number
    users: number
    updatedLast7Days: number
  }
  collections: CollectionStat[]
  recent: RecentDocument[]
  growth: GrowthSeries | null
  /** Non-fatal problems surfaced in the UI as a warning banner. */
  warnings: string[]
}

/** A single sidebar entry in the TailAdmin navigation. */
export type AdminNavEntity = {
  slug: string
  label: string
  type: EntityType
  href: string
}

/** A sidebar section (`admin.group` in Payload terms). */
export type AdminNavGroup = {
  label: string
  entities: AdminNavEntity[]
}

/** Minimal shape accepted by `buildNavGroups` — works for both the server
 *  `SanitizedCollectionConfig` and the client `ClientCollectionConfig`. */
export type NavEntityInput = {
  slug: string
  type: EntityType
  label?: unknown
  group?: unknown
  hidden?: boolean
}

/* ---------------------------------------------------------------------------
 * Sidebar model handed from server components to the TailAdmin shell.
 *
 * Icons are passed as *names* (`TaIconName`) rather than elements: a component
 * reference cannot cross the React Server Component boundary.
 * ------------------------------------------------------------------------- */

export type SidebarItem = {
  label: string
  href: string
  /** Key of `iconRegistry` in `../icons`. */
  icon?: string
  badge?: string
  external?: boolean
  children?: SidebarItem[]
}

export type SidebarSection = {
  label: string
  items: SidebarItem[]
}

export type SidebarUser = {
  name?: string | null
  email?: string | null
  avatarUrl?: string | null
  /** `/admin/account` by default. */
  accountHref?: string
  /** `/admin/logout` by default. */
  logoutHref?: string
}

export type Branding = {
  /** Full logo/wordmark shown when the sidebar is expanded. */
  name: string
  /** Two-letter mark shown when the sidebar is collapsed. */
  shortName?: string
  tagline?: string
}

/** Entry for the header "quick jump" palette. */
export type SearchIndexEntry = {
  label: string
  href: string
  group: string
}
