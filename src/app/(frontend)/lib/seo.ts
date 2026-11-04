import type { Metadata, Viewport } from 'next'

import type { ArticleDetail } from './article-mappers'
import { articlePagePath, ARTICLES_HUB_PATH } from './article-page'
import { DEFAULT_PROFILE_IMAGE_PATH, DEFAULT_SITE_SETTINGS } from './mappers'
import type { ProjectDetail } from './project-mappers'
import { projectPagePath, PROJECTS_HUB_PATH } from './project-page'
import type {
  ArticleItem,
  FooterContent,
  HeaderContent,
  ProjectItem,
  SiteSettingsContent,
} from './types'

/**
 * SEO, viewport, verification, robots, and JSON-LD builders for the site, backed by the
 * `site-settings` global and per-document `@payloadcms/plugin-seo` overrides (`seo`).
 * This module does not import React or Payload.
 */

export const DEFAULT_SITE_URL = 'https://vtarikhi.com'

export const PROFILE_IMAGE_PATH = DEFAULT_PROFILE_IMAGE_PATH

export const RSS_FEED_PATH = '/feed.xml'

export const CONTACT_HUB_PATH = '/contact'

export const OG_IMAGE_ROUTE_PATH = '/og'

export type DynamicOgCardKind = 'article' | 'project' | 'hub' | 'site'

export type DynamicOgImageParams = {
  kind: DynamicOgCardKind
  title: string
  subtitle?: string | null
  eyebrow?: string | null
  meta?: string | null
  tags?: readonly string[]
  author?: string | null
  siteName?: string | null
}

