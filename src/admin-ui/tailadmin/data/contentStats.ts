import type {
  CollectionSlug,
  Payload,
  PayloadRequest,
  SanitizedCollectionConfig,
  SanitizedGlobalConfig,
  SanitizedPermissions,
  VisibleEntities,
} from 'payload'

import {
  buildMonthRange,
  labelToString,
  monthEnd,
  monthLabel,
  monthStart,
  relativeTime,
} from '../lib/format'
import type {
  CollectionStat,
  ContentStats,
  GrowthSeries,
  RecentDocument,
} from './types'

/**
 * Server-only data layer for the TailAdmin admin-UI pilot.
 *
 * Everything here runs inside a Payload React Server Component (a root view or
 * a `beforeDashboard` component) and talks to the Local API with the *current
 * request*, which means:
 *
 *   - counts and lists honour the signed-in user's access control
 *     (`overrideAccess: false` + `req`), so the dashboard never leaks documents
 *     an editor is not allowed to see;
 *   - no extra HTTP round-trips or auth tokens are needed;
 *   - every query is individually guarded, so one unreadable or broken
 *     collection degrades to a warning banner instead of a 500.
 */

/** Slugs that are never interesting as "content" for the growth chart. */
const NON_CONTENT_SLUGS = new Set(['media', 'media-with-prefix', 'users', 'search', 'redirects'])

/** Preferred growth collections, in order, when present in the config. */
const PREFERRED_GROWTH_SLUGS: CollectionSlug[] = [
  'articles',
  'projects',
  'posts',
  'pages',
  'services',
] as CollectionSlug[]

export type StatsOptions = {
  /** How many months of history to chart. */
  growthMonths: number
  /** How many rows to show in "recently updated". */
  recentLimit: number
  /** How many collections to query for the breakdown. */
  collectionLimit: number
  /** Force the growth collection instead of auto-detecting one. */
  growthCollection?: string
  /** Force which collections appear in the breakdown. */
  collections?: string[]
}

function toInt(value: string | undefined, fallback: number, min = 1, max = 100): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

/** Reads `POCMS_ADMIN_UI_*` env vars once, with safe defaults. */
export function resolveStatsOptions(env: NodeJS.ProcessEnv = process.env): StatsOptions {
  const list = (value: string | undefined): string[] | undefined => {
    if (!value) return undefined
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    return items.length > 0 ? items : undefined
  }

  return {
    growthMonths: toInt(env.POCMS_ADMIN_UI_GROWTH_MONTHS, 12, 3, 24),
    recentLimit: toInt(env.POCMS_ADMIN_UI_RECENT_LIMIT, 8, 1, 25),
    collectionLimit: toInt(env.POCMS_ADMIN_UI_COLLECTION_LIMIT, 12, 1, 50),
    growthCollection: list(env.POCMS_ADMIN_UI_GROWTH_COLLECTION)?.[0],
    collections: list(env.POCMS_ADMIN_UI_COLLECTIONS),
  }
}

type BuildArgs = {
  payload: Payload
  /**
   * The incoming request. Root views always have one; `beforeDashboard` /
   * `afterDashboard` components do not (Payload only passes
   * `{ i18n, locale, params, payload, permissions, searchParams, user }`), so
   * `user` is accepted as an alternative.
   */
  req?: PayloadRequest
  /** Used for access-control checks when `req` is unavailable. */
  user?: Record<string, unknown> | null
  permissions?: SanitizedPermissions
  visibleEntities?: VisibleEntities
  options?: StatsOptions
  locale?: string
}

function canRead(
  permissions: SanitizedPermissions | undefined,
  type: 'collections' | 'globals',
  slug: string,
): boolean {
  if (!permissions) return true
  const scope = permissions[type] as Record<string, { read?: unknown } | undefined> | undefined
  if (!scope) return false
  const entry = scope[slug]
  if (!entry) return false
  // Payload deletes `read` when it resolves to false; a where-clause object means "yes, filtered".
  return Boolean(entry.read)
}

function resolveTitleField(collection: SanitizedCollectionConfig): string {
  const useAsTitle = collection.admin?.useAsTitle
  if (typeof useAsTitle === 'string' && useAsTitle !== 'id') return useAsTitle
  const fields = collection.fields as Array<{ name?: string; type?: string }>
  for (const preferred of ['title', 'name', 'label', 'heading']) {
    if (fields.some((field) => field.name === preferred && field.type === 'text')) return preferred
  }
  return 'id'
}

