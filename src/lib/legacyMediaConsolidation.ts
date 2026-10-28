import fs from 'node:fs/promises'
import path from 'node:path'
import type { File, Payload, PayloadRequest } from 'payload'

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  gif: 'image/gif',
  avif: 'image/avif',
}

export type LegacyMediaConsolidationResult = {
  completedAt: string
  scannedArticles: number
  migratedArticles: number
  scannedProjects: number
  migratedProjects: number
  skippedCount: number
}

function resolvePublicAssetPath(publicDir: string, rawPath: string): string | null {
  const trimmed = rawPath.trim()
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return null
  const normalizedRel = trimmed.replace(/^\/+/, '')
  const candidate = path.resolve(publicDir, normalizedRel)
  const resolvedRoot = path.resolve(publicDir)
  // Guard against path traversal outside `public/`.
  if (!candidate.startsWith(resolvedRoot + path.sep) && candidate !== resolvedRoot) {
    return null
  }
  return candidate
}

async function resolveOrCreateMediaForLegacyPath(args: {
  payload: Payload
  req?: PayloadRequest
  publicDir: string
  rawUrl: string
  altText: string
  cacheByFilename: Map<string, number | string>
}): Promise<number | string | null> {
  const { payload, req, publicDir, rawUrl, altText, cacheByFilename } = args
  const localPath = resolvePublicAssetPath(publicDir, rawUrl)
  if (!localPath) return null

  const filename = path.basename(localPath)
  const ext = path.extname(filename).slice(1).toLowerCase()
  const mimetype = MIME_BY_EXT[ext]
  if (!mimetype) return null

  const cachedId = cacheByFilename.get(filename)
  if (cachedId !== undefined) return cachedId

  // Idempotency check: reuse existing Media document if already imported.
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (existing.docs[0]?.id !== undefined) {
    cacheByFilename.set(filename, existing.docs[0].id)
    return existing.docs[0].id
  }

  let data: Buffer
  try {
    data = await fs.readFile(localPath)
  } catch {
    return null
  }

  const file: File = {
    name: filename,
    data,
    mimetype,
    size: data.byteLength,
  }

  const created = await payload.create({
    collection: 'media',
    data: { alt: altText || filename },
    file,
    overrideAccess: true,
    context: { skipRevalidate: true, skipAuditLog: false },
    req,
  })

  cacheByFilename.set(filename, created.id)
  return created.id
}

/**
 * Idempotent background migration task (Milestone 3.2):
 * Scans `Articles` (`imageUrl`) and `Projects` (`src`) that do not yet have a tracked `Media`
 * upload relation (`image`), imports local `/images/...` files into `Media` (reusing existing
 * `Media` rows by filename), and links `doc.image = media.id`.
 */
export async function consolidateLegacyMediaUrls(args: {
  payload: Payload
  req?: PayloadRequest
  publicDir?: string
}): Promise<LegacyMediaConsolidationResult> {
  const { payload, req } = args
  const publicDir = args.publicDir ?? path.resolve(process.cwd(), 'public')
  const cacheByFilename = new Map<string, number | string>()

  const [articles, projects] = await Promise.all([
    payload.find({
      collection: 'articles',
      where: {
        and: [
          { image: { exists: false } },
          { imageUrl: { exists: true } },
          { imageUrl: { not_equals: '' } },
        ],
      },
      draft: true,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    }),
    payload.find({
      collection: 'projects',
      where: {
        and: [
          { image: { exists: false } },
          { src: { exists: true } },
          { src: { not_equals: '' } },
        ],
      },
      draft: true,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    }),
  ])

  let migratedArticles = 0
  let migratedProjects = 0
  let skippedCount = 0

  for (const article of articles.docs) {
    const rawUrl = typeof article.imageUrl === 'string' ? article.imageUrl : ''
    const mediaId = await resolveOrCreateMediaForLegacyPath({
      payload,
      req,
      publicDir,
      rawUrl,
      altText: article.title,
      cacheByFilename,
    })
    if (mediaId === null) {
      skippedCount += 1
      continue
    }

    await payload.update({
      collection: 'articles',
      id: article.id,
      data: { image: mediaId as number },
      draft: (article as { _status?: string })._status === 'draft',
      overrideAccess: true,
      context: { skipRevalidate: true },
      req,
    })
    migratedArticles += 1
  }

  for (const project of projects.docs) {
    const rawUrl = typeof project.src === 'string' ? project.src : ''
    const mediaId = await resolveOrCreateMediaForLegacyPath({
      payload,
      req,
      publicDir,
      rawUrl,
      altText: project.title,
      cacheByFilename,
    })
    if (mediaId === null) {
      skippedCount += 1
      continue
    }

    await payload.update({
      collection: 'projects',
      id: project.id,
      data: { image: mediaId as number },
      draft: (project as { _status?: string })._status === 'draft',
      overrideAccess: true,
      context: { skipRevalidate: true },
      req,
    })
    migratedProjects += 1
  }

  return {
    completedAt: new Date().toISOString(),
    scannedArticles: articles.docs.length,
    migratedArticles,
    scannedProjects: projects.docs.length,
    migratedProjects,
    skippedCount,
  }
}
