import type {
  Payload,
  PayloadRequest,
  SanitizedCollectionConfig,
  SanitizedGlobalConfig,
  SanitizedPermissions,
  VisibleEntities,
} from 'payload'

import { buildShellModel, type ShellModel, type ShellUser } from './buildShellModel'

export type { ShellModel, ShellUser }
import type { AdminNavGroup } from './types'
import { buildContentStats, type StatsOptions } from './contentStats'
import { buildNavGroups } from './navGroups'
import type { Branding, ContentStats, NavEntityInput } from './types'

/**
 * Single entry point used by every TailAdmin server component (root views,
 * dashboard widgets, the nav override) to load exactly what it needs from the
 * Payload Local API.
 *
 * Keeping this in one place means:
 *   - one permission story (everything is queried with the incoming `req`);
 *   - one place to add caching later (React `cache()` / `unstable_cache()`);
 *   - views stay declarative.
 */

export type AdminUiDataArgs = {
  payload: Payload
  /** Present in root views; absent in `beforeDashboard`/`afterDashboard`. */
  req?: PayloadRequest
  permissions?: SanitizedPermissions
  visibleEntities?: VisibleEntities
  user?: ShellUser | null
  /** Full user document, used for access-controlled queries without a `req`. */
  userDoc?: Record<string, unknown> | null
  locale?: string
  statsOptions?: StatsOptions
  branding?: Partial<Branding>
  basePath?: string
  /** Skip the expensive parts (growth chart, recent docs). */
  quick?: boolean
}

export type AdminUiData = {
  stats: ContentStats
  shell: ShellModel
}

export function toNavInputs(
  collections: SanitizedCollectionConfig[],
  globals: SanitizedGlobalConfig[],
): NavEntityInput[] {
  return [
    ...collections.map((collection) => ({
      slug: collection.slug,
      type: 'collection' as const,
      label: collection.labels?.plural,
      group: collection.admin?.group,
      hidden: Boolean(collection.admin?.hidden),
    })),
    ...globals.map((global) => ({
      slug: global.slug,
      type: 'global' as const,
      label: global.label,
      group: global.admin?.group,
      hidden: Boolean(global.admin?.hidden),
    })),
  ]
}

export async function loadAdminUiData(args: AdminUiDataArgs): Promise<AdminUiData> {
  const {
    payload,
    req,
    permissions,
    visibleEntities,
    user,
    userDoc,
    statsOptions,
    branding,
    basePath,
  } = args

  const adminBase = payload.config.routes?.admin ?? '/admin'
  const locale = args.locale ?? (typeof req?.locale === 'string' ? req.locale : undefined)

  const collections = (payload.config.collections ?? []) as SanitizedCollectionConfig[]
  const globals = (payload.config.globals ?? []) as SanitizedGlobalConfig[]

  const readable = (type: 'collections' | 'globals', slug: string): boolean => {
    if (!permissions) return true
    const scope = permissions[type] as Record<string, { read?: unknown } | undefined> | undefined
    return Boolean(scope?.[slug]?.read)
  }

  const navGroups = buildNavGroups({
    entities: toNavInputs(collections, globals),
    locale,
    canAccess: (entity) =>
      readable(entity.type === 'global' ? 'globals' : 'collections', entity.slug),
  })

  const stats = await buildContentStats({
    payload,
    req,
    user: userDoc,
    locale,
    permissions,
    visibleEntities,
    options: args.quick
      ? { ...(statsOptions ?? { growthMonths: 12, recentLimit: 8, collectionLimit: 12 }), recentLimit: 1, growthMonths: 3 }
      : statsOptions,
  })

  const shell = buildShellModel({
    navGroups,
    stats,
    branding,
    user,
    adminBase,
    basePath: basePath ?? '/tailadmin',
  })

  return { stats, shell }
}

/** Convenience wrapper that pulls everything off `initPageResult`. */
export async function loadAdminUiDataFromInitPage(args: {
  initPageResult: {
    permissions: SanitizedPermissions
    req: PayloadRequest
    visibleEntities: VisibleEntities
  }
  user?: ShellUser | null
  userDoc?: Record<string, unknown> | null
  branding?: Partial<Branding>
  basePath?: string
  quick?: boolean
}): Promise<AdminUiData> {
  const { initPageResult } = args
  return loadAdminUiData({
    payload: initPageResult.req.payload,
    req: initPageResult.req,
    permissions: initPageResult.permissions,
    visibleEntities: initPageResult.visibleEntities,
    user: args.user,
    userDoc: args.userDoc ?? (initPageResult.req.user as unknown as Record<string, unknown> | undefined),
    branding: args.branding,
    basePath: args.basePath,
    quick: args.quick,
  })
}


/**
 * Builds only the shell model (sidebar sections, quick-jump index, branding)
 * without touching the database. Used by surfaces that do not show metrics —
 * the UI-kit view and the `Nav` override.
 */
export function buildShellOnly(args: {
  navGroups: AdminNavGroup[]
  user?: ShellUser | null
  branding?: Partial<Branding>
  adminBase?: string
  basePath?: string
}): ShellModel {
  return buildShellModel({
    navGroups: args.navGroups,
    stats: null,
    branding: args.branding,
    user: args.user,
    adminBase: args.adminBase ?? '/admin',
    basePath: args.basePath ?? '/tailadmin',
  })
}

/**
 * Convenience helper for the `Nav` override and other surfaces that have a
 * `payload` instance + permissions but no `initPageResult`.
 */
export function buildNavGroupsFromConfig(args: {
  payload: Payload
  permissions?: SanitizedPermissions | null
  locale?: string
}): AdminNavGroup[] {
  const { payload, permissions, locale } = args
  const collections = (payload.config.collections ?? []) as SanitizedCollectionConfig[]
  const globals = (payload.config.globals ?? []) as SanitizedGlobalConfig[]

  const readable = (type: 'collections' | 'globals', slug: string): boolean => {
    if (!permissions) return true
    const scope = permissions[type] as Record<string, { read?: unknown } | undefined> | undefined
    return Boolean(scope?.[slug]?.read)
  }

  return buildNavGroups({
    entities: toNavInputs(collections, globals),
    locale,
    canAccess: (entity) => readable(entity.type === 'global' ? 'globals' : 'collections', entity.slug),
  })
}


/**
 * Extracts the few user fields the shell needs from a Payload user document.
 *
 * Written defensively because the generated `User` type only contains the
 * fields this project's `Users` collection actually defines — a `name` or
 * `avatar` field may or may not exist, and the TailAdmin shell must work in
 * both cases (it falls back to generated initials).
 */
export function toShellUser(user: unknown): ShellUser | null {
  if (!user || typeof user !== 'object') return null
  const record = user as Record<string, unknown>

  const stringOr = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null

  const firstName = stringOr(record.firstName)
  const lastName = stringOr(record.lastName)
  const name =
    stringOr(record.name) ??
    (firstName ? [firstName, lastName].filter(Boolean).join(' ') : null)

  const avatar = record.avatar as { url?: unknown } | string | null | undefined
  const avatarUrl =
    typeof avatar === 'string'
      ? stringOr(avatar)
      : avatar && typeof avatar === 'object'
        ? stringOr(avatar.url)
        : null

  return {
    email: stringOr(record.email),
    name,
    avatarUrl,
    collection: stringOr(record.collection) ?? undefined,
  }
}
