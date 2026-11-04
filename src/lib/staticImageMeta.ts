import fs from 'node:fs/promises'
import path from 'node:path'
import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'
import sharp from 'sharp'

export type StaticImageMeta = {
  src: string
  width: number
  height: number
  blurDataURL: string | null
}

export type PublicImageAssetItem = {
  path: string
  filename: string
  folder: string
  sizeBytes: number
  width: number | null
  height: number | null
}

const SUPPORTED_EXTENSIONS = new Set([
  '.webp',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.avif',
])

const metaCache = new Map<string, StaticImageMeta>()

/**
 * Resolves a `/images/...` path strictly inside `<projectRoot>/public/images` to block path traversal.
 */
export function resolveSafePublicImagePath(
  rawUrl: string | null | undefined,
  publicRoot = path.resolve(process.cwd(), 'public'),
): string | null {
  if (typeof rawUrl !== 'string') return null
  const trimmed = rawUrl.trim().split('?')[0]?.split('#')[0] ?? ''
  if (!trimmed.startsWith('/images/')) return null

  const imagesDir = path.resolve(publicRoot, 'images')
  const candidate = path.resolve(publicRoot, trimmed.replace(/^\/+/, ''))
  if (candidate !== imagesDir && !candidate.startsWith(imagesDir + path.sep)) {
    return null
  }

  const ext = path.extname(candidate).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) return null

  return candidate
}

/**
 * Extracts intrinsic `{ width, height, blurDataURL }` (20px WebP base64) for an existing `/images/**` file.
 */
export async function extractStaticImageMeta(
  rawUrl: string | null | undefined,
  publicRoot = path.resolve(process.cwd(), 'public'),
): Promise<StaticImageMeta | null> {
  const filePath = resolveSafePublicImagePath(rawUrl, publicRoot)
  if (!filePath || !rawUrl) return null

  const normalizedSrc = rawUrl.trim().split('?')[0] ?? rawUrl.trim()
  const cached = metaCache.get(normalizedSrc)
  if (cached) return cached

  try {
    const buffer = await fs.readFile(filePath)
    const image = sharp(buffer, { limitInputPixels: 64_000_000 })
    const metadata = await image.metadata()
    const width = metadata.width ?? 1200
    const height = metadata.height ?? 675

    let blurDataURL: string | null = null
    const ext = path.extname(filePath).toLowerCase()
    if (ext !== '.svg') {
      const tinyWebp = await sharp(buffer, { limitInputPixels: 64_000_000 })
        .resize(20, 20, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 45 })
        .toBuffer()
      blurDataURL = `data:image/webp;base64,${tinyWebp.toString('base64')}`
    }

    const resolved: StaticImageMeta = {
      src: normalizedSrc,
      width,
      height,
      blurDataURL,
    }
    metaCache.set(normalizedSrc, resolved)
    return resolved
  } catch {
    return null
  }
}

/**
 * Recursively enumerates all existing static images under `public/images/**` for the Admin visual picker.
 */
export async function listPublicImages(
  query?: string | null,
  publicRoot = path.resolve(process.cwd(), 'public'),
): Promise<PublicImageAssetItem[]> {
  const imagesRoot = path.resolve(publicRoot, 'images')
  const items: PublicImageAssetItem[] = []
  const normalizedQuery = query?.trim().toLowerCase() ?? ''

  async function walk(currentDir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue

      const relFromPublic = path.relative(publicRoot, fullPath).split(path.sep).join('/')
      const webPath = `/${relFromPublic}`
      if (normalizedQuery && !webPath.toLowerCase().includes(normalizedQuery)) {
        continue
      }

      const relFolder = path.dirname(path.relative(imagesRoot, fullPath)).split(path.sep).join('/')
      const folder = relFolder === '.' ? 'root' : relFolder

      try {
        const stat = await fs.stat(fullPath)
        const meta = await extractStaticImageMeta(webPath, publicRoot)
        items.push({
          path: webPath,
          filename: entry.name,
          folder,
          sizeBytes: stat.size,
          width: meta?.width ?? null,
          height: meta?.height ?? null,
        })
      } catch {
        // Skip unreadable files
      }
    }
  }

  await walk(imagesRoot)
  items.sort((a, b) => a.path.localeCompare(b.path))
  return items
}

