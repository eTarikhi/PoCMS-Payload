'use client'

import Image from 'next/image'
import { useState } from 'react'

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
  priority?: boolean
}

export function CoverImage({
  src,
  alt,
  fallbackSrc,
  width,
  height,
  sizes,
  className,
  priority = false,
}: CoverImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const resolvedSrc = !src || failedSrc === src ? fallbackSrc : src

  return (
    <Image
      src={resolvedSrc}
      alt={alt}
      sizes={sizes}
      width={width}
      height={height}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      className={className}
      onError={() => {
        if (resolvedSrc !== fallbackSrc) setFailedSrc(src)
      }}
    />
  )
}
