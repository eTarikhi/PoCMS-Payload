import type { ReactNode } from 'react'

import type { FooterContent, NavigationContent } from '@/app/(frontend)/lib/types'

import { BackToTop } from './BackToTop'
import { BootstrapClient } from './BootstrapClient'
import { Footer } from './Footer'
import { Navigation } from './Navigation'

/**
 * The shared shell for every public page (article page spec §4.1).
 *
 * This is the only place Navigation, Footer, BackToTop, and BootstrapClient are composed. Pages pass
 * their own content as children, so a change here applies to every page at once. The skip link is
 * the first focusable element, and it targets `#main-content`, which each page sets on its <main>.
 */
export function SiteChrome({
  footer,
  navigation,
  children,
}: {
  footer: FooterContent | null
  navigation: NavigationContent
  children?: ReactNode
}) {
  return (
    <>
      <a href="#main-content" className="skip-link visually-hidden-focusable">
        Skip to content
      </a>
      <Navigation navigation={navigation} />
      {children}
      {footer ? <Footer footer={footer} /> : null}
      <BackToTop />
      <BootstrapClient />
    </>
  )
}