async function resolveUrlMetaForInput(rawInput: unknown): Promise<StaticImageMeta | null> {
  const trimmed = typeof rawInput === 'string' ? rawInput.trim() : ''
  if (!trimmed) return null

  if (trimmed.startsWith('/images/')) {
    return extractStaticImageMeta(trimmed)
  }

  if (trimmed.startsWith('/api/media-frame')) {
    try {
      const parsed = new URL(trimmed, 'http://localhost')
      const underlying = parsed.searchParams.get('src')?.trim() ?? ''
      if (underlying.startsWith('/images/')) {
        const innerMeta = await extractStaticImageMeta(underlying)
        if (innerMeta) {
          return {
            src: trimmed,
            width: 1600,
            height: 900,
            blurDataURL: innerMeta.blurDataURL,
          }
        }
      }
    } catch {
      return null
    }
  }

  return null
}

async function enrichGallerySlides(gallery: unknown): Promise<void> {
  if (!Array.isArray(gallery)) return
  for (const slide of gallery) {
    if (!slide || typeof slide !== 'object') continue
    const slideRec = slide as Record<string, unknown>
    const slideUrl = typeof slideRec.imageUrl === 'string' ? slideRec.imageUrl.trim() : ''
    if (!slideUrl) {
      slideRec.urlMeta = null
      continue
    }
    const meta = await resolveUrlMetaForInput(slideUrl)
    if (meta) {
      slideRec.urlMeta = meta
    }
  }
}

async function enrichLexicalMediaBlocks(node: unknown): Promise<void> {
  if (!node || typeof node !== 'object') return
  const record = node as Record<string, unknown>

  if (
    record.type === 'block' &&
    record.fields &&
    typeof record.fields === 'object' &&
    (record.fields as Record<string, unknown>).blockType === 'mediaBlock'
  ) {
    const fields = record.fields as Record<string, unknown>
    const imageUrl = typeof fields.imageUrl === 'string' ? fields.imageUrl.trim() : ''
    if (!imageUrl) {
      fields.urlMeta = null
    } else {
      const meta = await resolveUrlMetaForInput(imageUrl)
      if (meta) {
        fields.urlMeta = meta
      }
    }
  }

  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      await enrichLexicalMediaBlocks(child)
    }
  }
}

async function enrichPrimaryMediaGroup(group: unknown): Promise<void> {
  if (!group || typeof group !== 'object') return
  const rec = group as Record<string, unknown>
  const rawUrl = typeof rec.imageUrl === 'string' ? rec.imageUrl.trim() : ''
  if (!rawUrl) {
    rec.urlMeta = null
    return
  }
  const meta = await resolveUrlMetaForInput(rawUrl)
  if (meta) {
    rec.urlMeta = meta
  }
}

const isNonEmptyStr = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0

const hasUploadValue = (val: unknown): boolean =>
  (typeof val === 'number' && Number.isFinite(val)) ||
  (typeof val === 'string' && val.trim().length > 0) ||
  Boolean(val && typeof val === 'object' && 'id' in val)

const hasExplicitPrimaryMedia = (group: unknown): boolean => {
  if (!group || typeof group !== 'object') return false
  const rec = group as Record<string, unknown>
  if (rec.mode === 'none') return true
  if (hasUploadValue(rec.media) || isNonEmptyStr(rec.imageUrl) || isNonEmptyStr(rec.thumbnailUrl)) {
    return true
  }
  return false
}

const hasExplicitDetailMedia = (group: unknown): boolean => {
  if (!group || typeof group !== 'object') return false
  const rec = group as Record<string, unknown>
  if (rec.mode === 'none' || rec.mode === 'gallery') return true
  return Array.isArray(rec.items) && rec.items.length > 0
}

