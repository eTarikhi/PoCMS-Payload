import type { Metadata } from 'next'

import type { FooterContent, HeaderContent } from './types'

/**
 * SEO values for the site, from `vTarikhi/components/head.jsx` and `schema.json`.
 *
 * Decision D-5: absolute URLs use the canonical site URL. `NEXT_PUBLIC_SITE_URL` overrides the default.
 * Decision D-7: the invalid `X-Content-Type-Options` tag and the empty `fb:*` / `ia:*` tags are dropped.
 *
 * This module does not import React or Payload.
 */

export const DEFAULT_SITE_URL = 'https://vtarikhi.com'

/** The site origin with no trailing slash. */
export const siteUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (configured && configured.length > 0 ? configured : DEFAULT_SITE_URL).replace(/\/+$/, '')
}

/** Profile photo used for `og:image` and the JSON-LD `image`. Path under `public/`. */
export const PROFILE_IMAGE_PATH = '/images/profile.webp'
// Measured from public/images/profile.webp. The original tag said 400, which was wrong.
const PROFILE_IMAGE_WIDTH = 668
const PROFILE_IMAGE_HEIGHT = 689

const TITLE = 'Amir v.Tarikhi Live Resume | Full-Stack Senior Web Developer'
const DESCRIPTION =
  'Senior PHP, JavaScript & MySQL, Mid. React & Next.js, Jr. Node.js & Laravel, E-Commerce CMS, WordPress, WooCommerce & Shopify Developer ..'
const KEYWORDS =
  'Senior Web Developer, Full-Stack Developer, PHP Developer, JavaScript Developer, Next.js Developer, React.js Developer, Shopify Developer, MySQL Developer, Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant'
const OG_SITE_NAME = 'Amir v.Tarikhi Live Resume'
const OG_DESCRIPTION =
  'Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant'
const OWNER = 'Amir v.Tarikhi'

const SITE_URL = siteUrl()

/** Site-wide metadata for the root layout. */
export const portfolioMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: KEYWORDS,
  robots: 'index, follow',
  manifest: '/images/favicon/site.webmanifest',
  icons: {
    icon: [
      { url: '/images/favicon/favicon.ico' },
      { url: '/images/favicon/favicon.svg', type: 'image/svg+xml' },
      { url: '/images/favicon/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/images/favicon/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/images/favicon/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ],
    shortcut: '/images/favicon/favicon.ico',
    apple: { url: '/images/favicon/apple-touch-icon.png', sizes: '180x180' },
  },
  openGraph: {
    siteName: OG_SITE_NAME,
    title: OG_SITE_NAME,
    description: OG_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [
      {
        url: `${SITE_URL}${PROFILE_IMAGE_PATH}`,
        secureUrl: `${SITE_URL}${PROFILE_IMAGE_PATH}`,
        type: 'image/webp',
        width: PROFILE_IMAGE_WIDTH,
        height: PROFILE_IMAGE_HEIGHT,
        alt: 'Amir v.Tarikhi',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
  },
  other: {
    owner: OWNER,
  },
}

// Values from schema.json that the CMS does not hold yet. Kept as constants.
const ADDRESS = {
  '@type': 'PostalAddress',
  addressLocality: 'Istanbul, Turkey',
  addressRegion: 'Beykoz',
  postalCode: '34805',
  streetAddress: '34805, Beykoz, Istanbul, Turkey',
} as const
const JOB_TITLE = 'Senior Full-Stack Web Developer'

// The WhatsApp link is a messaging link, not a profile, so it is left out of sameAs.
const NON_PROFILE_ICONS = new Set(['faWhatsapp'])

/**
 * Person JSON-LD for the home page.
 *
 * Name, telephone, email, and social URLs come from the header and footer data (decision D-5).
 * The address and job title are constants.
 */
export const buildPersonJsonLd = (
  header: HeaderContent | null,
  footer: FooterContent | null,
  site: string = siteUrl(),
): Record<string, unknown> => {
  const phone = footer?.contactInfo.find((item) => item.type === 'phone')?.content
  const email = footer?.contactInfo.find((item) => item.type === 'email')?.content
  const profiles = (footer?.socialLinks ?? [])
    .filter((link) => !NON_PROFILE_ICONS.has(link.iconName))
    .map((link) => link.url)

  return {
    '@context': 'https://schema.org/',
    '@type': 'Person',
    address: ADDRESS,
    name: header?.sureName ?? footer?.fullName ?? '',
    ...(phone ? { telephone: phone } : {}),
    url: site,
    ...(email ? { email: `mailto:${email}` } : {}),
    image: `${site}${PROFILE_IMAGE_PATH}`,
    jobTitle: JOB_TITLE,
    sameAs: [...profiles, site],
  }
}
