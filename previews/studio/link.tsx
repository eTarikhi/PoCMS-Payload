// Preview-only replacement for Next Link; normal anchors exercise the standalone routes.
import type { AnchorHTMLAttributes } from 'react'
export default function PreviewLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />
}
