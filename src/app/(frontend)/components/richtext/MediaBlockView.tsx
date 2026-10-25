import Image from 'next/image'

import type { Media } from '@/payload-types'

export type MediaBlockViewProps = {
  media?: number | Media | null
  imageUrl?: string | null
  caption?: string | null
  size?: 'normal' | 'wide' | null
}

export function MediaBlockView({ media, imageUrl, caption, size = 'normal' }: MediaBlockViewProps) {
  const mediaDoc = media && typeof media === 'object' ? media : null
  const src = mediaDoc?.url ?? (imageUrl?.trim() || null)
  if (!src) return null

  const alt = mediaDoc?.alt || caption?.trim() || 'Illustration'
  const width = mediaDoc?.width ?? 1140
  const height = mediaDoc?.height ?? 640
  const figureClass = size === 'wide' ? 'rich-media rich-media-wide' : 'rich-media'

  return (
    <figure className={figureClass}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        unoptimized
        className="rich-media-img"
      />
      {caption?.trim() ? <figcaption className="rich-media-caption">{caption}</figcaption> : null}
    </figure>
  )
}
