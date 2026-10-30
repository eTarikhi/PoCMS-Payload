import type { Payload, PayloadRequest } from 'payload'

import {
  normalizeRedirectPath,
  resolveRedirectDestination,
} from '@/app/(frontend)/lib/redirects-utils'

export type RedirectLikeDoc = {
  id: number | string
  from?: string | null
  to?: {
    type?: 'reference' | 'custom' | null
    url?: string | null
    reference?: {
      relationTo?: 'articles' | 'projects' | string | null
      value?: { slug?: string | null } | number | string | null
    } | null
  } | null
}

export type RedirectGraphIssue = {
  id: number | string
  from: string
  target: string
  kind: 'chain' | 'loop'
}

export type RedirectGraphAnalysis = {
  chainCount: number
  loopCount: number
  problematicIds: (number | string)[]
  issues: RedirectGraphIssue[]
}

/**
 * Analyzes `redirects` documents for multi-hop chains (`A -> B -> C`) and cycles (`A -> B -> A` / `A -> A`).
 */
export function analyzeRedirectGraph(docs: readonly RedirectLikeDoc[]): RedirectGraphAnalysis {
  const byFrom = new Map<string, { id: number | string; target: string }>()

  for (const doc of docs) {
    if (!doc?.from) continue
    const fromPath = normalizeRedirectPath(doc.from)
    const rawTarget = resolveRedirectDestination(doc)
    if (!rawTarget || /^https?:\/\//i.test(rawTarget)) continue
    const targetPath = normalizeRedirectPath(rawTarget)
    byFrom.set(fromPath, { id: doc.id, target: targetPath })
  }

  let chainCount = 0
  let loopCount = 0
  const problematicIds: (number | string)[] = []
  const issues: RedirectGraphIssue[] = []

  for (const [startFrom, entry] of byFrom.entries()) {
    if (entry.target === startFrom) {
      loopCount += 1
      problematicIds.push(entry.id)
      issues.push({ id: entry.id, from: startFrom, target: entry.target, kind: 'loop' })
      continue
    }

    const nextHop = byFrom.get(entry.target)
    if (!nextHop) continue

    // Walk forward to distinguish a finite chain (A -> B -> C) from a loop (A -> B -> A).
    const visited = new Set<string>([startFrom])
    let cursor: string | undefined = entry.target
    let isLoop = false

    while (cursor) {
      if (visited.has(cursor)) {
        isLoop = true
        break
      }
      visited.add(cursor)
      cursor = byFrom.get(cursor)?.target
    }

    if (isLoop) {
      loopCount += 1
      problematicIds.push(entry.id)
      issues.push({ id: entry.id, from: startFrom, target: entry.target, kind: 'loop' })
    } else {
      chainCount += 1
      problematicIds.push(entry.id)
      issues.push({ id: entry.id, from: startFrom, target: entry.target, kind: 'chain' })
    }
  }

  return { chainCount, loopCount, problematicIds, issues }
}

/** Extracts a normalized string ID from a Payload upload relationship value (ID or populated doc). */
export function extractRelationId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return String(id)
    if (typeof id === 'string' && id.trim()) return id.trim()
  }
  return null
}

/** Walks a serialized Lexical JSON tree and collects any `Media` upload IDs inside `upload` or `mediaBlock` nodes. */
export function extractLexicalMediaIds(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (!node || typeof node !== 'object') return out
  const rec = node as Record<string, unknown>

  if (rec.type === 'upload' && (rec.relationTo === 'media' || !rec.relationTo)) {
    const id = extractRelationId(rec.value)
    if (id) out.add(id)
  }

  if (rec.type === 'block' || rec.type === 'inlineBlock') {
    const fields = rec.fields as Record<string, unknown> | undefined
    if (fields?.blockType === 'mediaBlock') {
      const id = extractRelationId(fields.media)
      if (id) out.add(id)
    }
  }

  if (Array.isArray(rec.children)) {
    for (const child of rec.children) {
      extractLexicalMediaIds(child, out)
    }
  }

  if (rec.root && typeof rec.root === 'object') {
    extractLexicalMediaIds(rec.root, out)
  }

  return out
}

