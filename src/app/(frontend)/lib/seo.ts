import type { Metadata, Viewport } from 'next'

import type { ArticleDetail } from './article-mappers'
import { articlePagePath, ARTICLES_HUB_PATH } from './article-page'
import { DEFAULT_PROFILE_IMAGE_PATH, DEFAULT_SITE_SETTINGS } from './mappers'
import type { ProjectDetail } from './project-mappers'
import { projectPagePath } from './project-page'
import type { ArticleItem, FooterContent, HeaderContent, SiteSettingsContent } from './types'

/**
 * SEO, viewport, and JSON-LD builders for the site, backed by the `site-settings` global.
 * This module does not import React or Payload.
 */

export const DEFAULT_SITE_URL = 'https://vtarikhi.com'

export const PROFILE_IMAGE_PATH = DEFAULT_PROFILE_IMAGE_PATH

export const siteUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (configured && configured.length > 0 ? configured : DEFAULT_SITE_URL).replace(/\/+$/, '')
}

export const absoluteUrl = (value: string, site: string = siteUrl()): string =>
  new URL(value, `${site}/`).toString()

export const htmlLangFromLocale = (locale: string | null | undefined): string => {
  const raw = (locale ?? '').trim()
  if (!raw) return 'en'
  const primary = raw.split(/[-_]/)[0]?.toLowerCase()
  return primary && primary.length > 0 ? primary : 'en'
}

