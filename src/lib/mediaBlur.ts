import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'
import sharp from 'sharp'

const RASTER_MIME_PREFIX = 'image/'
const NON_RASTER_MIMES = new Set(['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'])

export const isRasterImageMime = (mimeType?: string | null): boolean => {
  if (!mimeType || !mimeType.startsWith(RASTER_MIME_PREFIX)) return false
  return !NON_RASTER_MIMES.has(mimeType.toLowerCase())
}

/**
 * Generates a tiny (~120–240 byte) 16px WebP base64 LQIP data URL via `sharp`
 * suitable for Next.js `<Image placeholder="blur" blurDataURL={...} />`.
 *
 * Returns `null` on unsupported/corrupt inputs so media uploads never fail.
 */
export async function generateBlurDataURLFromBuffer(buffer: Buffer): Promise<string | null> {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) return null
  try {
    const tiny = await sharp(buffer)
      .rotate()
      .resize(16, 16, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 35 })
      .toBuffer()
    return `data:image/webp;base64,${tiny.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Populates `data.blurDataURL` in a single DB write whenever `req.file.data` is present
 * (local disk uploads, Admin multipart uploads, and `pnpm seed`).
 */
export const mediaBlurBeforeChange: CollectionBeforeChangeHook = async ({ data, req }) => {
  const file = req.file
  const mimeType =
    file?.mimetype ?? (typeof data?.mimeType === 'string' ? data.mimeType : undefined)
  if (!file?.data || !Buffer.isBuffer(file.data) || !isRasterImageMime(mimeType)) {
    return data
  }

  const blurDataURL = await generateBlurDataURLFromBuffer(file.data)
  if (blurDataURL) {
    return {
      ...data,
      blurDataURL,
    }
  }
  return data
}

/**
 * Fallback `afterChange` hook for direct browser-to-Vercel-Blob uploads (`clientUploads: true`),
 * where the file bypasses `req.file` on the server and arrives with a remote HTTPS URL.
 */
export const mediaBlurAfterChange: CollectionAfterChangeHook = async ({
  context,
  doc,
  req,
}) => {
  if (context?.skipBlurGeneration) return doc
  if (!doc || typeof doc !== 'object') return doc

  const existingBlur = (doc as { blurDataURL?: unknown }).blurDataURL
  if (typeof existingBlur === 'string' && existingBlur.startsWith('data:image/')) {
    return doc
  }

  const mimeType = typeof doc.mimeType === 'string' ? doc.mimeType : null
  if (!isRasterImageMime(mimeType)) return doc

  const sizes = doc.sizes as { thumbnail?: { url?: string | null } } | undefined
  const sourceUrl = sizes?.thumbnail?.url || (typeof doc.url === 'string' ? doc.url : null)
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return doc
  }

  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) return doc
    const buffer = Buffer.from(await res.arrayBuffer())
    const blurDataURL = await generateBlurDataURLFromBuffer(buffer)
    if (!blurDataURL) return doc

    const updated = await req.payload.update({
      collection: 'media',
      id: doc.id,
      data: { blurDataURL } as never,
      overrideAccess: true,
      req,
      context: {
        ...context,
        skipBlurGeneration: true,
        skipAuditLog: true,
        skipRevalidate: true,
      },
    })
    return updated
  } catch {
    return doc
  }
}
