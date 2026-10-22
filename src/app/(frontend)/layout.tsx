import type { Metadata, Viewport } from 'next'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/500.css'
import '@fontsource/open-sans/600.css'
import '@fontsource/open-sans/700.css'
import { config } from '@fortawesome/fontawesome-svg-core'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import React from 'react'

// Global styles for the portfolio site. Import order matches vTarikhi/pages/_app.js
// (bootstrap-icons, bootstrap, main, then the Font Awesome base styles).
import 'bootstrap-icons/font/bootstrap-icons.min.css'
import '@/app/(frontend)/styles/bootstrap.min.css'
import '@/app/(frontend)/styles/main.css'
import '@/app/(frontend)/styles/studio.css'
import '@fortawesome/fontawesome-svg-core/styles.css'

import { portfolioMetadata } from '@/app/(frontend)/lib/seo'

// The stylesheet is already loaded above, so icons must not inject their own CSS.
// Client islands that render Font Awesome set this too (see ProjectsGrid.tsx).
config.autoAddCss = false

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

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <body style={{ fontFamily: "'Open Sans', sans-serif" }}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
