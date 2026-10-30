/**
 * Pure mappers from Payload documents to portfolio view models.
 *
 * Rules:
 * - No I/O, no Payload runtime import (types only). These functions are unit-testable
 *   without a database.
 * - Mappers preserve the order of the input array. Sorting is the responsibility of the
 *   query (see `payload-source.ts`), so the database stays the single source of order.
 * - Globals (`site-settings`, `navigation`, `footer`) gracefully fall back when a fresh
 *   database has not saved them yet.
 */

import type {
  About,
  Article,
  Certificate,
  Education,
  Experience,
  Footer,
  Header,
  Media,
  Navigation,
  Project,
  Service,
  SiteSetting,
  Skill,
} from '@/payload-types'

import { articlePagePath, hasArticlePage } from './article-page'
import { formatDisplayDate, formatReadTime, joinDisplay } from './format'
import { calculateReadTimeMinutes } from './lexical'
import { hasProjectPage, projectPagePath } from './project-page'
import type {
  AboutContent,
  ArticleGalleryLayout,
  ArticleGallerySlide,
  ArticleItem,
  ArticleMediaMode,
  CertificateItem,
  ContactItem,
  EducationItem,
  ExperienceItem,
  FooterContent,
  HeaderAccentTone,
  HeaderBackgroundPreset,
  HeaderContent,
  HeaderStudioConfig,
  HiringCta,
  HubPageSeoContent,
  NavigationContent,
  NavigationItem,
  OgImageContent,
  PersonOrganizationContent,
  PortfolioContent,
  ProjectFilter,
  ProjectItem,
  ProjectsArchiveLayoutMode,
  ProjectsContent,
  ArticlesArchiveLayoutMode,
  SectionCta,
  SeoOverride,
  ServiceItem,
  ServicesContent,
  SiteSettingsContent,
  SkillBar,
  SkillsContent,
  TwitterCardType,
} from './types'

/**
 * Raw documents as returned by the data source. Singletons and unsaved globals may be `null`.
 */
export type RawPortfolioDocs = {
  siteSettings?: Partial<SiteSetting> | null
  navigation?: Partial<Navigation> | null
  header?: Partial<Header> | null
  about: About | null
  skills: Skill[]
  experiences: Experience[]
  educations: Education[]
  certificates: Certificate[]
  articles: Article[]
  services: Service[]
  projects: Project[]
  footer: Footer | null
}

/** Measured from public/images/profile.webp. */
export const DEFAULT_PROFILE_IMAGE_PATH = '/images/profile.webp'
const DEFAULT_PROFILE_IMAGE_WIDTH = 668
const DEFAULT_PROFILE_IMAGE_HEIGHT = 689

export const DEFAULT_NAVIGATION: NavigationContent = {
  brand: {
    text: 'eTarikhi',
    href: '/',
  },
  skipToContentLabel: 'Skip to content',
  items: [
    { id: 'home', label: 'Home', href: '/#home', position: 'left', openInNewTab: false },
    { id: 'about', label: 'About', href: '/#about', position: 'left', openInNewTab: false },
    { id: 'skill', label: 'Skills', href: '/#skill', position: 'left', openInNewTab: false },
    { id: 'service', label: 'Services', href: '/#service', position: 'right', openInNewTab: false },
    { id: 'project', label: 'Projects', href: '/#project', position: 'right', openInNewTab: false },
    { id: 'contact', label: 'Contact', href: '/#contact', position: 'right', openInNewTab: false },
  ],
}

export const DEFAULT_HUB_PAGE_SEO: HubPageSeoContent = {
  metaTitle: null,
  metaDescription: null,
  keywords: null,
  ogImage: null,
  noIndex: false,
}

export const DEFAULT_SITE_SETTINGS: SiteSettingsContent = {
  siteName: 'Amir v.Tarikhi Live Resume',
  ownerName: 'Amir v.Tarikhi',
  locale: 'en_US',
  themeColor: '#da9100',
  siteTitle: 'Amir v.Tarikhi Live Resume | Full-Stack Senior Web Developer',
  metaDescription:
    'Senior PHP, JavaScript & MySQL, Mid. React & Next.js, Jr. Node.js & Laravel, E-Commerce CMS, WordPress, WooCommerce & Shopify Developer ..',
  keywords:
    'Senior Web Developer, Full-Stack Developer, PHP Developer, JavaScript Developer, Next.js Developer, React.js Developer, Shopify Developer, MySQL Developer, Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant',
  ogTitle: null,
  ogDescription:
    'Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant',
  ogImage: {
    url: DEFAULT_PROFILE_IMAGE_PATH,
    width: DEFAULT_PROFILE_IMAGE_WIDTH,
    height: DEFAULT_PROFILE_IMAGE_HEIGHT,
    alt: 'Amir v.Tarikhi',
    mimeType: 'image/webp',
  },
  allowIndexing: true,
  twitterSite: null,
  twitterCreator: null,
  verification: {
    google: null,
    bing: null,
    yandex: null,
  },
  articlesHubSeo: { ...DEFAULT_HUB_PAGE_SEO },
  projectsHubSeo: { ...DEFAULT_HUB_PAGE_SEO },
  jobTitle: 'Senior Full-Stack Web Developer',
  knowsAbout: [],
  worksFor: null,
  alumniOf: [],
  address: {
    streetAddress: '34805, Beykoz, Istanbul, Turkey',
    addressLocality: 'Istanbul, Turkey',
    addressRegion: 'Beykoz',
    postalCode: '34805',
  },
  hero: {
    greeting: "I'm",
    requestCvLabel: 'Request CV',
  },
  servicesSection: {
    heading: 'My Services',
  },
  skillsSection: {
    heading: 'Skills & Experience',
    intro: 'Some of my top skills listed as below.',
    skillsSubheading: 'My Skills',
    experienceTabLabel: 'Experience',
    educationTabLabel: 'Education',
  },
  certificatesSection: {
    heading: 'Recent Certificates',
    cta: {
      label: 'All Certificates >',
      url: 'https://www.linkedin.com/in/etarikhi/details/certifications/',
    },
    viewCertificateLabel: 'View Certificate →',
  },
  projectsSection: {
    heading: 'My Projects',
    allFilterLabel: 'All Projects',
    archiveDescription: 'Selected projects, engineering case studies, and full-stack builds.',
    searchPlaceholder: 'Search projects by title, tech stack, or role…',
    caseStudyLabel: 'Case study',
    backToProjectsLabel: 'Back to projects',
    liveProjectLabel: 'Visit live project',
    notFoundTitle: 'Project not found',
    notFoundDescription: 'This project does not exist, or it has no case-study page on this site.',
  },
  articlesSection: {
    heading: 'Latest Articles',
    cta: {
      label: 'All Articles >',
      url: '/articles',
    },
    readOnSiteLabel: 'Read on this site',
    featuredBadgeLabel: 'Featured',
    archiveDescription: 'Articles, engineering notes, and guides.',
    searchPlaceholder: 'Search articles by title or topic…',
    backToArticlesLabel: 'Back to articles',
    externalPublicationLabel: 'Originally published at',
    notFoundTitle: 'Article not found',
    notFoundDescription: 'This article does not exist, or it has no page on this site.',
  },
  footerLabels: {
    socialPrompt: 'Get connected with me on social networks:',
    profilesHeading: 'My Profiles',
    contactHeading: 'Contact',
  },
}

