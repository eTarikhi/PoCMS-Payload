import { CoverImage } from '../ui/CoverImage'

// Cover image, reusing the shared CoverImage (article page spec §5.2). It is wider than the text column (§8).
type ArticleCoverProps = {
  src: string
  alt: string
}

export function ArticleCover({ src, alt }: ArticleCoverProps) {
  return (
    <figure className="article-cover">
      <CoverImage
        src={src}
        alt={alt}
        fallbackSrc="/placeholder.svg"
        sizes="(max-width: 1200px) calc(100vw - 2.5rem), 1140px"
        width={1140}
        height={600}
      />
    </figure>
  )
}
