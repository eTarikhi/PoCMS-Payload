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

import { MaintenancePage } from '@/app/(frontend)/components/layout/MaintenancePage'
import { getCachedSiteSettings } from '@/app/(frontend)/lib/cache'
import { portfolioMetadata } from '@/app/(frontend)/lib/seo'

// The stylesheet is already loaded above, so icons must not inject their own CSS.
// Client islands that render Font Awesome set this too (see ProjectsGrid.tsx).
config.autoAddCss = false

const openSans = Open_Sans({
  weight: ['400', '500', '600', '700'],
  style: ['normal'],
  subsets: ['latin'],
  display: 'swap',
})

// Title, description, icons, Open Graph, and the owner tag live in src/app/(frontend)/lib/seo.ts (D-5, D-7).
// The Person JSON-LD is rendered by the home page, which has the content it needs (Set 6).
export const metadata: Metadata = portfolioMetadata

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 10,
  userScalable: true,
  themeColor: '#da9100',
}

/**
 * The public site's layout. It also owns the maintenance switch (Site settings global): while it is
 * on, every public route renders the maintenance page instead of its content. The admin lives in
 * another route group and is not affected, so an editor can always switch maintenance off.
 */
export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  // Background images used by main.css; preloaded as in vTarikhi/components/head.jsx.
  preload('/images/bg-mobile.webp', { as: 'image' })
  preload('/images/bg-desktop.webp', { as: 'image' })

  // Cached under the portfolio tag: saving the global in /admin expires it (see lib/revalidate.ts).
  const settings = await getCachedSiteSettings()

  return (
    <html lang="en" className={openSans.className}>
      <body>
        {settings.maintenance.enabled ? <MaintenancePage settings={settings} /> : children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
