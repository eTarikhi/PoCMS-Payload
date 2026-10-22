import type { ReactNode } from 'react'
import type { FooterContent, HeaderContent } from '../../lib/types'
import { StudioChrome } from '../studio/StudioChrome'

/** Shared article shell; homepage and writing pages use the same Studio design system. */
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
