// Preview-only stand-in. Production continues to use Next's image optimizer.
import type { ImgHTMLAttributes } from 'react'
export default function PreviewImage({
  priority,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt ?? ''} loading={priority ? 'eager' : props.loading} />
}
