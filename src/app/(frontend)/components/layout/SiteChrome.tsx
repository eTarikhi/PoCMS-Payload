import type { ReactNode } from 'react'

import { CustomAfterFooterSlot } from '@/app/(frontend)/components/seo/CustomCodeInjection'
import { FloatingThemeToggle } from '@/app/(frontend)/components/ui/ThemeToggle'
import { DEFAULT_NAVIGATION, DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type {
  CustomCodeContent,
  FooterContent,
  NavigationContent,
  SiteSettingsContent,
} from '@/app/(frontend)/lib/types'

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
  navigation = DEFAULT_NAVIGATION,
  footer,
  footerLabels = DEFAULT_SITE_SETTINGS.footerLabels,
  customCode,
  children,
}: {
  navigation?: NavigationContent
  footer: FooterContent | null
  footerLabels?: SiteSettingsContent['footerLabels']
  customCode?: CustomCodeContent | null
  children?: ReactNode
}) {
  return (
    <>
      <a href="#main-content" className="skip-link visually-hidden-focusable">
        {navigation.skipToContentLabel}
      </a>
      <Navigation navigation={navigation} />
      {children}
      {footer ? <Footer footer={footer} labels={footerLabels} /> : null}
      <CustomAfterFooterSlot customCode={customCode} />
      <FloatingThemeToggle />
      <BackToTop />
      <BootstrapClient />
    </>
  )
}
