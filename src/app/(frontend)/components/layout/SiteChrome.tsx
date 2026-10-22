import type { ReactNode } from 'react'
import type { FooterContent, HeaderContent } from '../../lib/types'
import { StudioChrome } from '../studio/StudioChrome'

/** Article shell for the charcoal-and-amber journal; the original homepage has its own shell. */
export function SiteChrome({
  footer,
  children,
  name,
  profile,
}: {
  footer: FooterContent | null
  children?: ReactNode
  name?: string
  profile?: HeaderContent | null
}) {
  return (
    <StudioChrome active="writing" footer={footer} name={name} profile={profile}>
      {children}
    </StudioChrome>
  )
}