export const buildPortfolioMetadata = (
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Metadata => {
  const ogImageUrl = absoluteUrl(settings.ogImage.url, site)

  return {
    metadataBase: new URL(site),
    title: settings.siteTitle,
    description: settings.metaDescription,
    ...(settings.keywords ? { keywords: settings.keywords } : {}),
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
      siteName: settings.siteName,
      title: settings.siteName,
      description: settings.ogDescription || settings.metaDescription,
      url: site,
      locale: settings.locale,
      images: [
        {
          url: ogImageUrl,
          secureUrl: ogImageUrl,
          ...(settings.ogImage.mimeType ? { type: settings.ogImage.mimeType } : {}),
          width: settings.ogImage.width,
          height: settings.ogImage.height,
          alt: settings.ogImage.alt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
    },
    other: {
      owner: settings.ownerName,
    },
  }
}

export const portfolioMetadata: Metadata = buildPortfolioMetadata(DEFAULT_SITE_SETTINGS)

export const buildPortfolioViewport = (
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
): Viewport => ({
  width: 'device-width',
  initialScale: 1,
  maximumScale: 10,
  userScalable: true,
  themeColor: settings.themeColor,
})

const NON_PROFILE_ICONS = new Set(['faWhatsapp'])

export const buildPersonJsonLd = (
  header: HeaderContent | null,
  footer: FooterContent | null,
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Record<string, unknown> => {
  const phone = footer?.contactInfo.find((item) => item.type === 'phone')?.content
  const email = footer?.contactInfo.find((item) => item.type === 'email')?.content
  const profiles = (footer?.socialLinks ?? [])
    .filter((link) => !NON_PROFILE_ICONS.has(link.iconName))
    .map((link) => link.url)

  const addressFields = {
    ...(settings.address.addressLocality
      ? { addressLocality: settings.address.addressLocality }
      : {}),
    ...(settings.address.addressRegion ? { addressRegion: settings.address.addressRegion } : {}),
    ...(settings.address.postalCode ? { postalCode: settings.address.postalCode } : {}),
    ...(settings.address.streetAddress ? { streetAddress: settings.address.streetAddress } : {}),
  }

  return {
    '@context': 'https://schema.org/',
    '@type': 'Person',
    ...(Object.keys(addressFields).length > 0
      ? {
          address: {
            '@type': 'PostalAddress',
            ...addressFields,
          },
        }
      : {}),
    name: header?.sureName || footer?.fullName || settings.ownerName,
    ...(phone ? { telephone: phone } : {}),
    url: site,
    ...(email ? { email: `mailto:${email}` } : {}),
    image: absoluteUrl(settings.ogImage.url, site),
    ...(settings.jobTitle ? { jobTitle: settings.jobTitle } : {}),
    sameAs: [...profiles, site],
  }
}

export const articleCanonicalUrl = (slug: string, site: string = siteUrl()): string =>
  `${site}${articlePagePath(slug)}`

export const articlesHubCanonicalUrl = (site: string = siteUrl()): string =>
  `${site}${ARTICLES_HUB_PATH}`

export const buildArticlesHubMetadata = (
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Metadata => {
  const url = articlesHubCanonicalUrl(site)
  const title = `${settings.articlesSection.heading} | ${settings.siteName}`
  const description = settings.articlesSection.archiveDescription || settings.metaDescription
  const imageUrl = absoluteUrl(settings.ogImage.url, site)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: settings.siteName,
      title,
      description,
      url,
      locale: settings.locale,
      images: [
        {
          url: imageUrl,
          alt: settings.ogImage.alt || settings.ownerName,
          width: settings.ogImage.width,
          height: settings.ogImage.height,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export const buildArticlesHubJsonLd = (
  articles: ArticleItem[],
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Record<string, unknown> => {
  const url = articlesHubCanonicalUrl(site)
  return {
    '@context': 'https://schema.org/',
    '@type': 'CollectionPage',
    name: settings.articlesSection.heading,
    description: settings.articlesSection.archiveDescription,
    url,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: articles.length,
      itemListElement: articles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: article.title,
        url: article.pagePath ? `${site}${article.pagePath}` : article.link || url,
      })),
    },
  }
}

export const buildArticleMetadata = (
  article: ArticleDetail,
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Metadata => {
  const url = articleCanonicalUrl(article.slug, site)
  const image = article.coverUrl
    ? { url: absoluteUrl(article.coverUrl, site), alt: article.coverAlt, width: 1140, height: 600 }
    : {
        url: absoluteUrl(settings.ogImage.url, site),
        alt: settings.ogImage.alt || settings.ownerName,
        width: settings.ogImage.width,
        height: settings.ogImage.height,
      }

  return {
    title: article.title,
    ...(article.excerpt ? { description: article.excerpt } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName: settings.siteName,
      title: article.title,
      ...(article.excerpt ? { description: article.excerpt } : {}),
      url,
      locale: settings.locale,
      ...(article.publishedAt ? { publishedTime: article.publishedAt } : {}),
      images: [image],
    },
    twitter: {
      card: article.coverUrl ? 'summary_large_image' : 'summary',
      title: article.title,
      ...(article.excerpt ? { description: article.excerpt } : {}),
      images: [image.url],
    },
  }
}

export const buildBlogPostingJsonLd = (
  article: ArticleDetail,
  header: HeaderContent | null,
  footer: FooterContent | null,
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Record<string, unknown> => {
  const { '@context': _context, ...author } = buildPersonJsonLd(header, footer, settings, site)
  const url = articleCanonicalUrl(article.slug, site)

  return {
    '@context': 'https://schema.org/',
    '@type': 'BlogPosting',
    headline: article.title,
    ...(article.excerpt ? { description: article.excerpt } : {}),
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    author,
    image: absoluteUrl(article.coverUrl ?? settings.ogImage.url, site),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

export const projectCanonicalUrl = (slug: string, site: string = siteUrl()): string =>
  `${site}${projectPagePath(slug)}`

export const buildProjectMetadata = (
  project: ProjectDetail,
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Metadata => {
  const url = projectCanonicalUrl(project.slug, site)
  const description = project.excerpt || settings.metaDescription
  const image = project.coverUrl
    ? { url: absoluteUrl(project.coverUrl, site), alt: project.coverAlt, width: 1140, height: 600 }
    : {
        url: absoluteUrl(settings.ogImage.url, site),
        alt: settings.ogImage.alt || settings.ownerName,
        width: settings.ogImage.width,
        height: settings.ogImage.height,
      }

  return {
    title: `${project.title} — ${settings.projectsSection.caseStudyLabel}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName: settings.siteName,
      title: project.title,
      description,
      url,
      locale: settings.locale,
      images: [image],
    },
    twitter: {
      card: project.coverUrl ? 'summary_large_image' : 'summary',
      title: project.title,
      description,
      images: [image.url],
    },
  }
}

export const buildProjectJsonLd = (
  project: ProjectDetail,
  header: HeaderContent | null,
  footer: FooterContent | null,
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Record<string, unknown> => {
  const { '@context': _context, ...creator } = buildPersonJsonLd(header, footer, settings, site)
  const url = projectCanonicalUrl(project.slug, site)

  return {
    '@context': 'https://schema.org/',
    '@type': 'CreativeWork',
    name: project.title,
    ...(project.excerpt ? { description: project.excerpt } : {}),
    ...(project.year ? { dateCreated: project.year } : {}),
    ...(project.techStack.length > 0 ? { keywords: project.techStack.join(', ') } : {}),
    creator,
    image: absoluteUrl(project.coverUrl ?? settings.ogImage.url, site),
    url,
    ...(project.liveUrl ? { sameAs: project.liveUrl } : {}),
  }
}
