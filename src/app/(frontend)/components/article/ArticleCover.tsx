import { CoverImage } from '../ui/CoverImage'

// Contained 16:9 cover image aligned strictly within `.article-layout`.
type ArticleCoverProps = {
  src: string
  alt: string
  blurDataURL?: string | null
  objectPosition?: string
}

export function ArticleCover({ src, alt, blurDataURL, objectPosition }: ArticleCoverProps) {
  return (
    <figure className="article-cover">
      <CoverImage
        src={src}
        alt={alt}
        blurDataURL={blurDataURL}
        objectPosition={objectPosition}
        fallbackSrc="/placeholder.svg"
        sizes="(max-width: 768px) calc(100vw - 2.5rem), (max-width: 1200px) 760px, 820px"
        width={960}
        height={540}
      />
    </figure>
  )
}
