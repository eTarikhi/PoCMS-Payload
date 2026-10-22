import type { ReactNode } from 'react'

import type { FooterContent } from '@/app/(frontend)/lib/types'

import { BackToTop } from './BackToTop'
import { BootstrapClient } from './BootstrapClient'
import { Footer } from './Footer'
import { Navigation } from './Navigation'

/** Original portfolio shell. Keep its Bootstrap navigation, footer, and scroll behavior
 * separate from the journal/work shell so future archive styling cannot replace the homepage. */
export function PortfolioChrome({
  footer,
  children,
}: {
  footer: FooterContent | null
  children?: ReactNode
}) {
  return (
    <div className="original-portfolio">
      <a href="#main-content" className="skip-link visually-hidden-focusable">
        Skip to content
      </a>
      <Navigation />
      {children}
      {footer ? <Footer footer={footer} /> : null}
      <BackToTop />
      <BootstrapClient />
    </div>
  )
}