function buildSyncedContentMediaHooks(kind: 'article' | 'project'): CollectionBeforeValidateHook {
  return ({ data, originalDoc, req }) => {
    if (!data || typeof data !== 'object') return data
    // Skip 1s draft autosave ticks so half-typed URLs are never frozen into `detailMedia.items[0]`.
    if (Boolean(req?.query?.autosave)) return data

    const next = { ...(data as Record<string, unknown>) }
    const prev = (originalDoc ?? {}) as Record<string, unknown>

    const incomingPrimary =
      next.primaryMedia && typeof next.primaryMedia === 'object'
        ? { ...(next.primaryMedia as Record<string, unknown>) }
        : undefined
    const storedPrimary =
      prev.primaryMedia && typeof prev.primaryMedia === 'object'
        ? (prev.primaryMedia as Record<string, unknown>)
        : undefined

    // 1. Hydrate `primaryMedia` from legacy root fields when neither incoming nor stored `primaryMedia` was set
    let effectivePrimary: Record<string, unknown> | undefined = incomingPrimary ?? storedPrimary
    if (!hasExplicitPrimaryMedia(incomingPrimary) && !hasExplicitPrimaryMedia(storedPrimary)) {
      const legacyMode = (next.mediaMode ?? prev.mediaMode) as string | undefined
      const legacySource = (next.mediaSource ?? prev.mediaSource) as string | undefined
      const legacyImage = next.image !== undefined ? next.image : prev.image
      const legacyUrlField = kind === 'article' ? 'imageUrl' : 'src'
      const rawLegacyUrl =
        next[legacyUrlField] !== undefined ? next[legacyUrlField] : prev[legacyUrlField]
      const legacyUrl = isNonEmptyStr(rawLegacyUrl) ? rawLegacyUrl.trim() : ''
      const legacyAlt =
        next.imageAlt !== undefined ? next.imageAlt : prev.imageAlt
      const legacyThumb =
        kind === 'project'
          ? next.placeHolder !== undefined
            ? next.placeHolder
            : prev.placeHolder
          : undefined

      const hasLegacyVisual =
        hasUploadValue(legacyImage) || Boolean(legacyUrl) || isNonEmptyStr(legacyThumb)

      if (kind === 'article' && legacyMode === 'none') {
        effectivePrimary = { ...(incomingPrimary ?? {}), mode: 'none' }
        next.primaryMedia = effectivePrimary
      } else if (hasLegacyVisual) {
        const inferredSource =
          legacySource === 'url' || legacySource === 'upload'
            ? legacySource
            : legacyUrl && !hasUploadValue(legacyImage)
              ? 'url'
              : 'upload'
        effectivePrimary = {
          ...(incomingPrimary ?? {}),
          mode: 'single',
          source: inferredSource,
          ...(hasUploadValue(legacyImage) ? { media: legacyImage } : {}),
          ...(legacyUrl ? { imageUrl: legacyUrl } : {}),
          ...(isNonEmptyStr(legacyAlt) ? { alt: legacyAlt.trim() } : {}),
          ...(kind === 'project' && isNonEmptyStr(legacyThumb)
            ? { thumbnailUrl: legacyThumb.trim() }
            : {}),
        }
        next.primaryMedia = effectivePrimary
      }
    }

    // 2. Hydrate `detailMedia` from legacy fields OR auto-map `primaryMedia` into `detailMedia.items[0]`
    const incomingDetail =
      next.detailMedia && typeof next.detailMedia === 'object'
        ? { ...(next.detailMedia as Record<string, unknown>) }
        : undefined
    const storedDetail =
      prev.detailMedia && typeof prev.detailMedia === 'object'
        ? (prev.detailMedia as Record<string, unknown>)
        : undefined

    const storedItems = Array.isArray(storedDetail?.items) ? storedDetail.items : []
    const incomingItems = Array.isArray(incomingDetail?.items) ? incomingDetail.items : undefined
    const effectiveDetailMode =
      (incomingDetail?.mode as string | undefined) ??
      (storedDetail?.mode as string | undefined)

    if (!hasExplicitDetailMedia(incomingDetail) && !hasExplicitDetailMedia(storedDetail)) {
      const legacyMode = (next.mediaMode ?? prev.mediaMode) as string | undefined
      const legacyGallery = (next.gallery ?? prev.gallery) as unknown[] | undefined
      const legacyLayout = (next.galleryLayout ?? prev.galleryLayout) as string | undefined

      if (legacyMode === 'none' && !incomingDetail?.mode) {
        next.detailMedia = {
          ...(incomingDetail ?? {}),
          mode: 'none',
        }
        return next as typeof data
      }

      if (legacyMode === 'gallery' && Array.isArray(legacyGallery) && legacyGallery.length > 0) {
        next.detailMedia = {
          ...(incomingDetail ?? {}),
          mode: 'gallery',
          galleryLayout: legacyLayout === 'grid' ? 'grid' : 'carousel',
          items: legacyGallery,
        }
        return next as typeof data
      }
    }

    const resolvedDetailMode = effectiveDetailMode ?? 'single'
    const currentItems = incomingItems ?? storedItems
    if (
      resolvedDetailMode !== 'none' &&
      currentItems.length === 0 &&
      storedItems.length === 0 &&
      effectivePrimary &&
      (effectivePrimary.mode ?? 'single') === 'single'
    ) {
      const primaryMediaUpload = effectivePrimary.media
      const primaryImageUrl = isNonEmptyStr(effectivePrimary.imageUrl)
        ? effectivePrimary.imageUrl.trim()
        : ''
      const primaryAlt = isNonEmptyStr(effectivePrimary.alt) ? effectivePrimary.alt.trim() : ''
      const inferredSource =
        effectivePrimary.source === 'url' || effectivePrimary.source === 'upload'
          ? (effectivePrimary.source as 'upload' | 'url')
          : primaryImageUrl && !hasUploadValue(primaryMediaUpload)
            ? 'url'
            : 'upload'

      const canMap =
        inferredSource === 'url'
          ? Boolean(primaryImageUrl)
          : hasUploadValue(primaryMediaUpload) || Boolean(primaryImageUrl)

      if (canMap) {
        const finalSource =
          inferredSource === 'upload' && !hasUploadValue(primaryMediaUpload) && primaryImageUrl
            ? 'url'
            : inferredSource
        next.detailMedia = {
          ...(storedDetail ?? {}),
          ...(incomingDetail ?? {}),
          mode: resolvedDetailMode,
          items: [
            {
              source: finalSource,
              ...(finalSource === 'upload' && hasUploadValue(primaryMediaUpload)
                ? { media: primaryMediaUpload }
                : {}),
              ...(finalSource === 'url' && primaryImageUrl ? { imageUrl: primaryImageUrl } : {}),
              ...(primaryAlt ? { alt: primaryAlt } : {}),
            },
          ],
        }
      }
    }

    return next as typeof data
  }
}