/**
 * Project filter bar. Category values match the `categories` select options in
 * `src/collections/Projects.ts`; the "all" filter label is configurable in `SiteSettings`.
 */
export const PROJECT_FILTERS: ProjectFilter[] = [
  { label: DEFAULT_SITE_SETTINGS.projectsSection.allFilterLabel, value: '*' },
  { label: 'Front-End', value: 'front-end' },
  { label: 'Back-End', value: 'back-end' },
  { label: 'CMS-CRM', value: 'cms-crm' },
]

export const buildProjectFilters = (
  allFilterLabel: string = DEFAULT_SITE_SETTINGS.projectsSection.allFilterLabel,
): ProjectFilter[] => [
  { label: allFilterLabel, value: '*' },
  ...PROJECT_FILTERS.slice(1),
]

export type MediaSizeName = 'thumbnail' | 'card' | 'content' | 'hero' | 'og'

type MediaVariantShape = {
  url?: string | null
  width?: number | null
  height?: number | null
  mimeType?: string | null
}

/** Returns the resolved URL of an upload, or `null` when the relation is not populated. */
export const resolveMediaUrl = (media: number | Media | null | undefined): string | null => {
  if (!media || typeof media !== 'object') return null
  return media.url ?? null
}

/**
 * Resolves a preferred responsive `imageSize` URL (`thumbnail`, `card`, `hero`, `og`) from a
 * populated `Media` upload, falling back gracefully to the original `media.url`.
 */
export const resolveMediaSizeUrl = (
  media: number | Media | null | undefined,
  preferred?: MediaSizeName,
): string | null => {
  if (!media || typeof media !== 'object') return null
  if (preferred) {
    const sizes = (media as { sizes?: Partial<Record<MediaSizeName, MediaVariantShape>> }).sizes
    const sizedUrl = sizes?.[preferred]?.url
    if (typeof sizedUrl === 'string' && sizedUrl.trim().length > 0) {
      return sizedUrl
    }
  }
  return media.url ?? null
}

/** Extracts the tiny WebP base64 LQIP `blurDataURL` generated by `sharp`, when present. */
export const resolveMediaBlurDataURL = (
  media: number | Media | null | undefined,
): string | null => {
  if (!media || typeof media !== 'object') return null
  const blur = (media as { blurDataURL?: string | null }).blurDataURL
  return typeof blur === 'string' && blur.startsWith('data:image/') ? blur : null
}

type StoredUrlMeta = {
  width?: number | null
  height?: number | null
  blurDataURL?: string | null
}

const parseStoredUrlMeta = (raw: unknown): StoredUrlMeta | null => {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  return {
    width: typeof rec.width === 'number' && rec.width > 0 ? rec.width : null,
    height: typeof rec.height === 'number' && rec.height > 0 ? rec.height : null,
    blurDataURL:
      typeof rec.blurDataURL === 'string' && rec.blurDataURL.startsWith('data:image/')
        ? rec.blurDataURL
        : null,
  }
}

const resolveMediaObjectPosition = (
  media: number | Media | null | undefined,
): string | undefined => {
  if (!media || typeof media !== 'object') return undefined
  const focalX = (media as { focalX?: number | null }).focalX
  const focalY = (media as { focalY?: number | null }).focalY
  return typeof focalX === 'number' && typeof focalY === 'number'
    ? `${focalX}% ${focalY}%`
    : undefined
}

export type ResolvedArticleLeadMedia = {
  mediaMode: ArticleMediaMode
  cardUrl: string
  heroUrl: string | null
  blurDataURL: string | null
  coverAlt: string
  coverObjectPosition?: string
  galleryLayout: ArticleGalleryLayout
  gallery: ArticleGallerySlide[]
}

/**
 * Resolves an article's display mode (`none` | `single` | `gallery`) across both direct `Media`
 * uploads and pre-uploaded `imageUrl` paths (e.g. `"/images/articles/1735708966846.webp"`).
 */
