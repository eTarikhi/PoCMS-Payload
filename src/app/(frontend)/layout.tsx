import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter'
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
  themeColor: '#0b0f14',
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ fontFamily: "'Inter Variable', sans-serif" }}>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