export const syncArticleMediaBlocksBeforeValidate: CollectionBeforeValidateHook =
  buildSyncedContentMediaHooks('article')

export const syncProjectMediaBlocksBeforeValidate: CollectionBeforeValidateHook =
  buildSyncedContentMediaHooks('project')

/**
 * Payload `beforeChange` hook on `Articles`: automatically computes `{ width, height, blurDataURL }`
 * via `sharp` whenever an editor references an existing `/images/**` path on `primaryMedia`,
 * `detailMedia.items[]`, legacy `imageUrl`/`gallery[]`, or an in-body Lexical `mediaBlock`.
 */
export const enrichArticleStaticImageMetaBeforeChange: CollectionBeforeChangeHook = async ({
  data,
}) => {
  if (!data || typeof data !== 'object') return data
  const record = data as Record<string, unknown>

  await enrichPrimaryMediaGroup(record.primaryMedia)
  if (record.detailMedia && typeof record.detailMedia === 'object') {
    await enrichGallerySlides((record.detailMedia as Record<string, unknown>).items)
  }

  const coverUrl = typeof record.imageUrl === 'string' ? record.imageUrl.trim() : ''
  if (!coverUrl) {
    record.imageUrlMeta = null
  } else {
    const meta = await resolveUrlMetaForInput(coverUrl)
    if (meta) {
      record.imageUrlMeta = meta
    }
  }

  await enrichGallerySlides(record.gallery)

  if (record.content && typeof record.content === 'object') {
    const root = (record.content as { root?: unknown }).root
    if (root) {
      await enrichLexicalMediaBlocks(root)
    }
  }

  return data
}

/**
 * Payload `beforeChange` hook on `Projects`: automatically computes `{ width, height, blurDataURL }`
 * via `sharp` whenever an editor references an existing `/images/**` path on `primaryMedia`,
 * `detailMedia.items[]`, legacy `src`/`gallery[]`, or an in-body Lexical `mediaBlock`.
 */
export const enrichProjectStaticImageMetaBeforeChange: CollectionBeforeChangeHook = async ({
  data,
}) => {
  if (!data || typeof data !== 'object') return data
  const record = data as Record<string, unknown>

  await enrichPrimaryMediaGroup(record.primaryMedia)
  if (record.detailMedia && typeof record.detailMedia === 'object') {
    await enrichGallerySlides((record.detailMedia as Record<string, unknown>).items)
  }

  const srcUrl = typeof record.src === 'string' ? record.src.trim() : ''
  if (!srcUrl) {
    record.srcMeta = null
  } else {
    const meta = await resolveUrlMetaForInput(srcUrl)
    if (meta) {
      record.srcMeta = meta
    }
  }

  await enrichGallerySlides(record.gallery)

  if (record.content && typeof record.content === 'object') {
    const root = (record.content as { root?: unknown }).root
    if (root) {
      await enrichLexicalMediaBlocks(root)
    }
  }

  return data
}