const clampOgParam = (value: string | null | undefined, maxLen: number): string | null => {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen - 1).trimEnd()}…`
}

export const buildDynamicOgImageUrl = (
  params: DynamicOgImageParams,
  site: string = siteUrl(),
): string => {
  const search = new URLSearchParams()
  search.set('kind', params.kind)
  const title = clampOgParam(params.title, 120) || DEFAULT_SITE_SETTINGS.siteName
  search.set('title', title)

  const subtitle = clampOgParam(params.subtitle, 180)
  if (subtitle) search.set('subtitle', subtitle)

  const eyebrow = clampOgParam(params.eyebrow, 48)
  if (eyebrow) search.set('eyebrow', eyebrow)

  const meta = clampOgParam(params.meta, 64)
  if (meta) search.set('meta', meta)

  const cleanTags = (params.tags ?? [])
    .map((tag) => clampOgParam(tag, 28))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 4)
  if (cleanTags.length > 0) {
    search.set('tags', cleanTags.join(','))
  }

  const author = clampOgParam(params.author, 48)
  if (author) search.set('author', author)

  const siteName = clampOgParam(params.siteName, 56)
  if (siteName) search.set('site', siteName)

  return `${site.replace(/\/+$/, '')}${OG_IMAGE_ROUTE_PATH}?${search.toString()}`
}

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

export const buildRobotsMetadata = (shouldIndex: boolean): Metadata['robots'] =>
  buildDocumentRobotsMetadata(shouldIndex, false, false)

export const buildDocumentRobotsMetadata = (
  allowIndexing: boolean,
  noIndex?: boolean | null,
  noFollow?: boolean | null,
): Metadata['robots'] => {
  const index = allowIndexing && !noIndex
  const follow = allowIndexing && !noFollow
  return {
    index,
    follow,
    googleBot: index
      ? {
          index: true,
          follow,
          'max-image-preview': 'large',
          'max-snippet': -1,
          'max-video-preview': -1,
        }
      : {
          index: false,
          follow,
        },
  }
}

const buildTwitterAttribution = (
  settings: SiteSettingsContent,
): { site?: string; creator?: string } => ({
  ...(settings.twitterSite ? { site: settings.twitterSite } : {}),
  ...(settings.twitterCreator ? { creator: settings.twitterCreator } : {}),
})

const buildVerificationMetadata = (
  settings: SiteSettingsContent,
): Metadata['verification'] | undefined => {
  const { google, bing, yandex } = settings.verification
  if (!google && !bing && !yandex) return undefined
  return {
    ...(google ? { google } : {}),
    ...(yandex ? { yandex } : {}),
    ...(bing ? { other: { 'msvalidate.01': bing } } : {}),
  }
}

export const buildPortfolioMetadata = (
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Metadata => {
  const ogImageUrl = absoluteUrl(settings.ogImage.url, site)
  const socialTitle = settings.ogTitle || settings.siteTitle
  const socialDescription = settings.ogDescription || settings.metaDescription
  const verification = buildVerificationMetadata(settings)

  return {
    metadataBase: new URL(site),
    title: settings.siteTitle,
    description: settings.metaDescription,
    ...(settings.keywords ? { keywords: settings.keywords } : {}),
    alternates: {
      canonical: site,
      types: {
        'application/rss+xml': `${site}${RSS_FEED_PATH}`,
      },
    },
    robots: buildRobotsMetadata(settings.allowIndexing),
    ...(verification ? { verification } : {}),
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
      type: 'website',
      siteName: settings.siteName,
      title: socialTitle,
      description: socialDescription,
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
      title: socialTitle,
      description: socialDescription,
      images: [ogImageUrl],
      ...buildTwitterAttribution(settings),
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
    ...(settings.knowsAbout.length > 0 ? { knowsAbout: settings.knowsAbout } : {}),
    ...(settings.worksFor
      ? {
          worksFor: {
            '@type': 'Organization',
            name: settings.worksFor.name,
            ...(settings.worksFor.url ? { url: settings.worksFor.url } : {}),
          },
        }
      : {}),
    ...(settings.alumniOf.length > 0
      ? {
          alumniOf: settings.alumniOf.map((org) => ({
            '@type': 'EducationalOrganization',
            name: org.name,
            ...(org.url ? { url: org.url } : {}),
          })),
        }
      : {}),
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
  const hubSeo = settings.articlesHubSeo
  const headingTitle = hubSeo.metaTitle || settings.articlesSection.heading
  const title =
    hubSeo.metaTitle || `${settings.articlesSection.heading} | ${settings.siteName}`
  const description =
    hubSeo.metaDescription ||
    settings.articlesSection.archiveDescription ||
    settings.metaDescription
  const hubKeywords = hubSeo.keywords
    ? hubSeo.keywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const image = hubSeo.ogImage
    ? {
        url: absoluteUrl(hubSeo.ogImage.url, site),
        alt: hubSeo.ogImage.alt || settings.ownerName,
        width: hubSeo.ogImage.width,
        height: hubSeo.ogImage.height,
        ...(hubSeo.ogImage.mimeType ? { type: hubSeo.ogImage.mimeType } : {}),
      }
    : {
        url: buildDynamicOgImageUrl(
          {
            kind: 'hub',
            eyebrow: 'Articles Archive',
            title: headingTitle,
            subtitle: description,
            tags: hubKeywords,
            author: settings.ownerName,
            siteName: settings.siteName,
          },
          site,
        ),
        alt: title,
        width: 1200,
        height: 630,
        type: 'image/png',
      }
  const shouldIndex = settings.allowIndexing && !hubSeo.noIndex

  return {
    title,
    description,
    ...(hubSeo.keywords ? { keywords: hubSeo.keywords } : {}),
    robots: buildRobotsMetadata(shouldIndex),
    alternates: {
      canonical: url,
      types: {
        'application/rss+xml': `${site}${RSS_FEED_PATH}`,
      },
    },
    openGraph: {
      type: 'website',
      siteName: settings.siteName,
      title,
      description,
      url,
      locale: settings.locale,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
      ...buildTwitterAttribution(settings),
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
    name: settings.articlesHubSeo.metaTitle || settings.articlesSection.heading,
    description:
      settings.articlesHubSeo.metaDescription || settings.articlesSection.archiveDescription,
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
  const pageUrl = articleCanonicalUrl(article.slug, site)
  const canonical = article.seo?.canonicalUrl
    ? absoluteUrl(article.seo.canonicalUrl, site)
    : pageUrl
  const effectiveTitle = article.seo?.title || article.title
  const effectiveDescription = article.seo?.description || article.excerpt || undefined
  const socialTitle = article.seo?.ogTitle || effectiveTitle
  const socialDescription = article.seo?.ogDescription || effectiveDescription
  const seoKeywords = article.seo?.keywords ?? []
  const customImageUrl = article.seo?.imageUrl || article.coverUrl
  const customImageAlt = article.seo?.imageAlt || article.coverAlt
  const dynamicImageUrl = !customImageUrl
    ? buildDynamicOgImageUrl(
        {
          kind: 'article',
          eyebrow: article.category === 'others' ? 'Note' : 'Article',
          title: socialTitle,
          subtitle: socialDescription ?? null,
          meta: [article.publishedDisplay, article.readTimeDisplay].filter(Boolean).join(' • '),
          tags: seoKeywords,
          author: settings.ownerName,
          siteName: settings.siteName,
        },
        site,
      )
    : null
  const twitterCard = article.seo?.twitterCard || 'summary_large_image'
  const image = customImageUrl
    ? { url: absoluteUrl(customImageUrl, site), alt: customImageAlt, width: 1200, height: 630 }
    : {
        url: dynamicImageUrl!,
        alt: socialTitle,
        width: 1200,
        height: 630,
        type: 'image/png',
      }

  return {
    title: effectiveTitle,
    ...(effectiveDescription ? { description: effectiveDescription } : {}),
    ...(seoKeywords.length > 0 ? { keywords: seoKeywords } : {}),
    robots: buildDocumentRobotsMetadata(
      settings.allowIndexing,
      article.seo?.noIndex,
      article.seo?.noFollow,
    ),
    alternates: { canonical },
    openGraph: {
      type: 'article',
      siteName: settings.siteName,
      title: socialTitle,
      ...(socialDescription ? { description: socialDescription } : {}),
      url: pageUrl,
      locale: settings.locale,
      ...(article.publishedAt ? { publishedTime: article.publishedAt } : {}),
      ...(seoKeywords.length > 0 ? { tags: seoKeywords } : {}),
      images: [image],
    },
    twitter: {
      card: twitterCard,
      title: socialTitle,
      ...(socialDescription ? { description: socialDescription } : {}),
      images: [image.url],
      ...buildTwitterAttribution(settings),
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
  const description = article.seo?.description || article.excerpt
  const seoKeywords = article.seo?.keywords ?? []
  const resolvedImage =
    article.seo?.imageUrl ??
    article.coverUrl ??
    (settings.ogImage.url !== DEFAULT_PROFILE_IMAGE_PATH
      ? settings.ogImage.url
      : buildDynamicOgImageUrl(
          {
            kind: 'article',
            eyebrow: article.category === 'others' ? 'Note' : 'Article',
            title: article.title,
            subtitle: description ?? null,
            meta: [article.publishedDisplay, article.readTimeDisplay].filter(Boolean).join(' • '),
            tags: seoKeywords,
            author: settings.ownerName,
            siteName: settings.siteName,
          },
          site,
        ))

  return {
    '@context': 'https://schema.org/',
    '@type': 'BlogPosting',
    headline: article.title,
    ...(description ? { description } : {}),
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    ...(seoKeywords.length > 0 ? { keywords: seoKeywords.join(', ') } : {}),
    author,
    image: absoluteUrl(resolvedImage, site),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

export const projectCanonicalUrl = (slug: string, site: string = siteUrl()): string =>
  `${site}${projectPagePath(slug)}`

export const projectsHubCanonicalUrl = (site: string = siteUrl()): string =>
  `${site}${PROJECTS_HUB_PATH}`

export const buildProjectsHubMetadata = (
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Metadata => {
  const url = projectsHubCanonicalUrl(site)
  const hubSeo = settings.projectsHubSeo
  const headingTitle = hubSeo.metaTitle || settings.projectsSection.heading
  const title =
    hubSeo.metaTitle || `${settings.projectsSection.heading} | ${settings.siteName}`
  const description =
    hubSeo.metaDescription ||
    settings.projectsSection.archiveDescription ||
    settings.metaDescription
  const hubKeywords = hubSeo.keywords
    ? hubSeo.keywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const image = hubSeo.ogImage
    ? {
        url: absoluteUrl(hubSeo.ogImage.url, site),
        alt: hubSeo.ogImage.alt || settings.ownerName,
        width: hubSeo.ogImage.width,
        height: hubSeo.ogImage.height,
        ...(hubSeo.ogImage.mimeType ? { type: hubSeo.ogImage.mimeType } : {}),
      }
    : {
        url: buildDynamicOgImageUrl(
          {
            kind: 'hub',
            eyebrow: 'Projects Showcase',
            title: headingTitle,
            subtitle: description,
            tags: hubKeywords,
            author: settings.ownerName,
            siteName: settings.siteName,
          },
          site,
        ),
        alt: title,
        width: 1200,
        height: 630,
        type: 'image/png',
      }
  const shouldIndex = settings.allowIndexing && !hubSeo.noIndex

  return {
    title,
    description,
    ...(hubSeo.keywords ? { keywords: hubSeo.keywords } : {}),
    robots: buildRobotsMetadata(shouldIndex),
    alternates: {
      canonical: url,
      types: {
        'application/rss+xml': `${site}${RSS_FEED_PATH}`,
      },
    },
    openGraph: {
      type: 'website',
      siteName: settings.siteName,
      title,
      description,
      url,
      locale: settings.locale,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
      ...buildTwitterAttribution(settings),
    },
  }
}

export const buildProjectsHubJsonLd = (
  projects: ProjectItem[],
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Record<string, unknown> => {
  const url = projectsHubCanonicalUrl(site)
  return {
    '@context': 'https://schema.org/',
    '@type': 'CollectionPage',
    name: settings.projectsHubSeo.metaTitle || settings.projectsSection.heading,
    description:
      settings.projectsHubSeo.metaDescription || settings.projectsSection.archiveDescription,
    url,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: projects.length,
      itemListElement: projects.map((project, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: project.title,
        url: project.pagePath
          ? `${site}${project.pagePath}`
          : project.url && project.url !== '#'
            ? project.url
            : url,
      })),
    },
  }
}

export const buildProjectMetadata = (
  project: ProjectDetail,
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Metadata => {
  const pageUrl = projectCanonicalUrl(project.slug, site)
  const canonical = project.seo?.canonicalUrl
    ? absoluteUrl(project.seo.canonicalUrl, site)
    : pageUrl
  const defaultTitle = `${project.title} — ${settings.projectsSection.caseStudyLabel}`
  const effectiveTitle = project.seo?.title || defaultTitle
  const ogTitle = project.seo?.ogTitle || project.seo?.title || project.title
  const description = project.seo?.description || project.excerpt || settings.metaDescription
  const socialDescription = project.seo?.ogDescription || description
  const seoKeywords =
    project.seo?.keywords && project.seo.keywords.length > 0
      ? project.seo.keywords
      : project.techStack
  const customImageUrl = project.seo?.imageUrl || project.coverUrl
  const customImageAlt = project.seo?.imageAlt || project.coverAlt
  const projectEyebrow =
    [project.role, project.year].filter(Boolean).join(' • ') ||
    settings.projectsSection.caseStudyLabel
  const dynamicImageUrl = !customImageUrl
    ? buildDynamicOgImageUrl(
        {
          kind: 'project',
          eyebrow: projectEyebrow,
          title: ogTitle,
          subtitle: socialDescription,
          meta: project.readTimeDisplay || null,
          tags: seoKeywords,
          author: settings.ownerName,
          siteName: settings.siteName,
        },
        site,
      )
    : null
  const twitterCard = project.seo?.twitterCard || 'summary_large_image'
  const image = customImageUrl
    ? { url: absoluteUrl(customImageUrl, site), alt: customImageAlt, width: 1200, height: 630 }
    : {
        url: dynamicImageUrl!,
        alt: ogTitle,
        width: 1200,
        height: 630,
        type: 'image/png',
      }

  return {
    title: effectiveTitle,
    description,
    ...(seoKeywords.length > 0 ? { keywords: seoKeywords } : {}),
    robots: buildDocumentRobotsMetadata(
      settings.allowIndexing,
      project.seo?.noIndex,
      project.seo?.noFollow,
    ),
    alternates: { canonical },
    openGraph: {
      type: 'article',
      siteName: settings.siteName,
      title: ogTitle,
      description: socialDescription,
      url: pageUrl,
      locale: settings.locale,
      ...(seoKeywords.length > 0 ? { tags: seoKeywords } : {}),
      images: [image],
    },
    twitter: {
      card: twitterCard,
      title: ogTitle,
      description: socialDescription,
      images: [image.url],
      ...buildTwitterAttribution(settings),
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
  const description = project.seo?.description || project.excerpt
  const effectiveKeywords =
    project.seo?.keywords && project.seo.keywords.length > 0
      ? project.seo.keywords
      : project.techStack
  const resolvedImage =
    project.seo?.imageUrl ??
    project.coverUrl ??
    (settings.ogImage.url !== DEFAULT_PROFILE_IMAGE_PATH
      ? settings.ogImage.url
      : buildDynamicOgImageUrl(
          {
            kind: 'project',
            eyebrow:
              [project.role, project.year].filter(Boolean).join(' • ') ||
              settings.projectsSection.caseStudyLabel,
            title: project.title,
            subtitle: description ?? null,
            tags: effectiveKeywords,
            author: settings.ownerName,
            siteName: settings.siteName,
          },
          site,
        ))

  return {
    '@context': 'https://schema.org/',
    '@type': 'CreativeWork',
    name: project.title,
    ...(description ? { description } : {}),
    ...(project.year ? { dateCreated: project.year } : {}),
    ...(effectiveKeywords.length > 0 ? { keywords: effectiveKeywords.join(', ') } : {}),
    creator,
    image: absoluteUrl(resolvedImage, site),
    url,
    ...(project.liveUrl ? { sameAs: project.liveUrl } : {}),
  }
}

export const buildContactPageMetadata = (
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Metadata => {
  const url = `${site}${CONTACT_HUB_PATH}`
  const title = `Contact & Request CV | ${settings.siteName}`
  const description = `Get in touch with ${settings.ownerName} for project inquiries, consulting, or to request a current CV.`
  const imageUrl = absoluteUrl(settings.ogImage.url, site)

  return {
    title,
    description,
    robots: buildRobotsMetadata(settings.allowIndexing),
    alternates: {
      canonical: url,
      types: {
        'application/rss+xml': `${site}${RSS_FEED_PATH}`,
      },
    },
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
          ...(settings.ogImage.mimeType ? { type: settings.ogImage.mimeType } : {}),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
      ...buildTwitterAttribution(settings),
    },
  }
}

export const buildContactPageJsonLd = (
  settings: SiteSettingsContent = DEFAULT_SITE_SETTINGS,
  site: string = siteUrl(),
): Record<string, unknown> => ({
  '@context': 'https://schema.org/',
  '@type': 'ContactPage',
  name: `Contact ${settings.ownerName}`,
  description: `Send an inquiry or request a CV from ${settings.ownerName}.`,
  url: `${site}${CONTACT_HUB_PATH}`,
})

