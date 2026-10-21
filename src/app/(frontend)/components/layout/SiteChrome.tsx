import type { ReactNode } from 'react'
import type { FooterContent } from '../../lib/types'
import { StudioChrome } from '../studio/StudioChrome'

/** Shared article shell; homepage and writing pages use the same Studio design system. */
export function SiteChrome({
  footer,
  children,
  name,
}: {
  footer: FooterContent | null
  children?: ReactNode
  name?: string
}) {
  return (
    <StudioChrome active="writing" footer={footer} name={name}>
      {children}
    </StudioChrome>
  )
}