export type MediaReferenceSources = {
  header?: Record<string, unknown> | null
  headers?: readonly Record<string, unknown>[]
  articles?: readonly Record<string, unknown>[]
  projects?: readonly Record<string, unknown>[]
  siteSettings?: Record<string, unknown> | null
}

/** Collects every `Media` document ID referenced across collections, SEO metadata, globals, and Lexical rich text. */
export function collectReferencedMediaIds(sources: MediaReferenceSources): Set<string> {
  const ids = new Set<string>()
  const add = (val: unknown) => {
    const id = extractRelationId(val)
    if (id) ids.add(id)
  }

  const headerDocs = [
    ...(sources.header ? [sources.header] : []),
    ...(sources.headers ?? []),
  ]

  for (const h of headerDocs) {
    add(h.profileImage)
    add(h.profilePhoto)
    add((h.meta as Record<string, unknown> | undefined)?.image)
    add((h.archiveHeader as Record<string, unknown> | undefined)?.backgroundImage)
    add((h.articleDetailHeader as Record<string, unknown> | undefined)?.backgroundImage)
    add((h.projectDetailHeader as Record<string, unknown> | undefined)?.backgroundImage)
  }

  const collectContentDocMedia = (doc: Record<string, unknown>) => {
    add(doc.image)
    const pm = doc.primaryMedia as Record<string, unknown> | undefined
    if (pm && typeof pm === 'object') {
      add(pm.media)
    }
    const dm = doc.detailMedia as Record<string, unknown> | undefined
    if (dm && typeof dm === 'object' && Array.isArray(dm.items)) {
      for (const slide of dm.items) {
        if (slide && typeof slide === 'object') {
          add((slide as Record<string, unknown>).media)
        }
      }
    }
    if (Array.isArray(doc.gallery)) {
      for (const slide of doc.gallery) {
        if (slide && typeof slide === 'object') {
          add((slide as Record<string, unknown>).media)
        }
      }
    }
    add((doc.meta as Record<string, unknown> | undefined)?.image)
    extractLexicalMediaIds(doc.content, ids)
  }

  for (const a of sources.articles ?? []) {
    collectContentDocMedia(a)
  }

  for (const p of sources.projects ?? []) {
    collectContentDocMedia(p)
  }

  if (sources.siteSettings) {
    add(sources.siteSettings.ogImage)
    add((sources.siteSettings.articlesHubSeo as Record<string, unknown> | undefined)?.ogImage)
    add((sources.siteSettings.projectsHubSeo as Record<string, unknown> | undefined)?.ogImage)
    add((sources.siteSettings.personSchema as Record<string, unknown> | undefined)?.image)
  }

  return ids
}

export function findOrphanedMediaIds<T extends number | string>(
  allMediaIds: readonly T[],
  referencedIds: ReadonlySet<string>,
): T[] {
  return allMediaIds.filter((id) => !referencedIds.has(String(id)))
}

export type ContentHealthAuditReport = {
  checkedAt: string
  articlesTotal: number
  projectsTotal: number
  mediaTotal: number
  redirectsTotal: number
  missingArticleImages: number
  missingProjectImages: number
  missingArticleSeoDescriptions: number
  missingProjectSeoDescriptions: number
  draftArticlesCount: number
  draftProjectsCount: number
  draftBacklogCount: number
  orphanedMediaIds: (number | string)[]
  orphanedMediaCount: number
  redirectChainCount: number
  redirectLoopCount: number
  redirectProblematicIds: (number | string)[]
}

/**
 * Runs a full Content Health 2.0 audit across Articles, Projects, Media, Redirects, Header, and SiteSettings.
 */
