import type { Metadata, Viewport } from 'next'
import { Open_Sans } from 'next/font/google'
import { preload } from 'react-dom'
import { config } from '@fortawesome/fontawesome-svg-core'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import React from 'react'

// Global styles for the portfolio site. Import order matches vTarikhi/pages/_app.js
// (bootstrap-icons, bootstrap, main, then the Font Awesome base styles).
import 'bootstrap-icons/font/bootstrap-icons.min.css'
import '@/app/(frontend)/styles/bootstrap.min.css'
import '@/app/(frontend)/styles/main.css'
import '@fortawesome/fontawesome-svg-core/styles.css'

import {
  CustomBodyEndSlot,
  CustomBodyStartSlot,
  CustomHeadSlot,
} from '@/app/(frontend)/components/seo/CustomCodeInjection'
import { ThemeInitScript } from '@/app/(frontend)/components/ui/ThemeToggle/ThemeInitScript'
import { getCachedSiteChrome } from '@/app/(frontend)/lib/cache'
import {
  buildPortfolioMetadata,
  buildPortfolioViewport,
  htmlLangFromLocale,
} from '@/app/(frontend)/lib/seo'

// The stylesheet is already loaded above, so icons must not inject their own CSS.
// Client islands that render Font Awesome set this too (see ProjectsGrid.tsx).
config.autoAddCss = false

// Open Sans weights 400–700 match all font-weight declarations across main.css and inner-pages.css.
const openSans = Open_Sans({
  weight: ['400', '500', '600', '700'],
  style: ['normal'],
  subsets: ['latin'],
  display: 'swap',
})

// Site-wide metadata and viewport come from the `site-settings` global (cached via unstable_cache,
// with no request-scoped APIs, so pages still prerender statically).
export async function generateMetadata(): Promise<Metadata> {
  const { siteSettings } = await getCachedSiteChrome()
  return buildPortfolioMetadata(siteSettings)
}

export async function generateViewport(): Promise<Viewport> {
  const { siteSettings } = await getCachedSiteChrome()
  return buildPortfolioViewport(siteSettings)
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  // Background images used by main.css; preloaded as in vTarikhi/components/head.jsx.
  preload('/images/bg-mobile.webp', { as: 'image' })
  preload('/images/bg-desktop.webp', { as: 'image' })

  const { siteSettings, customCode } = await getCachedSiteChrome()

  return (
    <html
      lang={htmlLangFromLocale(siteSettings.locale)}
      className={openSans.className}
      suppressHydrationWarning
    >
      <head>
        <ThemeInitScript />
        <CustomHeadSlot customCode={customCode} />
      </head>
      <body>
        <CustomBodyStartSlot customCode={customCode} />
        {children}
        <Analytics />
        <SpeedInsights />
        <CustomBodyEndSlot customCode={customCode} />
      </body>
    </html>
  )
}
