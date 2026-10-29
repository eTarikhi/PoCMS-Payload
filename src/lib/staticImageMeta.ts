import fs from 'node:fs/promises'
import path from 'node:path'
import type { CollectionBeforeChangeHook } from 'payload'
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
    if (imageUrl.startsWith('/images/')) {
      const meta = await extractStaticImageMeta(imageUrl)
      if (meta) {
        fields.urlMeta = meta
      }
    } else if (!imageUrl) {
      fields.urlMeta = null
    }
  }

  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      await enrichLexicalMediaBlocks(child)
    }
  }
}

/**
 * Payload `beforeChange` hook on `Articles`: automatically computes `{ width, height, blurDataURL }`
 * via `sharp` whenever an editor references an existing `/images/**` path on cover `imageUrl`,
 * `gallery[].imageUrl`, or an in-body Lexical `mediaBlock`.
 */
export const enrichArticleStaticImageMetaBeforeChange: CollectionBeforeChangeHook = async ({
  data,
}) => {
  if (!data || typeof data !== 'object') return data
  const record = data as Record<string, unknown>

  const coverUrl = typeof record.imageUrl === 'string' ? record.imageUrl.trim() : ''
  if (coverUrl.startsWith('/images/')) {
    record.imageUrlMeta = await extractStaticImageMeta(coverUrl)
  } else if (!coverUrl) {
    record.imageUrlMeta = null
  }

  if (Array.isArray(record.gallery)) {
    for (const slide of record.gallery) {
      if (!slide || typeof slide !== 'object') continue
      const slideRec = slide as Record<string, unknown>
      const slideUrl = typeof slideRec.imageUrl === 'string' ? slideRec.imageUrl.trim() : ''
      if (slideUrl.startsWith('/images/')) {
        slideRec.urlMeta = await extractStaticImageMeta(slideUrl)
      } else if (!slideUrl) {
        slideRec.urlMeta = null
      }
    }
  }

  if (record.content && typeof record.content === 'object') {
    const root = (record.content as { root?: unknown }).root
    if (root) {
      await enrichLexicalMediaBlocks(root)
    }
  }

  return data
}
