import type { ReactNode } from 'react'

import type { FooterContent } from '@/app/(frontend)/lib/types'
import type { Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

import { BackToTop } from './BackToTop'
import { BootstrapClient } from './BootstrapClient'
import { Footer } from './Footer'
import { Navigation } from './Navigation'

/** The shared shell for every public page. */
export function SiteChrome({
  children,
  currentPath,
  footer,
  locale,
}: {
  children?: ReactNode
  currentPath: string
  footer: FooterContent | null
  locale: Locale
}) {
  const messages = getMessages(locale)

  return (
    <>
      <a href="#main-content" className="skip-link visually-hidden-focusable">
        {messages.common.skipToContent}
      </a>
      <Navigation currentPath={currentPath} locale={locale} />
      {children}
      {footer ? <Footer footer={footer} locale={locale} /> : null}
      <BackToTop ariaLabel={messages.common.backToTop} />
      <BootstrapClient />
    </>
  )
}