export const resolveArticleLeadMedia = (doc: Partial<Article>): ResolvedArticleLeadMedia => {
  const fallbackAlt = doc.title?.trim() || 'Article illustration'
  const rawMode = doc.mediaMode

  if (rawMode === 'none') {
    return {
      mediaMode: 'none',
      cardUrl: '',
      heroUrl: null,
      blurDataURL: null,
      coverAlt: fallbackAlt,
      galleryLayout: 'carousel',
      gallery: [],
    }
  }

  if (rawMode === 'gallery') {
    const galleryLayout: ArticleGalleryLayout =
      doc.galleryLayout === 'grid' ? 'grid' : 'carousel'
    const slides: ArticleGallerySlide[] = []

    for (const [idx, slide] of (doc.gallery ?? []).entries()) {
      if (!slide) continue
      const inferredSource =
        slide.source ?? (slide.imageUrl && !slide.media ? 'url' : 'upload')

      if (inferredSource === 'url') {
        const urlStr = slide.imageUrl?.trim() || ''
        if (!urlStr) continue
        const meta = parseStoredUrlMeta(slide.urlMeta)
        slides.push({
          id: slide.id || `slide-${idx + 1}`,
          src: urlStr,
          thumbSrc: urlStr,
          width: meta?.width ?? 1200,
          height: meta?.height ?? 675,
          alt: slide.alt?.trim() || slide.caption?.trim() || `${fallbackAlt} (${idx + 1})`,
          caption: slide.caption?.trim() || null,
          ...(meta?.blurDataURL ? { blurDataURL: meta.blurDataURL } : {}),
        })
      } else {
        const heroSrc =
          resolveMediaSizeUrl(slide.media, 'hero') ?? (slide.imageUrl?.trim() || null)
        if (!heroSrc) continue
        const thumbSrc = resolveMediaSizeUrl(slide.media, 'thumbnail') ?? heroSrc
        const mediaObj = slide.media && typeof slide.media === 'object' ? slide.media : null
        const blur = resolveMediaBlurDataURL(slide.media)
        const objectPosition = resolveMediaObjectPosition(slide.media)
        slides.push({
          id: slide.id || `slide-${idx + 1}`,
          src: heroSrc,
          thumbSrc,
          width: mediaObj?.width ?? 1200,
          height: mediaObj?.height ?? 675,
          alt:
            slide.alt?.trim() ||
            mediaObj?.alt?.trim() ||
            slide.caption?.trim() ||
            `${fallbackAlt} (${idx + 1})`,
          caption: slide.caption?.trim() || null,
          ...(blur ? { blurDataURL: blur } : {}),
          ...(objectPosition ? { objectPosition } : {}),
        })
      }
    }

    if (slides.length === 0) {
      return {
        mediaMode: 'none',
        cardUrl: '',
        heroUrl: null,
        blurDataURL: null,
        coverAlt: fallbackAlt,
        galleryLayout,
        gallery: [],
      }
    }

    const lead = slides[0]!
    return {
      mediaMode: 'gallery',
      cardUrl:
        resolveMediaSizeUrl((doc.gallery?.[0] ?? undefined)?.media, 'card') ?? lead.src,
      heroUrl: lead.src,
      blurDataURL: lead.blurDataURL ?? null,
      coverAlt: lead.alt,
      ...(lead.objectPosition ? { coverObjectPosition: lead.objectPosition } : {}),
      galleryLayout,
      gallery: slides,
    }
  }

  // Default / 'single' mode (handles both explicit `mediaSource` and legacy pre-migration rows)
  const inferredSingleSource =
    doc.mediaSource ?? (doc.imageUrl && !doc.image ? 'url' : 'upload')

  if (inferredSingleSource === 'url') {
    const rawUrl = doc.imageUrl?.trim() || ''
    if (!rawUrl) {
      return {
        mediaMode: 'none',
        cardUrl: '',
        heroUrl: null,
        blurDataURL: null,
        coverAlt: fallbackAlt,
        galleryLayout: 'carousel',
        gallery: [],
      }
    }
    const meta = parseStoredUrlMeta(doc.imageUrlMeta)
    return {
      mediaMode: 'single',
      cardUrl: rawUrl,
      heroUrl: rawUrl,
      blurDataURL: meta?.blurDataURL ?? null,
      coverAlt: doc.imageAlt?.trim() || fallbackAlt,
      galleryLayout: 'carousel',
      gallery: [],
    }
  }

  const uploadCard = resolveMediaSizeUrl(doc.image, 'card')
  const uploadHero = resolveMediaSizeUrl(doc.image, 'hero')
  const legacyUrl = doc.imageUrl?.trim() || ''
  const cardUrl = uploadCard ?? legacyUrl
  const heroUrl = uploadHero ?? (legacyUrl || null)

  if (!heroUrl) {
    return {
      mediaMode: 'none',
      cardUrl: '',
      heroUrl: null,
      blurDataURL: null,
      coverAlt: fallbackAlt,
      galleryLayout: 'carousel',
      gallery: [],
    }
  }

  const uploadBlur =
    resolveMediaBlurDataURL(doc.image) ??
    parseStoredUrlMeta(doc.imageUrlMeta)?.blurDataURL ??
    null
  const mediaAlt =
    doc.image && typeof doc.image === 'object' && doc.image.alt?.trim()
      ? doc.image.alt.trim()
      : null
  const coverObjectPosition = resolveMediaObjectPosition(doc.image)

  return {
    mediaMode: 'single',
    cardUrl,
    heroUrl,
    blurDataURL: uploadBlur,
    coverAlt: doc.imageAlt?.trim() || mediaAlt || fallbackAlt,
    ...(coverObjectPosition ? { coverObjectPosition } : {}),
    galleryLayout: 'carousel',
    gallery: [],
  }
}

/**
 * Resolves a `Project` case-study's lead media mode (`none` | `single` | `gallery`) across both
 * direct `Media` uploads and pre-uploaded `src` / `imageUrl` paths on `/projects/[slug]`.
 */
export const resolveProjectLeadMedia = (doc: Partial<Project>): ResolvedArticleLeadMedia => {
  const fallbackAlt = doc.title?.trim() || 'Project illustration'
  const rawMode = doc.mediaMode

  if (rawMode === 'none') {
    return {
      mediaMode: 'none',
      cardUrl: '',
      heroUrl: null,
      blurDataURL: null,
      coverAlt: fallbackAlt,
      galleryLayout: 'carousel',
      gallery: [],
    }
  }

  if (rawMode === 'gallery') {
    const galleryLayout: ArticleGalleryLayout =
      doc.galleryLayout === 'grid' ? 'grid' : 'carousel'
    const slides: ArticleGallerySlide[] = []

    for (const [idx, slide] of (doc.gallery ?? []).entries()) {
      if (!slide) continue
      const inferredSource =
        slide.source ?? (slide.imageUrl && !slide.media ? 'url' : 'upload')

      if (inferredSource === 'url') {
        const urlStr = slide.imageUrl?.trim() || ''
        if (!urlStr) continue
        const meta = parseStoredUrlMeta(slide.urlMeta)
        slides.push({
          id: slide.id || `slide-${idx + 1}`,
          src: urlStr,
          thumbSrc: urlStr,
          width: meta?.width ?? 1200,
          height: meta?.height ?? 675,
          alt: slide.alt?.trim() || slide.caption?.trim() || `${fallbackAlt} (${idx + 1})`,
          caption: slide.caption?.trim() || null,
          ...(meta?.blurDataURL ? { blurDataURL: meta.blurDataURL } : {}),
        })
      } else {
        const heroSrc =
          resolveMediaSizeUrl(slide.media, 'hero') ?? (slide.imageUrl?.trim() || null)
        if (!heroSrc) continue
        const thumbSrc = resolveMediaSizeUrl(slide.media, 'thumbnail') ?? heroSrc
        const mediaObj = slide.media && typeof slide.media === 'object' ? slide.media : null
        const blur = resolveMediaBlurDataURL(slide.media)
        const objectPosition = resolveMediaObjectPosition(slide.media)
        slides.push({
          id: slide.id || `slide-${idx + 1}`,
          src: heroSrc,
          thumbSrc,
          width: mediaObj?.width ?? 1200,
          height: mediaObj?.height ?? 675,
          alt:
            slide.alt?.trim() ||
            mediaObj?.alt?.trim() ||
            slide.caption?.trim() ||
            `${fallbackAlt} (${idx + 1})`,
          caption: slide.caption?.trim() || null,
          ...(blur ? { blurDataURL: blur } : {}),
          ...(objectPosition ? { objectPosition } : {}),
        })
      }
    }

    if (slides.length === 0) {
      return {
        mediaMode: 'none',
        cardUrl: '',
        heroUrl: null,
        blurDataURL: null,
        coverAlt: fallbackAlt,
        galleryLayout,
        gallery: [],
      }
    }

    const lead = slides[0]!
    return {
      mediaMode: 'gallery',
      cardUrl:
        resolveMediaSizeUrl((doc.gallery?.[0] ?? undefined)?.media, 'card') ?? lead.src,
      heroUrl: lead.src,
      blurDataURL: lead.blurDataURL ?? null,
      coverAlt: lead.alt,
      ...(lead.objectPosition ? { coverObjectPosition: lead.objectPosition } : {}),
      galleryLayout,
      gallery: slides,
    }
  }

  const inferredSingleSource =
    doc.mediaSource ?? (doc.src && !doc.image ? 'url' : 'upload')

  if (inferredSingleSource === 'url') {
    const rawUrl = doc.src?.trim() || ''
    if (!rawUrl) {
      return {
        mediaMode: 'none',
        cardUrl: '',
        heroUrl: null,
        blurDataURL: null,
        coverAlt: fallbackAlt,
        galleryLayout: 'carousel',
        gallery: [],
      }
    }
    const meta = parseStoredUrlMeta(doc.srcMeta)
    return {
      mediaMode: 'single',
      cardUrl: rawUrl,
      heroUrl: rawUrl,
      blurDataURL: meta?.blurDataURL ?? null,
      coverAlt: doc.imageAlt?.trim() || fallbackAlt,
      galleryLayout: 'carousel',
      gallery: [],
    }
  }

  const uploadCard = resolveMediaSizeUrl(doc.image, 'card')
  const uploadHero = resolveMediaSizeUrl(doc.image, 'hero')
  const legacyUrl = doc.src?.trim() || ''
  const cardUrl = uploadCard ?? legacyUrl
  const heroUrl = uploadHero ?? (legacyUrl || null)

  if (!heroUrl) {
    return {
      mediaMode: 'none',
      cardUrl: '',
      heroUrl: null,
      blurDataURL: null,
      coverAlt: fallbackAlt,
      galleryLayout: 'carousel',
      gallery: [],
    }
  }

  const uploadBlur =
    resolveMediaBlurDataURL(doc.image) ??
    parseStoredUrlMeta(doc.srcMeta)?.blurDataURL ??
    null
  const mediaAlt =
    doc.image && typeof doc.image === 'object' && doc.image.alt?.trim()
      ? doc.image.alt.trim()
      : null
  const coverObjectPosition = resolveMediaObjectPosition(doc.image)

  return {
    mediaMode: 'single',
    cardUrl,
    heroUrl,
    blurDataURL: uploadBlur,
    coverAlt: doc.imageAlt?.trim() || mediaAlt || fallbackAlt,
    ...(coverObjectPosition ? { coverObjectPosition } : {}),
    galleryLayout: 'carousel',
    gallery: [],
  }
}

