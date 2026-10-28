import Image from 'next/image'

import type { Media } from '@/payload-types'

export type MediaBlockViewProps = {
  media?: number | Media | null
  imageUrl?: string | null
  caption?: string | null
  size?: 'normal' | 'wide' | null
}

type MediaSizeVariant = {
  url?: string | null
  width?: number | null
  height?: number | null
}

const isNextImageOptimizable = (src: string): boolean => {
  if (src.startsWith('/api/media/file/') || src.startsWith('/images/')) return true
  try {
    const parsed = new URL(src)
    return (
      parsed.protocol === 'https:' && parsed.hostname.endsWith('.public.blob.vercel-storage.com')
    )
  } catch {
    return false
  }
}

export function MediaBlockView({ media, imageUrl, caption, size = 'normal' }: MediaBlockViewProps) {
  const mediaDoc = media && typeof media === 'object' ? media : null
  const sizes = (mediaDoc as { sizes?: { card?: MediaSizeVariant; hero?: MediaSizeVariant } } | null)
    ?.sizes
  const preferredVariant = size === 'wide' ? sizes?.hero : sizes?.hero ?? sizes?.card

  const src = preferredVariant?.url ?? mediaDoc?.url ?? (imageUrl?.trim() || null)
  if (!src) return null

  const alt = mediaDoc?.alt || caption?.trim() || 'Illustration'
  const width = preferredVariant?.width ?? mediaDoc?.width ?? 1140
  const height = preferredVariant?.height ?? mediaDoc?.height ?? 640
  const blurDataURL = (mediaDoc as { blurDataURL?: string | null } | null)?.blurDataURL
  const hasBlur = Boolean(blurDataURL?.startsWith('data:image/'))
  const focalX = (mediaDoc as { focalX?: number | null } | null)?.focalX
  const focalY = (mediaDoc as { focalY?: number | null } | null)?.focalY
  const objectPosition =
    typeof focalX === 'number' && typeof focalY === 'number' ? `${focalX}% ${focalY}%` : undefined

  const figureClass = size === 'wide' ? 'rich-media rich-media-wide' : 'rich-media'

  return (
    <figure className={figureClass}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={size === 'wide' ? '(max-width: 1200px) 100vw, 1140px' : '(max-width: 992px) 100vw, 820px'}
        unoptimized={!isNextImageOptimizable(src)}
        placeholder={hasBlur ? 'blur' : 'empty'}
        blurDataURL={hasBlur ? (blurDataURL as string) : undefined}
        style={objectPosition ? { objectPosition } : undefined}
        className="rich-media-img"
      />
      {caption?.trim() ? <figcaption className="rich-media-caption">{caption}</figcaption> : null}
    </figure>
  )
}