function stringifyId(id: unknown): string {
  if (id === null || id === undefined) return ''
  return String(id)
}

function toIso(value: unknown): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/**
 * Assembles every number the TailAdmin dashboard renders.
 *
 * The result is plain JSON and can be handed straight to a client component.
 */
export async function buildContentStats(args: BuildArgs): Promise<ContentStats> {
  const { payload, req, user, permissions, visibleEntities } = args
  const options = args.options ?? resolveStatsOptions()
  const warnings: string[] = []
  const locale = args.locale ?? (typeof req?.locale === 'string' ? req.locale : undefined)

  /**
   * Shared Local API options for every query below.
   *
   * `overrideAccess: false` + the current principal (`req` when we have one,
   * otherwise the `user` document) means the dashboard can never leak a
   * document the signed-in user is not allowed to read.
   */
  const accessArgs: {
    overrideAccess: false
    req?: PayloadRequest
    user?: never
  } = {
    overrideAccess: false,
    ...(req ? { req } : {}),
    ...(user ? { user: user as never } : {}),
  }

  const allCollections = payload.config.collections as SanitizedCollectionConfig[]
  const allGlobals = (payload.config.globals ?? []) as SanitizedGlobalConfig[]

  const visibleCollectionSlugs = new Set(visibleEntities?.collections ?? allCollections.map((c) => c.slug))
  const visibleGlobalSlugs = new Set(visibleEntities?.globals ?? allGlobals.map((g) => g.slug))

  const readableCollections = allCollections.filter(
    (collection) =>
      visibleCollectionSlugs.has(collection.slug) &&
      !collection.admin?.hidden &&
      canRead(permissions, 'collections', collection.slug),
  )

  const readableGlobals = allGlobals.filter(
    (global) =>
      visibleGlobalSlugs.has(global.slug) &&
      !global.admin?.hidden &&
      canRead(permissions, 'globals', global.slug),
  )

  /* ---------------------------------------------------------------- counts */
  const wantedSlugs = options.collections
    ? readableCollections
        .filter((collection) => options.collections?.includes(collection.slug))
        .map((collection) => collection.slug)
    : readableCollections
        .map((collection) => collection.slug)
        .filter((slug) => !NON_CONTENT_SLUGS.has(slug))
        .concat(readableCollections.map((c) => c.slug).filter((slug) => NON_CONTENT_SLUGS.has(slug)))

  const limitedSlugs = wantedSlugs.slice(0, options.collectionLimit)

  const countResults = await Promise.all(
    limitedSlugs.map(async (slug): Promise<CollectionStat> => {
      const collection = readableCollections.find((item) => item.slug === slug)!
      const stat: CollectionStat = {
        slug,
        label: labelToString(collection.labels?.plural, slug, locale),
        count: null,
        href: `/admin/collections/${slug}`,
        type: 'collection',
        group: typeof collection.admin?.group === 'string' ? collection.admin.group : undefined,
        readable: true,
      }
      try {
        const result = await payload.count({ collection: slug, ...accessArgs })
        stat.count = result.totalDocs
      } catch (error) {
        stat.error = error instanceof Error ? error.message : String(error)
        warnings.push(`Could not count “${stat.label}”: ${stat.error}`)
      }
      return stat
    }),
  )

  const statsBySlug = new Map(countResults.map((stat) => [stat.slug, stat]))
  const countOf = (slug: string): number => statsBySlug.get(slug)?.count ?? 0

  const totals = {
    collections: readableCollections.length,
    globals: readableGlobals.length,
    documents: countResults.reduce((sum, stat) => sum + (stat.count ?? 0), 0),
    media: countOf('media') || countOf('media-with-prefix'),
    users: countOf('users'),
    updatedLast7Days: 0,
  }

  /* ------------------------------------------------------- recent documents */
  const recentSourceSlugs = readableCollections
    .filter((collection) => collection.timestamps !== false && !NON_CONTENT_SLUGS.has(collection.slug))
    .slice(0, 4)
    .map((collection) => collection.slug)

  const recentBatches = await Promise.all(
    recentSourceSlugs.map(async (slug): Promise<RecentDocument[]> => {
      const collection = readableCollections.find((item) => item.slug === slug)!
      try {
        const result = await payload.find({
          collection: slug,
          ...accessArgs,
          limit: options.recentLimit,
          sort: '-updatedAt',
          depth: 0,
          pagination: false,
        })
        const titleField = resolveTitleField(collection)
        return result.docs.map((doc) => {
          const raw = doc as unknown as Record<string, unknown>
          const id = stringifyId(raw.id)
          const rawTitle = raw[titleField] ?? raw.title ?? raw.name ?? raw.id
          const title =
            typeof rawTitle === 'string' && rawTitle.trim().length > 0
              ? rawTitle
              : `${labelToString(collection.labels?.singular, slug, locale)} #${id}`
          return {
            id,
            title: title.length > 80 ? `${title.slice(0, 77)}…` : title,
            collectionSlug: slug,
            collectionLabel: labelToString(collection.labels?.singular, slug, locale),
            href: `/admin/collections/${slug}/${id}`,
            updatedAt: toIso(raw.updatedAt),
            createdAt: toIso(raw.createdAt),
            status:
              typeof raw._status === 'string'
                ? (raw._status as 'draft' | 'published')
                : collection.versions
                  ? 'published'
                  : null,
          }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`Could not read recent “${labelToString(collection.labels?.plural, slug, locale)}”: ${message}`)
        return []
      }
    }),
  )

  const recent = recentBatches
    .flat()
    .sort((a, b) => {
      const left = a.updatedAt ?? a.createdAt ?? ''
      const right = b.updatedAt ?? b.createdAt ?? ''
      return right.localeCompare(left)
    })
    .slice(0, options.recentLimit)

  /* ------------------------------------------------ activity in the last 7d */
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const activityResults = await Promise.all(
    recentSourceSlugs.map(async (slug) => {
      try {
        const result = await payload.count({
          collection: slug,
          ...accessArgs,
          where: { updatedAt: { greater_than_equal: sevenDaysAgo } },
        })
        return result.totalDocs
      } catch {
        return 0
      }
    }),
  )
  totals.updatedLast7Days = activityResults.reduce((sum, value) => sum + value, 0)

  /* ------------------------------------------------------- growth (monthly) */
  const growthSlug: CollectionSlug | undefined =
    options.growthCollection && readableCollections.some((c) => c.slug === options.growthCollection)
      ? (options.growthCollection as CollectionSlug)
      : PREFERRED_GROWTH_SLUGS.find((slug) => readableCollections.some((c) => c.slug === slug)) ??
        readableCollections
          .filter((collection) => !NON_CONTENT_SLUGS.has(collection.slug))
          .sort((a, b) => countOf(b.slug) - countOf(a.slug))
          .map((collection) => collection.slug)[0]

  let growth: GrowthSeries | null = null

  if (growthSlug) {
    const months = buildMonthRange(options.growthMonths)
    const collection = readableCollections.find((item) => item.slug === growthSlug)!
    try {
      const counts = await Promise.all(
        months.map(async (key) => {
          const result = await payload.count({
            collection: growthSlug,
            ...accessArgs,
            where: {
              createdAt: {
                greater_than_equal: monthStart(key).toISOString(),
                less_than: monthEnd(key).toISOString(),
              },
            },
          })
          return result.totalDocs
        }),
      )
      growth = {
        collectionSlug: growthSlug,
        collectionLabel: labelToString(collection.labels?.plural, growthSlug, locale),
        points: months.map((key, index) => ({ key, label: monthLabel(key), value: counts[index] ?? 0 })),
        total: counts.reduce((sum, value) => sum + value, 0),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Could not build the growth chart for “${growthSlug}”: ${message}`)
    }
  }

  /* ------------------------------------------------------ sorted breakdown */
  const collections = countResults
    .slice()
    .sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.label.localeCompare(b.label))

  return {
    generatedAt: new Date().toISOString(),
    totals,
    collections,
    recent,
    growth,
    warnings: warnings.slice(0, 5),
  }
}

/** Convenience helper for server components that only need the KPI strip. */
export async function buildQuickStats(args: BuildArgs): Promise<ContentStats> {
  return buildContentStats({
    ...args,
    options: { ...(args.options ?? resolveStatsOptions()), recentLimit: 1, growthMonths: 3 },
  })
}

/** Small helper used by the UI to render "updated 3 hours ago". */
export function describeTimestamp(iso: string | null, now: Date = new Date()): string {
  return relativeTime(iso, now)
}
