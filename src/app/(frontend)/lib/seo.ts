import type { Metadata } from 'next'

import { DEFAULT_LOCALE, LOCALE_DETAILS, localizePath, type Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

import type { ArticleDetail } from './article-mappers'
import { articlePagePath } from './article-page'
import type { FooterContent, HeaderContent } from './types'

export const DEFAULT_SITE_URL = 'https://vtarikhi.com'

/** The site origin with no trailing slash. */
export const siteUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (configured && configured.length > 0 ? configured : DEFAULT_SITE_URL).replace(/\/+$/, '')
}

/** Profile photo used for Open Graph and structured data. */
export const PROFILE_IMAGE_PATH = '/images/profile.webp'
const PROFILE_IMAGE_WIDTH = 668
const PROFILE_IMAGE_HEIGHT = 689
const OWNER = 'Amir v.Tarikhi'
const OG_SITE_NAME = 'Amir v.Tarikhi Live Resume'
const localeAlternates = (path: string, locale: Locale, site: string = siteUrl()) => ({
  canonical: `${site}${localizePath(locale, path)}`,
  languages: {
    en: `${site}${localizePath('en', path)}`,
    fa: `${site}${localizePath('fa', path)}`,
    'x-default': `${site}${localizePath(DEFAULT_LOCALE, path)}`,
  },
})

const otherOpenGraphLocale = (locale: Locale): string[] =>
  (Object.keys(LOCALE_DETAILS) as Locale[])
    .filter((candidate) => candidate !== locale)
    .map((candidate) => LOCALE_DETAILS[candidate].openGraphLocale)

const profileImage = (site: string, alt: string) => ({
  url: `${site}${PROFILE_IMAGE_PATH}`,
  secureUrl: `${site}${PROFILE_IMAGE_PATH}`,
  type: 'image/webp',
  width: PROFILE_IMAGE_WIDTH,
  height: PROFILE_IMAGE_HEIGHT,
  alt,
})

/** Metadata for the homepage in either public content locale. */
export const homeMetadata = (
  locale: Locale = DEFAULT_LOCALE,
  site: string = siteUrl(),
): Metadata => {
  const messages = getMessages(locale)
  const path = localizePath(locale)

  return {
    metadataBase: new URL(site),
    title: messages.metadata.title,
    description: messages.metadata.description,
    keywords: messages.metadata.keywords,
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
    alternates: localeAlternates('/', locale, site),
    openGraph: {
      siteName: OG_SITE_NAME,
      title: messages.metadata.title,
      description: messages.metadata.description,
      url: `${site}${path}`,
      locale: LOCALE_DETAILS[locale].openGraphLocale,
      alternateLocale: otherOpenGraphLocale(locale),
      images: [profileImage(site, messages.common.profileImageAlt)],
    },
    twitter: {
      card: 'summary_large_image',
      title: messages.metadata.title,
      description: messages.metadata.description,
      images: [`${site}${PROFILE_IMAGE_PATH}`],
    },
    other: {
      owner: OWNER,
    },
  }
}

/** English metadata kept as the root layout default. Routes override it with their active locale. */
export const portfolioMetadata: Metadata = homeMetadata(DEFAULT_LOCALE)

const ADDRESS = {
  '@type': 'PostalAddress',
  addressLocality: 'Istanbul, Turkey',
  addressRegion: 'Beykoz',
  postalCode: '34805',
  streetAddress: '34805, Beykoz, Istanbul, Turkey',
} as const
const JOB_TITLE = 'Senior Full-Stack Web Developer'
const NON_PROFILE_ICONS = new Set(['faWhatsapp'])

/** Person JSON-LD for a localized homepage. */
export const buildPersonJsonLd = (
  header: HeaderContent | null,
  footer: FooterContent | null,
  locale: Locale = DEFAULT_LOCALE,
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
    url: `${site}${localizePath(locale)}`,
    ...(email ? { email: `mailto:${email}` } : {}),
    image: `${site}${PROFILE_IMAGE_PATH}`,
    inLanguage: LOCALE_DETAILS[locale].htmlLang,
    jobTitle: JOB_TITLE,
    sameAs: [...profiles, site],
  }
}

/** Absolute URL for a path or an absolute URL. */
export const absoluteUrl = (value: string, site: string = siteUrl()): string =>
  new URL(value, `${site}/`).toString()

/** Canonical URL of a locale-specific article page. */
export const articleCanonicalUrl = (
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
  site: string = siteUrl(),
): string => `${site}${articlePagePath(slug, locale)}`

/** Per-article metadata with canonical and hreflang alternates for both public locales. */
export const buildArticleMetadata = (
  article: ArticleDetail,
  locale: Locale = DEFAULT_LOCALE,
  site: string = siteUrl(),
): Metadata => {
  const messages = getMessages(locale)
  const url = articleCanonicalUrl(article.slug, locale, site)
  const image = article.coverUrl
    ? { url: absoluteUrl(article.coverUrl, site), alt: article.coverAlt, width: 1140, height: 600 }
    : profileImage(site, OWNER)

  return {
    title: article.title,
    ...(article.excerpt ? { description: article.excerpt } : {}),
    alternates: localeAlternates(`/articles/${article.slug}`, locale, site),
    openGraph: {
      type: 'article',
      siteName: OG_SITE_NAME,
      title: article.title,
      ...(article.excerpt ? { description: article.excerpt } : {}),
      url,
      locale: LOCALE_DETAILS[locale].openGraphLocale,
      alternateLocale: otherOpenGraphLocale(locale),
      ...(article.publishedAt ? { publishedTime: article.publishedAt } : {}),
      images: [image],
    },
    twitter: {
      card: article.coverUrl ? 'summary_large_image' : 'summary',
      title: article.title,
      ...(article.excerpt ? { description: article.excerpt } : {}),
      images: [image.url],
    },
    other: {
      'article:section':
        article.category === 'others'
          ? messages.article.categoryOther
          : messages.article.categoryArticles,
    },
  }
}

/** BlogPosting JSON-LD for a locale-specific article page. */
export const buildBlogPostingJsonLd = (
  article: ArticleDetail,
  header: HeaderContent | null,
  footer: FooterContent | null,
  locale: Locale = DEFAULT_LOCALE,
  site: string = siteUrl(),
): Record<string, unknown> => {
  const { '@context': _context, ...author } = buildPersonJsonLd(header, footer, locale, site)
  const url = articleCanonicalUrl(article.slug, locale, site)

  return {
    '@context': 'https://schema.org/',
    '@type': 'BlogPosting',
    headline: article.title,
    ...(article.excerpt ? { description: article.excerpt } : {}),
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    author,
    image: absoluteUrl(article.coverUrl ?? PROFILE_IMAGE_PATH, site),
    inLanguage: LOCALE_DETAILS[locale].htmlLang,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}
