import Image from 'next/image'
import React from 'react'

import type { Media } from '@/payload-types'

export type MediaBlockSize = 'small' | 'medium' | 'normal' | 'wide' | 'custom'
export type MediaBlockAlignment = 'left' | 'center' | 'right'
export type MediaBlockAspectRatio = 'auto' | '16:9' | '4:3' | '1:1'

type MediaBlockViewProps = {
  source?: 'upload' | 'url' | null
  media?: number | Media | null
  imageUrl?: string | null
  caption?: string | null
  alt?: string | null
  size?: MediaBlockSize | null
  customWidth?: number | null
  alignment?: MediaBlockAlignment | null
  aspectRatio?: MediaBlockAspectRatio | null
  urlMeta?: unknown
}

const isOptimizableMediaUrl = (src: string): boolean => {
  if (
    src.startsWith('/api/media/file/') ||
    src.startsWith('/api/media-frame') ||
    src.startsWith('/images/')
  ) {
    return true
  }
  try {
    const parsed = new URL(src)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.public.blob.vercel-storage.com')
    )
  } catch {
    return false
  }
}

const parseUrlMeta = (
  raw: unknown,
): { width?: number; height?: number; blurDataURL?: string } => {
  if (!raw || typeof raw !== 'object') return {}
  const rec = raw as Record<string, unknown>
  return {
    width: typeof rec.width === 'number' && rec.width > 0 ? rec.width : undefined,
    height: typeof rec.height === 'number' && rec.height > 0 ? rec.height : undefined,
    blurDataURL:
      typeof rec.blurDataURL === 'string' && rec.blurDataURL.startsWith('data:image/')
        ? rec.blurDataURL
        : undefined,
  }
}

/**
 * Picks the optimal WebP size variant from a populated `Media` upload for the chosen display size,
 * while passing responsive `sizes` to `next/image` for crisp retina scaling.
 */
const pickMediaVariant = (
  mediaObj: Media,
  size: MediaBlockSize,
  customWidth: number | null | undefined,
): { url: string | null; width: number; height: number } => {
  const sizes = mediaObj.sizes
  const pickOrder =
    size === 'small' || (size === 'custom' && (customWidth ?? 560) <= 380)
      ? [sizes?.card, sizes?.thumbnail, sizes?.content, sizes?.hero]
      : size === 'medium' || (size === 'custom' && (customWidth ?? 560) <= 640)
        ? [sizes?.card, sizes?.content, sizes?.hero]
        : size === 'normal'
          ? [sizes?.content, sizes?.hero, sizes?.card]
          : [sizes?.hero, sizes?.content, sizes?.card]

  for (const variant of pickOrder) {
    if (variant?.url) {
      return {
        url: variant.url,
        width: variant.width ?? mediaObj.width ?? 1200,
        height: variant.height ?? mediaObj.height ?? 675,
      }
    }
  }

  return {
    url: mediaObj.url ?? null,
    width: mediaObj.width ?? 1200,
    height: mediaObj.height ?? 675,
  }
}

const computeSizesAttr = (size: MediaBlockSize, customWidth: number | null | undefined): string => {
  switch (size) {
    case 'small':
      return '(max-width: 768px) 92vw, 340px'
    case 'medium':
      return '(max-width: 768px) 92vw, 540px'
    case 'custom': {
      const clamped = Math.max(180, Math.min(1140, customWidth ?? 560))
      return `(max-width: 768px) 92vw, ${clamped}px`
    }
    case 'wide':
      return '(max-width: 1024px) 95vw, 900px'
    case 'normal':
    default:
      return '(max-width: 768px) 92vw, 760px'
  }
}

export function MediaBlockView({
  source,
  media,
  imageUrl,
  caption,
  alt,
  size,
  customWidth,
  alignment,
  aspectRatio,
  urlMeta,
}: MediaBlockViewProps) {
  const mediaObj = media && typeof media === 'object' ? media : null
  const inferredSource = source ?? (imageUrl && !mediaObj ? 'url' : 'upload')
  const effectiveSize: MediaBlockSize = size ?? 'normal'
  const effectiveAlign: MediaBlockAlignment = alignment ?? 'center'
  const effectiveRatio: MediaBlockAspectRatio = aspectRatio ?? 'auto'
  const parsedMeta = parseUrlMeta(urlMeta)

  let src: string | null = null
  let width = 1200
  let height = 675
  let blurDataURL: string | null = null
  let objectPosition: string | undefined

  if (inferredSource === 'url') {
    src = imageUrl?.trim() || null
    width = parsedMeta.width ?? 1200
    height = parsedMeta.height ?? 675
    blurDataURL = parsedMeta.blurDataURL ?? null
  } else if (mediaObj) {
    const picked = pickMediaVariant(mediaObj, effectiveSize, customWidth)
    src = picked.url ?? (imageUrl?.trim() || null)
    width = picked.width
    height = picked.height
    const rawBlur = (mediaObj as { blurDataURL?: string | null }).blurDataURL
    blurDataURL =
      typeof rawBlur === 'string' && rawBlur.startsWith('data:image/') ? rawBlur : null
    const focalX = (mediaObj as { focalX?: number | null }).focalX
    const focalY = (mediaObj as { focalY?: number | null }).focalY
    if (typeof focalX === 'number' && typeof focalY === 'number') {
      objectPosition = `${focalX}% ${focalY}%`
    }
  } else if (imageUrl?.trim()) {
    src = imageUrl.trim()
    width = parsedMeta.width ?? 1200
    height = parsedMeta.height ?? 675
    blurDataURL = parsedMeta.blurDataURL ?? null
  }

  if (!src) return null

  const resolvedAlt =
    alt?.trim() || mediaObj?.alt?.trim() || caption?.trim() || 'Article illustration'

  const classes = [
    'article-media-block',
    `article-media-block--size-${effectiveSize}`,
    `article-media-block--align-${effectiveAlign}`,
    effectiveRatio !== 'auto'
      ? `article-media-block--ratio-${effectiveRatio.replace(':', '-')}`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const clampedCustomPx = Math.max(180, Math.min(1140, customWidth ?? 560))
  const figureStyle =
    effectiveSize === 'custom'
      ? ({ '--media-custom-w': `${clampedCustomPx}px` } as React.CSSProperties)
      : undefined

  return (
    <figure className={classes} style={figureStyle}>
      <div className="article-media-block__frame">
        <Image
          src={src}
          alt={resolvedAlt}
          width={width}
          height={height}
          sizes={computeSizesAttr(effectiveSize, customWidth)}
          unoptimized={!isOptimizableMediaUrl(src)}
          placeholder={blurDataURL ? 'blur' : 'empty'}
          blurDataURL={blurDataURL ?? undefined}
          style={objectPosition ? { objectPosition } : undefined}
        />
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}
