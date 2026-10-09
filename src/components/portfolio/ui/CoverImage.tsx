'use client'

import Image from 'next/image'
import type { SyntheticEvent } from 'react'

// Ported from the article image in vTarikhi/components/sections/articles.tsx.
// The original set src to "/placeholder.svg" on error, but that file did not exist (F-08).
// The placeholder now lives in public/placeholder.svg.

export type CoverImageProps = {
  /** Image URL. An empty string uses `fallbackSrc` straight away. */
  src: string
  alt: string
  /** Shown when `src` is empty or fails to load. */
  fallbackSrc: string
  width: number
  height: number
  sizes?: string
  className?: string
}

export function CoverImage({
  src,
  alt,
  fallbackSrc,
  width,
  height,
  sizes,
  className,
}: CoverImageProps) {
  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    // Stop once the fallback itself has failed, so an error cannot loop.
    if (!event.currentTarget.src.endsWith(fallbackSrc)) {
      event.currentTarget.src = fallbackSrc
    }
  }

  return (
    <Image
      src={src || fallbackSrc}
      alt={alt}
      sizes={sizes}
      width={width}
      height={height}
      loading="lazy"
      className={className}
      onError={handleError}
    />
  )
}