export async function auditContentHealth(
  payload: Payload,
  req?: PayloadRequest,
): Promise<ContentHealthAuditReport> {
  const [headerDoc, articles, projects, media, redirects, siteSettings] = await Promise.all([
    payload.findGlobal({ slug: 'header', depth: 0, overrideAccess: true, req }),
    payload.find({
      collection: 'articles',
      pagination: false,
      depth: 0,
      draft: true,
      overrideAccess: true,
      req,
    }),
    payload.find({
      collection: 'projects',
      pagination: false,
      depth: 0,
      draft: true,
      overrideAccess: true,
      req,
    }),
    payload.find({ collection: 'media', pagination: false, depth: 0, overrideAccess: true, req }),
    payload.find({
      collection: 'redirects',
      pagination: false,
      depth: 1,
      overrideAccess: true,
      req,
    }),
    payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true, req }),
  ])

  const hasGalleryItem = (gallery: unknown): boolean =>
    Array.isArray(gallery) &&
    gallery.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        Boolean(
          (item as Record<string, unknown>).media ||
            String((item as Record<string, unknown>).imageUrl ?? '').trim(),
        ),
    )

  const missingArticleImages = articles.docs.filter((doc) => {
    const pmMode = doc.primaryMedia?.mode ?? doc.mediaMode
    if (pmMode === 'none') return false
    const hasPrimary = Boolean(doc.primaryMedia?.media || doc.primaryMedia?.imageUrl?.trim())
    const hasDetail = hasGalleryItem(doc.detailMedia?.items)
    const hasLegacy = Boolean(
      doc.image || doc.imageUrl?.trim() || (doc.mediaMode === 'gallery' && hasGalleryItem(doc.gallery)),
    )
    return !hasPrimary && !hasDetail && !hasLegacy
  }).length

  const missingProjectImages = projects.docs.filter((doc) => {
    const pmMode = doc.primaryMedia?.mode
    if (pmMode === 'none') return false
    const hasPrimary = Boolean(
      doc.primaryMedia?.media ||
        doc.primaryMedia?.imageUrl?.trim() ||
        doc.primaryMedia?.thumbnailUrl?.trim(),
    )
    const hasDetail = hasGalleryItem(doc.detailMedia?.items)
    const hasLegacy = Boolean(
      doc.image ||
        doc.src?.trim() ||
        doc.placeHolder?.trim() ||
        (doc.mediaMode === 'gallery' && hasGalleryItem(doc.gallery)),
    )
    if (!hasPrimary && !hasDetail && !hasLegacy && doc.mediaMode === 'none') return false
    return !hasPrimary && !hasDetail && !hasLegacy
  }).length

  const missingArticleSeoDescriptions = articles.docs.filter(
    (doc) => !doc.meta?.description?.trim() && !doc.excerpt?.trim(),
  ).length
  const missingProjectSeoDescriptions = projects.docs.filter(
    (doc) => !doc.meta?.description?.trim() && !doc.excerpt?.trim(),
  ).length

  const draftArticlesCount = articles.docs.filter(
    (doc) => (doc as { _status?: string })._status === 'draft',
  ).length
  const draftProjectsCount = projects.docs.filter(
    (doc) => (doc as { _status?: string })._status === 'draft',
  ).length

  const referencedIds = collectReferencedMediaIds({
    header: headerDoc as unknown as Record<string, unknown>,
    articles: articles.docs as unknown as Record<string, unknown>[],
    projects: projects.docs as unknown as Record<string, unknown>[],
    siteSettings: siteSettings as unknown as Record<string, unknown>,
  })

  const orphanedMediaIds = findOrphanedMediaIds(
    media.docs.map((m) => m.id),
    referencedIds,
  )

  const redirectGraph = analyzeRedirectGraph(redirects.docs as unknown as RedirectLikeDoc[])

  return {
    checkedAt: new Date().toISOString(),
    articlesTotal: articles.totalDocs,
    projectsTotal: projects.totalDocs,
    mediaTotal: media.totalDocs,
    redirectsTotal: redirects.totalDocs,
    missingArticleImages,
    missingProjectImages,
    missingArticleSeoDescriptions,
    missingProjectSeoDescriptions,
    draftArticlesCount,
    draftProjectsCount,
    draftBacklogCount: draftArticlesCount + draftProjectsCount,
    orphanedMediaIds,
    orphanedMediaCount: orphanedMediaIds.length,
    redirectChainCount: redirectGraph.chainCount,
    redirectLoopCount: redirectGraph.loopCount,
    redirectProblematicIds: redirectGraph.problematicIds,
  }
}