/** Extracts clean per-document SEO overrides from `@payloadcms/plugin-seo`'s `meta` group. */
export const mapSeoOverride = (
  meta?: {
    title?: string | null
    description?: string | null
    image?: (number | null) | Media
    canonicalUrl?: string | null
    keywords?: string | null
    ogTitle?: string | null
    ogDescription?: string | null
    twitterCard?: string | null
    noIndex?: boolean | null
    noFollow?: boolean | null
  } | null,
): SeoOverride => {
  const keywords = (meta?.keywords ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const rawCard = meta?.twitterCard
  const twitterCard: TwitterCardType | null =
    rawCard === 'summary_large_image' || rawCard === 'summary' ? rawCard : null

  return {
    title: meta?.title?.trim() || null,
    description: meta?.description?.trim() || null,
    imageUrl: resolveMediaSizeUrl(meta?.image, 'og'),
    imageAlt:
      meta?.image && typeof meta.image === 'object' && meta.image.alt?.trim()
        ? meta.image.alt.trim()
        : null,
    canonicalUrl: meta?.canonicalUrl?.trim() || null,
    keywords,
    ogTitle: meta?.ogTitle?.trim() || null,
    ogDescription: meta?.ogDescription?.trim() || null,
    twitterCard,
    noIndex: Boolean(meta?.noIndex),
    noFollow: Boolean(meta?.noFollow),
  }
}

const idToString = (id: number | string): string => String(id)

const withFallback = (value: string | null | undefined, fallback: string): string =>
  value && value.trim().length > 0 ? value : fallback

/**
 * Maps an optional CTA pair (`ctaLabel`, `ctaUrl`):
 * - When `doc` has never been saved (`group === undefined`), falls back to `defaultCta`.
 * - When an editor explicitly clears either label or URL (`''` or `null`), returns `null` so the CTA hides.
 */
const mapOptionalCta = (
  group: { ctaLabel?: string | null; ctaUrl?: string | null } | undefined,
  defaultCta: SectionCta | null,
): SectionCta | null => {
  if (!group) return defaultCta
  const label =
    group.ctaLabel === undefined ? (defaultCta?.label ?? '') : (group.ctaLabel ?? '').trim()
  const url = group.ctaUrl === undefined ? (defaultCta?.url ?? '') : (group.ctaUrl ?? '').trim()
  return label.length > 0 && url.length > 0 ? { label, url } : null
}

export const mapNavigation = (doc: Partial<Navigation> | null | undefined): NavigationContent => {
  if (!doc) return DEFAULT_NAVIGATION

  const brandText = withFallback(doc.brand?.text, DEFAULT_NAVIGATION.brand.text)
  const brandHref = withFallback(doc.brand?.href, DEFAULT_NAVIGATION.brand.href)
  const skipToContentLabel = withFallback(
    doc.skipToContentLabel,
    DEFAULT_NAVIGATION.skipToContentLabel,
  )

  if (!Array.isArray(doc.items)) {
    return {
      brand: { text: brandText, href: brandHref },
      skipToContentLabel,
      items: DEFAULT_NAVIGATION.items,
    }
  }

  const items: NavigationItem[] = doc.items
    .filter((item) => item.enabled !== false && Boolean(item.label?.trim()) && Boolean(item.href?.trim()))
    .map((item, index) => ({
      id: item.id ? String(item.id) : `nav-${index}`,
      label: item.label,
      href: item.href,
      position: item.position === 'right' ? 'right' : 'left',
      openInNewTab: Boolean(item.openInNewTab),
    }))

  return {
    brand: { text: brandText, href: brandHref },
    skipToContentLabel,
    items,
  }
}

const normalizeTwitterHandle = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

const mapUploadedOgImage = (
  media: number | Media | null | undefined,
  fallbackAlt: string,
): OgImageContent | null => {
  if (!media || typeof media !== 'object' || !media.url) return null
  const ogVariant = (media as { sizes?: { og?: MediaVariantShape } }).sizes?.og
  const mime = ogVariant?.mimeType || media.mimeType
  return {
    url: (ogVariant?.url || media.url) as string,
    width: ogVariant?.width ?? media.width ?? 1200,
    height: ogVariant?.height ?? media.height ?? 630,
    alt: withFallback(media.alt, fallbackAlt),
    ...(mime ? { mimeType: mime } : {}),
  }
}

const mapHubPageSeo = (
  group:
    | {
        metaTitle?: string | null
        metaDescription?: string | null
        keywords?: string | null
        ogImage?: (number | null) | Media
        noIndex?: boolean | null
      }
    | null
    | undefined,
  fallbackAlt: string,
): HubPageSeoContent => {
  if (!group) return { ...DEFAULT_HUB_PAGE_SEO }
  return {
    metaTitle: group.metaTitle?.trim() || null,
    metaDescription: group.metaDescription?.trim() || null,
    keywords: group.keywords?.trim() || null,
    ogImage: mapUploadedOgImage(group.ogImage, fallbackAlt),
    noIndex: Boolean(group.noIndex),
  }
}

export const mapSiteSettings = (
  doc: Partial<SiteSetting> | null | undefined,
): SiteSettingsContent => {
  if (!doc) return DEFAULT_SITE_SETTINGS

  const ownerName = withFallback(doc.ownerName, DEFAULT_SITE_SETTINGS.ownerName)
  const siteName = withFallback(doc.siteName, DEFAULT_SITE_SETTINGS.siteName)
  const metaDescription = withFallback(doc.metaDescription, DEFAULT_SITE_SETTINGS.metaDescription)
  const ogDescription = withFallback(doc.ogDescription, metaDescription)

  const uploadedOgMedia =
    doc.ogImage && typeof doc.ogImage === 'object' && doc.ogImage.url ? doc.ogImage : null
  const ogVariant = (
    uploadedOgMedia as { sizes?: { og?: MediaVariantShape } } | null
  )?.sizes?.og
  const fallbackOgUrl = withFallback(doc.ogImageUrl, DEFAULT_SITE_SETTINGS.ogImage.url)
  const ogImage: OgImageContent = uploadedOgMedia
    ? {
        url: (ogVariant?.url || uploadedOgMedia.url) as string,
        width: ogVariant?.width ?? uploadedOgMedia.width ?? DEFAULT_PROFILE_IMAGE_WIDTH,
        height: ogVariant?.height ?? uploadedOgMedia.height ?? DEFAULT_PROFILE_IMAGE_HEIGHT,
        alt: withFallback(uploadedOgMedia.alt, ownerName),
        ...((ogVariant?.mimeType || uploadedOgMedia.mimeType)
          ? { mimeType: (ogVariant?.mimeType || uploadedOgMedia.mimeType) as string }
          : {}),
      }
    : {
        url: fallbackOgUrl,
        width: DEFAULT_PROFILE_IMAGE_WIDTH,
        height: DEFAULT_PROFILE_IMAGE_HEIGHT,
        alt: ownerName,
        ...(fallbackOgUrl.endsWith('.webp') ? { mimeType: 'image/webp' } : {}),
      }

  const worksForName = doc.worksFor?.name?.trim() || null
  const worksFor: PersonOrganizationContent | null = worksForName
    ? {
        name: worksForName,
        url: doc.worksFor?.url?.trim() || null,
      }
    : null

  const alumniOf: PersonOrganizationContent[] = (doc.alumniOf ?? [])
    .map((entry): PersonOrganizationContent | null => {
      const name = entry?.name?.trim()
      if (!name) return null
      return {
        name,
        url: entry?.url?.trim() || null,
      }
    })
    .filter((entry): entry is PersonOrganizationContent => entry !== null)

  return {
    siteName,
    ownerName,
    locale: withFallback(doc.locale, DEFAULT_SITE_SETTINGS.locale),
    themeColor: withFallback(doc.themeColor, DEFAULT_SITE_SETTINGS.themeColor),
    siteTitle: withFallback(doc.siteTitle, DEFAULT_SITE_SETTINGS.siteTitle),
    metaDescription,
    keywords:
      doc.keywords === undefined
        ? DEFAULT_SITE_SETTINGS.keywords
        : (doc.keywords ?? '').trim(),
    ogTitle: doc.ogTitle?.trim() || null,
    ogDescription:
      doc.ogDescription === undefined
        ? DEFAULT_SITE_SETTINGS.ogDescription
        : ogDescription,
    ogImage,
    allowIndexing: doc.allowIndexing ?? DEFAULT_SITE_SETTINGS.allowIndexing,
    twitterSite: normalizeTwitterHandle(doc.twitterSite),
    twitterCreator: normalizeTwitterHandle(doc.twitterCreator),
    verification: {
      google: doc.verification?.googleSiteVerification?.trim() || null,
      bing: doc.verification?.bingVerification?.trim() || null,
      yandex: doc.verification?.yandexVerification?.trim() || null,
    },
    articlesHubSeo: mapHubPageSeo(doc.articlesHubSeo, `${siteName} Articles`),
    projectsHubSeo: mapHubPageSeo(doc.projectsHubSeo, `${siteName} Projects`),
    jobTitle: withFallback(doc.jobTitle, DEFAULT_SITE_SETTINGS.jobTitle),
    knowsAbout: (doc.knowsAbout ?? []).map((item) => item.trim()).filter(Boolean),
    worksFor,
    alumniOf,
    address: {
      streetAddress: withFallback(
        doc.address?.streetAddress,
        DEFAULT_SITE_SETTINGS.address.streetAddress,
      ),
      addressLocality: withFallback(
        doc.address?.addressLocality,
        DEFAULT_SITE_SETTINGS.address.addressLocality,
      ),
      addressRegion: withFallback(
        doc.address?.addressRegion,
        DEFAULT_SITE_SETTINGS.address.addressRegion,
      ),
      postalCode: withFallback(doc.address?.postalCode, DEFAULT_SITE_SETTINGS.address.postalCode),
    },
    hero: {
      greeting: withFallback(doc.hero?.greeting, DEFAULT_SITE_SETTINGS.hero.greeting),
      requestCvLabel: withFallback(
        doc.hero?.requestCvLabel,
        DEFAULT_SITE_SETTINGS.hero.requestCvLabel,
      ),
    },
    servicesSection: {
      heading: withFallback(
        doc.servicesSection?.heading,
        DEFAULT_SITE_SETTINGS.servicesSection.heading,
      ),
    },
    skillsSection: {
      heading: withFallback(doc.skillsSection?.heading, DEFAULT_SITE_SETTINGS.skillsSection.heading),
      intro: withFallback(doc.skillsSection?.intro, DEFAULT_SITE_SETTINGS.skillsSection.intro),
      skillsSubheading: withFallback(
        doc.skillsSection?.skillsSubheading,
        DEFAULT_SITE_SETTINGS.skillsSection.skillsSubheading,
      ),
      experienceTabLabel: withFallback(
        doc.skillsSection?.experienceTabLabel,
        DEFAULT_SITE_SETTINGS.skillsSection.experienceTabLabel,
      ),
      educationTabLabel: withFallback(
        doc.skillsSection?.educationTabLabel,
        DEFAULT_SITE_SETTINGS.skillsSection.educationTabLabel,
      ),
    },
    certificatesSection: {
      heading: withFallback(
        doc.certificatesSection?.heading,
        DEFAULT_SITE_SETTINGS.certificatesSection.heading,
      ),
      cta: mapOptionalCta(doc.certificatesSection, DEFAULT_SITE_SETTINGS.certificatesSection.cta),
      viewCertificateLabel: withFallback(
        doc.certificatesSection?.viewCertificateLabel,
        DEFAULT_SITE_SETTINGS.certificatesSection.viewCertificateLabel,
      ),
    },
    projectsSection: {
      heading: withFallback(
        doc.projectsSection?.heading,
        DEFAULT_SITE_SETTINGS.projectsSection.heading,
      ),
      allFilterLabel: withFallback(
        doc.projectsSection?.allFilterLabel,
        DEFAULT_SITE_SETTINGS.projectsSection.allFilterLabel,
      ),
      archiveDescription: withFallback(
        doc.projectsSection?.archiveDescription,
        DEFAULT_SITE_SETTINGS.projectsSection.archiveDescription,
      ),
      searchPlaceholder: withFallback(
        doc.projectsSection?.searchPlaceholder,
        DEFAULT_SITE_SETTINGS.projectsSection.searchPlaceholder,
      ),
      caseStudyLabel: withFallback(
        doc.projectsSection?.caseStudyLabel,
        DEFAULT_SITE_SETTINGS.projectsSection.caseStudyLabel,
      ),
      backToProjectsLabel: withFallback(
        doc.projectsSection?.backToProjectsLabel,
        DEFAULT_SITE_SETTINGS.projectsSection.backToProjectsLabel,
      ),
      liveProjectLabel: withFallback(
        doc.projectsSection?.liveProjectLabel,
        DEFAULT_SITE_SETTINGS.projectsSection.liveProjectLabel,
      ),
      notFoundTitle: withFallback(
        doc.projectsSection?.notFoundTitle,
        DEFAULT_SITE_SETTINGS.projectsSection.notFoundTitle,
      ),
      notFoundDescription: withFallback(
        doc.projectsSection?.notFoundDescription,
        DEFAULT_SITE_SETTINGS.projectsSection.notFoundDescription,
      ),
    },
    articlesSection: {
      heading: withFallback(
        doc.articlesSection?.heading,
        DEFAULT_SITE_SETTINGS.articlesSection.heading,
      ),
      cta: mapOptionalCta(doc.articlesSection, DEFAULT_SITE_SETTINGS.articlesSection.cta),
      readOnSiteLabel: withFallback(
        doc.articlesSection?.readOnSiteLabel,
        DEFAULT_SITE_SETTINGS.articlesSection.readOnSiteLabel,
      ),
      featuredBadgeLabel: withFallback(
        doc.articlesSection?.featuredBadgeLabel,
        DEFAULT_SITE_SETTINGS.articlesSection.featuredBadgeLabel,
      ),
      archiveDescription: withFallback(
        doc.articlesSection?.archiveDescription,
        DEFAULT_SITE_SETTINGS.articlesSection.archiveDescription,
      ),
      searchPlaceholder: withFallback(
        doc.articlesSection?.searchPlaceholder,
        DEFAULT_SITE_SETTINGS.articlesSection.searchPlaceholder,
      ),
      backToArticlesLabel: withFallback(
        doc.articlesSection?.backToArticlesLabel,
        DEFAULT_SITE_SETTINGS.articlesSection.backToArticlesLabel,
      ),
      externalPublicationLabel: withFallback(
        doc.articlesSection?.externalPublicationLabel,
        DEFAULT_SITE_SETTINGS.articlesSection.externalPublicationLabel,
      ),
      notFoundTitle: withFallback(
        doc.articlesSection?.notFoundTitle,
        DEFAULT_SITE_SETTINGS.articlesSection.notFoundTitle,
      ),
      notFoundDescription: withFallback(
        doc.articlesSection?.notFoundDescription,
        DEFAULT_SITE_SETTINGS.articlesSection.notFoundDescription,
      ),
    },
    footerLabels: {
      socialPrompt: withFallback(
        doc.footerLabels?.socialPrompt,
        DEFAULT_SITE_SETTINGS.footerLabels.socialPrompt,
      ),
      profilesHeading: withFallback(
        doc.footerLabels?.profilesHeading,
        DEFAULT_SITE_SETTINGS.footerLabels.profilesHeading,
      ),
      contactHeading: withFallback(
        doc.footerLabels?.contactHeading,
        DEFAULT_SITE_SETTINGS.footerLabels.contactHeading,
      ),
    },
  }
}

export const DEFAULT_HEADER_STUDIO: HeaderStudioConfig = {
  articlesArchive: {
    eyebrow: 'Engineering Journal & Notes',
    headingOverride: null,
    subtitleOverride: null,
    backgroundPreset: 'aurora-grain',
    accentTone: 'gold-copper',
    defaultLayout: 'magazine',
    showSearch: true,
    showFilters: true,
    showStatsBar: true,
    showRssLink: true,
  },
  projectsArchive: {
    eyebrow: 'Selected Architecture & Builds',
    headingOverride: null,
    subtitleOverride: null,
    backgroundPreset: 'blueprint-spotlight',
    accentTone: 'amber-slate',
    defaultLayout: 'showcase',
    showSearch: true,
    showCategoryFilters: true,
    showTechFilters: true,
    showStatsBar: true,
  },
  articleDetail: {
    eyebrow: 'Engineering Article',
    backgroundPreset: 'chromatic-cover',
    accentTone: 'gold-copper',
    showBreadcrumbs: true,
    showShareActions: true,
    showSectionJumpDock: true,
    showStickyToc: true,
    showRelatedArticles: true,
  },
  projectDetail: {
    eyebrow: 'Engineering Case Study',
    backgroundPreset: 'chromatic-cover',
    accentTone: 'amber-slate',
    showBreadcrumbs: true,
    showSpecDock: true,
    showTechLinks: true,
    showStickySidebar: true,
    showRelatedProjects: true,
  },
}

const VALID_BG_PRESETS: ReadonlySet<HeaderBackgroundPreset> = new Set([
  'aurora-grain',
  'blueprint-spotlight',
  'chromatic-cover',
  'constellation-canvas',
  'obsidian-minimal',
])

const VALID_ACCENT_TONES: ReadonlySet<HeaderAccentTone> = new Set([
  'gold-copper',
  'amber-slate',
  'cyan-gold',
])

const VALID_ARTICLES_LAYOUTS: ReadonlySet<ArticlesArchiveLayoutMode> = new Set([
  'magazine',
  'list',
  'grid',
])

const VALID_PROJECTS_LAYOUTS: ReadonlySet<ProjectsArchiveLayoutMode> = new Set([
  'showcase',
  'list',
  'grid',
])

const resolveBgPreset = (
  value: string | null | undefined,
  fallback: HeaderBackgroundPreset,
): HeaderBackgroundPreset =>
  value && VALID_BG_PRESETS.has(value as HeaderBackgroundPreset)
    ? (value as HeaderBackgroundPreset)
    : fallback

const resolveAccentTone = (
  value: string | null | undefined,
  fallback: HeaderAccentTone,
): HeaderAccentTone =>
  value && VALID_ACCENT_TONES.has(value as HeaderAccentTone)
    ? (value as HeaderAccentTone)
    : fallback

const nullableTrimmed = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export const mapHeaderStudio = (doc?: Partial<Header> | null): HeaderStudioConfig => {
  const articles = doc?.articlesHeader
  const projects = doc?.projectsHeader
  const articleDetail = doc?.articleDetailHeader
  const projectDetail = doc?.projectDetailHeader

  return {
    articlesArchive: {
      eyebrow: withFallback(articles?.eyebrow, DEFAULT_HEADER_STUDIO.articlesArchive.eyebrow),
      headingOverride: nullableTrimmed(articles?.headingOverride),
      subtitleOverride: nullableTrimmed(articles?.subtitleOverride),
      backgroundPreset: resolveBgPreset(
        articles?.backgroundPreset,
        DEFAULT_HEADER_STUDIO.articlesArchive.backgroundPreset,
      ),
      accentTone: resolveAccentTone(
        articles?.accentTone,
        DEFAULT_HEADER_STUDIO.articlesArchive.accentTone,
      ),
      defaultLayout:
        articles?.defaultLayout &&
        VALID_ARTICLES_LAYOUTS.has(articles.defaultLayout as ArticlesArchiveLayoutMode)
          ? (articles.defaultLayout as ArticlesArchiveLayoutMode)
          : DEFAULT_HEADER_STUDIO.articlesArchive.defaultLayout,
      showSearch: articles?.showSearch ?? DEFAULT_HEADER_STUDIO.articlesArchive.showSearch,
      showFilters: articles?.showFilters ?? DEFAULT_HEADER_STUDIO.articlesArchive.showFilters,
      showStatsBar: articles?.showStatsBar ?? DEFAULT_HEADER_STUDIO.articlesArchive.showStatsBar,
      showRssLink: articles?.showRssLink ?? DEFAULT_HEADER_STUDIO.articlesArchive.showRssLink,
    },
    projectsArchive: {
      eyebrow: withFallback(projects?.eyebrow, DEFAULT_HEADER_STUDIO.projectsArchive.eyebrow),
      headingOverride: nullableTrimmed(projects?.headingOverride),
      subtitleOverride: nullableTrimmed(projects?.subtitleOverride),
      backgroundPreset: resolveBgPreset(
        projects?.backgroundPreset,
        DEFAULT_HEADER_STUDIO.projectsArchive.backgroundPreset,
      ),
      accentTone: resolveAccentTone(
        projects?.accentTone,
        DEFAULT_HEADER_STUDIO.projectsArchive.accentTone,
      ),
      defaultLayout:
        projects?.defaultLayout &&
        VALID_PROJECTS_LAYOUTS.has(projects.defaultLayout as ProjectsArchiveLayoutMode)
          ? (projects.defaultLayout as ProjectsArchiveLayoutMode)
          : DEFAULT_HEADER_STUDIO.projectsArchive.defaultLayout,
      showSearch: projects?.showSearch ?? DEFAULT_HEADER_STUDIO.projectsArchive.showSearch,
      showCategoryFilters:
        projects?.showCategoryFilters ?? DEFAULT_HEADER_STUDIO.projectsArchive.showCategoryFilters,
      showTechFilters:
        projects?.showTechFilters ?? DEFAULT_HEADER_STUDIO.projectsArchive.showTechFilters,
      showStatsBar: projects?.showStatsBar ?? DEFAULT_HEADER_STUDIO.projectsArchive.showStatsBar,
    },
    articleDetail: {
      eyebrow: withFallback(
        articleDetail?.eyebrow,
        DEFAULT_HEADER_STUDIO.articleDetail.eyebrow,
      ),
      backgroundPreset: resolveBgPreset(
        articleDetail?.backgroundPreset,
        DEFAULT_HEADER_STUDIO.articleDetail.backgroundPreset,
      ),
      accentTone: resolveAccentTone(
        articleDetail?.accentTone,
        DEFAULT_HEADER_STUDIO.articleDetail.accentTone,
      ),
      showBreadcrumbs:
        articleDetail?.showBreadcrumbs ?? DEFAULT_HEADER_STUDIO.articleDetail.showBreadcrumbs,
      showShareActions:
        articleDetail?.showShareActions ?? DEFAULT_HEADER_STUDIO.articleDetail.showShareActions,
      showSectionJumpDock:
        articleDetail?.showSectionJumpDock ??
        DEFAULT_HEADER_STUDIO.articleDetail.showSectionJumpDock,
      showStickyToc:
        articleDetail?.showStickyToc ?? DEFAULT_HEADER_STUDIO.articleDetail.showStickyToc,
      showRelatedArticles:
        articleDetail?.showRelatedArticles ??
        DEFAULT_HEADER_STUDIO.articleDetail.showRelatedArticles,
    },
    projectDetail: {
      eyebrow: withFallback(
        projectDetail?.eyebrow,
        DEFAULT_HEADER_STUDIO.projectDetail.eyebrow,
      ),
      backgroundPreset: resolveBgPreset(
        projectDetail?.backgroundPreset,
        DEFAULT_HEADER_STUDIO.projectDetail.backgroundPreset,
      ),
      accentTone: resolveAccentTone(
        projectDetail?.accentTone,
        DEFAULT_HEADER_STUDIO.projectDetail.accentTone,
      ),
      showBreadcrumbs:
        projectDetail?.showBreadcrumbs ?? DEFAULT_HEADER_STUDIO.projectDetail.showBreadcrumbs,
      showSpecDock:
        projectDetail?.showSpecDock ?? DEFAULT_HEADER_STUDIO.projectDetail.showSpecDock,
      showTechLinks:
        projectDetail?.showTechLinks ?? DEFAULT_HEADER_STUDIO.projectDetail.showTechLinks,
      showStickySidebar:
        projectDetail?.showStickySidebar ?? DEFAULT_HEADER_STUDIO.projectDetail.showStickySidebar,
      showRelatedProjects:
        projectDetail?.showRelatedProjects ??
        DEFAULT_HEADER_STUDIO.projectDetail.showRelatedProjects,
    },
  }
}

export const mapHeader = (doc: Partial<Header> | null | undefined): HeaderContent | null => {
  if (!doc || !doc.sureName?.trim()) return null
  return {
    id: doc.id !== undefined ? idToString(doc.id) : 'header',
    sureName: doc.sureName,
    imageUrl: resolveMediaUrl(doc.profileImage) ?? withFallback(doc.imageUrl, ''),
    requestCV: withFallback(doc.requestCV, '#'),
    professionTexts: doc.professionTexts ?? [],
    studio: mapHeaderStudio(doc),
  }
}

export const mapAbout = (doc: About | null): AboutContent | null => {
  if (!doc) return null

  const uploaded = (doc.uploadImages ?? [])
    .map((media) => resolveMediaUrl(media))
    .filter((url): url is string => url !== null)
  const legacy = (doc.images ?? []).map((row) => row.imageUrl).filter((url) => url.length > 0)

  return {
    experience: {
      years: doc.experience.years,
      title: doc.experience.title,
      description: doc.experience.description,
    },
    workPermit: {
      title: doc.workPermit.title,
      description: doc.workPermit.description,
    },
    images: uploaded.length > 0 ? uploaded : legacy,
    interests: {
      title: doc.interests.title,
      description: doc.interests.description,
      areas: doc.interests.areas ?? [],
    },
  }
}

const toSkillBar = (skill: Skill): SkillBar => ({
  id: idToString(skill.id),
  label: skill.label,
  value: skill.value,
  color: skill.color,
})

export const mapSkills = (docs: Skill[]): SkillsContent => ({
  frontend: docs.filter((skill) => skill.group === 'frontend').map(toSkillBar),
  backend: docs.filter((skill) => skill.group === 'backend').map(toSkillBar),
})

export const mapExperiences = (docs: Experience[]): ExperienceItem[] =>
  docs.map((doc) => ({
    id: idToString(doc.id),
    title: doc.title,
    date: doc.date,
    company: doc.company,
  }))

export const mapEducations = (docs: Education[]): EducationItem[] =>
  docs.map((doc) => ({
    id: idToString(doc.id),
    title: doc.title,
    date: doc.date,
    location: joinDisplay([doc.institution, doc.location]),
  }))

export const mapCertificates = (docs: Certificate[]): CertificateItem[] =>
  docs.map((doc) => ({
    id: idToString(doc.id),
    title: doc.title,
    issuer: doc.issuer,
    date: formatDisplayDate(doc.issuedAt),
    imageUrl: resolveMediaUrl(doc.image) ?? withFallback(doc.imageUrl, ''),
    link: doc.link && doc.link.length > 0 ? doc.link : null,
  }))

/**
 * Maps articles to their card/archive view models.
 * `readTime` prefers auto-calculated minutes from `content` / `description`, falling back to `doc.readTime`.
 */
export const mapArticles = (docs: Article[]): ArticleItem[] =>
  docs.map((doc) => {
    const minutes =
      doc.readTime ??
      calculateReadTimeMinutes({
        content: doc.content,
        description: doc.description,
        fallbackReadTime: doc.readTime,
      })
    const leadMedia = resolveArticleLeadMedia(doc)

    return {
      id: idToString(doc.id),
      title: doc.title,
      excerpt: doc.excerpt,
      author: formatDisplayDate(doc.publishedAt),
      readTime: formatReadTime(minutes),
      imageUrl: leadMedia.cardUrl,
      ...(leadMedia.blurDataURL ? { blurDataURL: leadMedia.blurDataURL } : {}),
      mediaMode: leadMedia.mediaMode,
      ...(leadMedia.mediaMode === 'gallery' ? { galleryCount: leadMedia.gallery.length } : {}),
      link: doc.link ?? '',
      pagePath: doc.slug && hasArticlePage(doc) ? articlePagePath(doc.slug) : null,
      featured: Boolean(doc.featured),
      category: doc.category ?? null,
    }
  })

export const mapServices = (docs: Service[], hiringCta: HiringCta | null): ServicesContent => ({
  items: docs.map((doc): ServiceItem => ({
    id: idToString(doc.id),
    category: doc.category,
    iconFont: withFallback(doc.iconFont, ''),
    descriptions: doc.descriptions ?? [],
  })),
  hiring: hiringCta,
})

export const mapProjects = (
  docs: Project[],
  projectsLabels: SiteSettingsContent['projectsSection'] = DEFAULT_SITE_SETTINGS.projectsSection,
): ProjectsContent => ({
  heading: projectsLabels.heading,
  caseStudyLabel: projectsLabels.caseStudyLabel,
  filters: buildProjectFilters(projectsLabels.allFilterLabel),
  items: docs.map((doc): ProjectItem => {
    const leadMedia = resolveProjectLeadMedia(doc)
    const thumbUploadUrl = resolveMediaSizeUrl(doc.image, 'thumbnail')
    const fullUploadUrl = resolveMediaSizeUrl(doc.image, 'hero')
    const blurDataURL =
      resolveMediaBlurDataURL(doc.image) ?? leadMedia.blurDataURL ?? null
    const caseStudyPath = doc.slug && hasProjectPage(doc) ? projectPagePath(doc.slug) : null
    const minutes = caseStudyPath
      ? calculateReadTimeMinutes({ content: doc.content, fallbackReadTime: doc.readTime })
      : (doc.readTime ?? null)
    return {
      id: idToString(doc.id),
      title: doc.title,
      excerpt: doc.excerpt?.trim() || null,
      categories: doc.categories ?? [],
      techStack: (doc.techStack ?? []).map((item) => item.trim()).filter(Boolean),
      role: doc.role?.trim() || null,
      year: doc.year?.trim() || null,
      readTime: minutes ? formatReadTime(minutes) : null,
      thumbnailUrl: withFallback(
        doc.placeHolder,
        thumbUploadUrl ?? leadMedia.gallery[0]?.thumbSrc ?? '',
      ),
      imageUrl: fullUploadUrl ?? withFallback(doc.src, leadMedia.heroUrl ?? ''),
      ...(blurDataURL ? { blurDataURL } : {}),
      mediaMode: leadMedia.mediaMode,
      ...(leadMedia.mediaMode === 'gallery' ? { galleryCount: leadMedia.gallery.length } : {}),
      url: withFallback(doc.url, caseStudyPath ?? '#'),
      pagePath: caseStudyPath,
    }
  }),
})

export const mapFooter = (doc: Footer | null): FooterContent | null => {
  if (!doc) return null
  return {
    socialLinks: (doc.socialLinks ?? []).map((link) => ({
      url: link.url,
      iconName: link.iconName,
      ariaLabel: link.ariaLabel,
    })),
    fullName: withFallback(doc.roles?.fullName, ''),
    roles: doc.roles?.footerRoles ?? [],
    profiles: (doc.profiles ?? []).map((profile) => ({ name: profile.name, url: profile.url })),
    contactInfo: (doc.contactInfo ?? []).map((item): ContactItem => ({
      type: item.type,
      iconName: item.iconName,
      content: item.content,
      url: item.url && item.url.length > 0 ? item.url : null,
      isLink: Boolean(item.isLink),
      className: item.className ?? 'text-white',
    })),
    copyright: {
      year: doc.copyRight?.year ?? new Date().getFullYear(),
      website: withFallback(doc.copyRight?.website, ''),
      url: doc.copyRight?.url ?? '',
    },
  }
}

export const mapHiringCta = (doc: Footer | null): HiringCta | null => {
  const label = doc?.hiringCta?.label
  const url = doc?.hiringCta?.url
  if (!label || !url) return null
  return { label, url }
}

/** Builds the full home-page view model from raw documents. Pure and deterministic. */
export const mapPortfolioContent = (raw: RawPortfolioDocs): PortfolioContent => {
  const siteSettings = mapSiteSettings(raw.siteSettings)
  const navigation = mapNavigation(raw.navigation)

  return {
    siteSettings,
    navigation,
    header: mapHeader(raw.header),
    headerStudio: mapHeaderStudio(raw.header),
    about: mapAbout(raw.about),
    skills: mapSkills(raw.skills),
    experiences: mapExperiences(raw.experiences),
    educations: mapEducations(raw.educations),
    certificates: mapCertificates(raw.certificates),
    articles: mapArticles(raw.articles),
    services: mapServices(raw.services, mapHiringCta(raw.footer)),
    projects: mapProjects(raw.projects, siteSettings.projectsSection),
    footer: mapFooter(raw.footer),
  }
}
