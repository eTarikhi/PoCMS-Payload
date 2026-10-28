/**
 * Payload data source for the portfolio site.
 *
 * This is the only module in `src/app/(frontend)/lib` that talks to Payload at runtime.
 * Every RSC query uses explicit `select` and `populate` projections so PostgreSQL only transfers
 * the exact columns consumed by each mapper.
 */

import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'

import { PUBLISHED_OR_LEGACY_WHERE } from '@/access/roles'
import type {
  About,
  AboutSelect,
  Article,
  ArticlesSelect,
  Certificate,
  CertificatesSelect,
  Education,
  EducationsSelect,
  Experience,
  ExperiencesSelect,
  Footer,
  FooterSelect,
  Header,
  HeaderSelect,
  Navigation,
  NavigationSelect,
  Project,
  ProjectsSelect,
  Redirect,
  RedirectsSelect,
  Service,
  ServicesSelect,
  SiteSetting,
  SiteSettingsSelect,
  Skill,
  SkillsSelect,
} from '@/payload-types'

import { hasArticlePage } from './article-page'
import {
  mapArticles,
  mapFooter,
  mapHeader,
  mapHeaderStudio,
  mapNavigation,
  mapPortfolioContent,
  mapProjects,
  mapSiteSettings,
  type RawPortfolioDocs,
} from './mappers'
import { hasProjectPage } from './project-page'
import type {
  ArticleItem,
  FooterContent,
  HeaderContent,
  HeaderStudioConfig,
  NavigationContent,
  PortfolioContent,
  ProjectsContent,
  SiteSettingsContent,
} from './types'

/**
 * Populate projection for `media` relations — fetches URL, dimensions, focal point, WebP sizes,
 * and `blurDataURL` while skipping folder/audit/file-system columns.
 */
export const MEDIA_PUBLIC_POPULATE = {
  media: {
    url: true,
    alt: true,
    width: true,
    height: true,
    mimeType: true,
    blurDataURL: true,
    sizes: true,
    focalX: true,
    focalY: true,
  },
} as const

/**
 * Populate projection for detail pages (`depth: 2`), also restricting internal Lexical `doc`
 * links on `articles` and `projects` to `{ id, slug, title }`.
 */
export const DETAIL_POPULATE = {
  ...MEDIA_PUBLIC_POPULATE,
  articles: {
    slug: true,
    title: true,
  },
  projects: {
    slug: true,
    title: true,
  },
} as const

export const HEADER_GLOBAL_SELECT = {
  sureName: true,
  profileImage: true,
  imageUrl: true,
  requestCV: true,
  professionTexts: true,
  articlesHeader: true,
  projectsHeader: true,
  articleDetailHeader: true,
  projectDetailHeader: true,
} satisfies HeaderSelect

export const NAVIGATION_GLOBAL_SELECT = {
  brand: true,
  skipToContentLabel: true,
  items: true,
} satisfies NavigationSelect

export const FOOTER_GLOBAL_SELECT = {
  socialLinks: true,
  roles: true,
  profiles: true,
  contactInfo: true,
  hiringCta: true,
  copyRight: true,
} satisfies FooterSelect

export const SITE_SETTINGS_GLOBAL_SELECT = {
  siteName: true,
  ownerName: true,
  locale: true,
  themeColor: true,
  siteTitle: true,
  metaDescription: true,
  keywords: true,
  ogDescription: true,
  ogImage: true,
  ogImageUrl: true,
  jobTitle: true,
  address: true,
  hero: true,
  servicesSection: true,
  skillsSection: true,
  certificatesSection: true,
  projectsSection: true,
  articlesSection: true,
  footerLabels: true,
} satisfies SiteSettingsSelect

export const SITE_SETTINGS_PROJECTS_SELECT = {
  projectsSection: true,
} satisfies SiteSettingsSelect

export const ABOUT_SELECT = {
  experience: true,
  workPermit: true,
  uploadImages: true,
  images: true,
  interests: true,
} satisfies AboutSelect

export const SKILL_SELECT = {
  label: true,
  value: true,
  color: true,
  group: true,
} satisfies SkillsSelect

export const EXPERIENCE_SELECT = {
  title: true,
  date: true,
  company: true,
} satisfies ExperiencesSelect

export const EDUCATION_SELECT = {
  title: true,
  date: true,
  institution: true,
  location: true,
} satisfies EducationsSelect

export const CERTIFICATE_SELECT = {
  title: true,
  issuer: true,
  issuedAt: true,
  image: true,
  imageUrl: true,
  link: true,
} satisfies CertificatesSelect

export const SERVICE_SELECT = {
  category: true,
  iconFont: true,
  descriptions: true,
} satisfies ServicesSelect

export const ARTICLE_CARD_SELECT = {
  title: true,
  slug: true,
  excerpt: true,
  description: true,
  content: true,
  featured: true,
  category: true,
  publishedAt: true,
  readTime: true,
  image: true,
  imageUrl: true,
  link: true,
} satisfies ArticlesSelect

export const ARTICLE_SLUG_SELECT = {
  slug: true,
  content: true,
  description: true,
} satisfies ArticlesSelect

export const ARTICLE_DETAIL_SELECT = {
  ...ARTICLE_CARD_SELECT,
  meta: true,
} satisfies ArticlesSelect

export const ARTICLE_FEED_SELECT = {
  title: true,
  slug: true,
  excerpt: true,
  description: true,
  content: true,
  category: true,
  publishedAt: true,
  link: true,
  meta: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies ArticlesSelect

export const PROJECT_CARD_SELECT = {
  title: true,
  slug: true,
  excerpt: true,
  role: true,
  year: true,
  techStack: true,
  content: true,
  image: true,
  src: true,
  placeHolder: true,
  url: true,
  categories: true,
  readTime: true,
} satisfies ProjectsSelect

export const PROJECT_SLUG_SELECT = {
  slug: true,
  content: true,
} satisfies ProjectsSelect

export const PROJECT_DETAIL_SELECT = {
  ...PROJECT_CARD_SELECT,
  client: true,
  readMoreUrl: true,
  meta: true,
} satisfies ProjectsSelect

export const PROJECT_FEED_SELECT = {
  title: true,
  slug: true,
  excerpt: true,
  role: true,
  techStack: true,
  content: true,
  url: true,
  categories: true,
  meta: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies ProjectsSelect

export const REDIRECT_SELECT = {
  from: true,
  to: true,
} satisfies RedirectsSelect

export type SiteChromeContent = {
  siteSettings: SiteSettingsContent
  navigation: NavigationContent
  header: HeaderContent | null
  headerStudio: HeaderStudioConfig
  footer: FooterContent | null
}

export type HomeProfileRawDocs = {
  about: About | null
  skills: Skill[]
  experiences: Experience[]
  educations: Education[]
  certificates: Certificate[]
  services: Service[]
}

/** Fine-grained per-global loaders so `cache.ts` can tag each global independently. */
export const fetchSiteSettingsGlobal = async (): Promise<SiteSetting> => {
  const payload = await getPayload({ config: configPromise })
  return (await payload.findGlobal({
    slug: 'site-settings',
    depth: 1,
    select: SITE_SETTINGS_GLOBAL_SELECT,
    populate: MEDIA_PUBLIC_POPULATE,
  })) as SiteSetting
}

export const fetchNavigationGlobal = async (): Promise<Navigation> => {
  const payload = await getPayload({ config: configPromise })
  return (await payload.findGlobal({
    slug: 'navigation',
    depth: 0,
    select: NAVIGATION_GLOBAL_SELECT,
  })) as Navigation
}

export const fetchHeaderGlobal = async (): Promise<Header> => {
  const payload = await getPayload({ config: configPromise })
  return (await payload.findGlobal({
    slug: 'header',
    depth: 1,
    select: HEADER_GLOBAL_SELECT,
    populate: MEDIA_PUBLIC_POPULATE,
  })) as Header
}

export const fetchFooterGlobal = async (): Promise<Footer> => {
  const payload = await getPayload({ config: configPromise })
  return (await payload.findGlobal({
    slug: 'footer',
    depth: 0,
    select: FOOTER_GLOBAL_SELECT,
  })) as Footer
}

/** Fetches the Home-only profile collections (`about`, `skills`, `experiences`, `educations`, `certificates`, `services`). */
export const fetchHomeProfileRawDocs = async (): Promise<HomeProfileRawDocs> => {
  const payload = await getPayload({ config: configPromise })
  const [about, skills, experiences, educations, certificates, services] = await Promise.all([
    payload
      .find({
        collection: 'about',
        limit: 1,
        depth: 1,
        select: ABOUT_SELECT,
        populate: MEDIA_PUBLIC_POPULATE,
      })
      .then((res) => (res.docs[0] as About | undefined) ?? null),
    payload
      .find({
        collection: 'skills',
        pagination: false,
        sort: '_order',
        depth: 0,
        select: SKILL_SELECT,
      })
      .then((res) => res.docs as Skill[]),
    payload
      .find({
        collection: 'experiences',
        pagination: false,
        sort: '_order',
        depth: 0,
        select: EXPERIENCE_SELECT,
      })
      .then((res) => res.docs as Experience[]),
    payload
      .find({
        collection: 'educations',
        pagination: false,
        sort: '_order',
        depth: 0,
        select: EDUCATION_SELECT,
      })
      .then((res) => res.docs as Education[]),
    payload
      .find({
        collection: 'certificates',
        pagination: false,
        sort: 'issuedAt',
        depth: 1,
        select: CERTIFICATE_SELECT,
        populate: MEDIA_PUBLIC_POPULATE,
      })
      .then((res) => res.docs as Certificate[]),
    payload
      .find({
        collection: 'services',
        pagination: false,
        sort: '_order',
        depth: 0,
        select: SERVICE_SELECT,
      })
      .then((res) => res.docs as Service[]),
  ])

  return { about, skills, experiences, educations, certificates, services }
}

/** Fetches raw published `Article` card rows with `ARTICLE_CARD_SELECT`. */
export const fetchPublishedArticleCardDocs = async (): Promise<Article[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'articles',
    where: PUBLISHED_OR_LEGACY_WHERE,
    pagination: false,
    sort: '-publishedAt',
    depth: 1,
    select: ARTICLE_CARD_SELECT,
    populate: MEDIA_PUBLIC_POPULATE,
  })
  return res.docs as Article[]
}

/** Fetches raw published `Project` card rows with `PROJECT_CARD_SELECT`. */
export const fetchPublishedProjectCardDocs = async (): Promise<Project[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'projects',
    where: PUBLISHED_OR_LEGACY_WHERE,
    pagination: false,
    sort: '_order',
    depth: 1,
    select: PROJECT_CARD_SELECT,
    populate: MEDIA_PUBLIC_POPULATE,
  })
  return res.docs as Project[]
}

/**
 * Fetches only the site-wide chrome (`site-settings`, `navigation`, `header`, `footer`) — 4
 * projected global queries instead of loading all 12 home-page collections.
 */
export const getSiteChromeContent = async (): Promise<SiteChromeContent> => {
  const [siteSettingsDoc, navigationDoc, headerDoc, footerDoc] = await Promise.all([
    fetchSiteSettingsGlobal(),
    fetchNavigationGlobal(),
    fetchHeaderGlobal(),
    fetchFooterGlobal(),
  ])

  return {
    siteSettings: mapSiteSettings(siteSettingsDoc),
    navigation: mapNavigation(navigationDoc),
    header: mapHeader(headerDoc),
    headerStudio: mapHeaderStudio(headerDoc),
    footer: mapFooter(footerDoc),
  }
}

/** Fetches only published articles mapped to `ArticleItem[]`. */
export const getPublishedArticlesList = async (): Promise<ArticleItem[]> => {
  return mapArticles(await fetchPublishedArticleCardDocs())
}

/** Fetches only published projects mapped to `ProjectsContent` (projects + `projectsSection` labels only). */
export const getPublishedProjectsList = async (): Promise<ProjectsContent> => {
  const payload = await getPayload({ config: configPromise })
  const [projectDocs, siteSettingsDoc] = await Promise.all([
    fetchPublishedProjectCardDocs(),
    payload
      .findGlobal({
        slug: 'site-settings',
        depth: 0,
        select: SITE_SETTINGS_PROJECTS_SELECT,
      })
      .catch(() => null),
  ])
  const siteSettings = mapSiteSettings(siteSettingsDoc as Partial<SiteSetting> | null)
  return mapProjects(projectDocs, siteSettings.projectsSection)
}

/** Fetches the raw Payload documents needed by the home page and site chrome. */
export const fetchRawPortfolioDocs = async (): Promise<RawPortfolioDocs> => {
  const [siteSettings, navigation, header, profile, articles, projects, footer] = await Promise.all(
    [
      fetchSiteSettingsGlobal(),
      fetchNavigationGlobal(),
      fetchHeaderGlobal(),
      fetchHomeProfileRawDocs(),
      fetchPublishedArticleCardDocs(),
      fetchPublishedProjectCardDocs(),
      fetchFooterGlobal(),
    ],
  )

  return {
    siteSettings,
    navigation,
    header,
    about: profile.about,
    skills: profile.skills,
    experiences: profile.experiences,
    educations: profile.educations,
    certificates: profile.certificates,
    articles,
    services: profile.services,
    projects,
    footer,
  }
}

/** Returns the home-page view model. */
export const getPortfolioContent = async (): Promise<PortfolioContent> => {
  return mapPortfolioContent(await fetchRawPortfolioDocs())
}

/**
 * Fetches one article by slug (`depth: 2` populates cover image, Media blocks, and internal doc links).
 * When `options.draft` is `true`, returns the latest draft version; otherwise enforces `PUBLISHED_OR_LEGACY_WHERE`.
 */
export const fetchArticleBySlug = async (
  slug: string,
  options?: { draft?: boolean },
): Promise<Article | null> => {
  const payload = await getPayload({ config: configPromise })
  const isDraft = Boolean(options?.draft)
  const where: Where = isDraft
    ? { slug: { equals: slug } }
    : { and: [{ slug: { equals: slug } }, PUBLISHED_OR_LEGACY_WHERE] }

  const res = await payload.find({
    collection: 'articles',
    where,
    draft: isDraft,
    limit: 1,
    depth: 2,
    select: ARTICLE_DETAIL_SELECT,
    populate: DETAIL_POPULATE,
  })
  return (res.docs[0] as Article | undefined) ?? null
}

/**
 * Returns the slugs of published articles that have an on-site page (`hasArticlePage`).
 */
export const fetchPublishedArticleSlugs = async (): Promise<string[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'articles',
    where: PUBLISHED_OR_LEGACY_WHERE,
    pagination: false,
    depth: 0,
    sort: '-publishedAt',
    select: ARTICLE_SLUG_SELECT,
  })
  return res.docs.filter((doc) => hasArticlePage(doc)).map((doc) => doc.slug as string)
}

/**
 * Fetches one project by slug (`depth: 2` populates cover image, Media blocks, and internal doc links).
 * When `options.draft` is `true`, returns the latest draft version; otherwise enforces `PUBLISHED_OR_LEGACY_WHERE`.
 */
export const fetchProjectBySlug = async (
  slug: string,
  options?: { draft?: boolean },
): Promise<Project | null> => {
  const payload = await getPayload({ config: configPromise })
  const isDraft = Boolean(options?.draft)
  const where: Where = isDraft
    ? { slug: { equals: slug } }
    : { and: [{ slug: { equals: slug } }, PUBLISHED_OR_LEGACY_WHERE] }

  const res = await payload.find({
    collection: 'projects',
    where,
    draft: isDraft,
    limit: 1,
    depth: 2,
    select: PROJECT_DETAIL_SELECT,
    populate: DETAIL_POPULATE,
  })
  return (res.docs[0] as Project | undefined) ?? null
}

/**
 * Returns the slugs of published projects that have an on-site case-study page (`hasProjectPage`).
 */
export const fetchPublishedProjectSlugs = async (): Promise<string[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'projects',
    where: PUBLISHED_OR_LEGACY_WHERE,
    pagination: false,
    depth: 0,
    sort: '_order',
    select: PROJECT_SLUG_SELECT,
  })
  return res.docs.filter((doc) => hasProjectPage(doc)).map((doc) => doc.slug as string)
}

/**
 * Fetches all CMS-configured URL redirects (`depth: 1` populates internal `articles`/`projects` references).
 */
export const fetchRedirects = async (): Promise<Redirect[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'redirects',
    pagination: false,
    depth: 1,
    select: REDIRECT_SELECT,
    populate: {
      articles: { slug: true },
      projects: { slug: true },
    },
  })
  return res.docs as Redirect[]
}

/**
 * Fetches projected published articles, published projects, and site settings for `/sitemap.xml` and `/feed.xml`.
 */
export const fetchFeedSourceDocs = async (): Promise<{
  articles: Article[]
  projects: Project[]
  siteSettings: SiteSetting | null
}> => {
  const payload = await getPayload({ config: configPromise })
  const [articles, projects, siteSettings] = await Promise.all([
    payload
      .find({
        collection: 'articles',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        sort: '-publishedAt',
        depth: 0,
        select: ARTICLE_FEED_SELECT,
      })
      .then((res) => res.docs as Article[]),
    payload
      .find({
        collection: 'projects',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        sort: '_order',
        depth: 0,
        select: PROJECT_FEED_SELECT,
      })
      .then((res) => res.docs as Project[]),
    payload
      .findGlobal({
        slug: 'site-settings',
        depth: 1,
        select: SITE_SETTINGS_GLOBAL_SELECT,
        populate: MEDIA_PUBLIC_POPULATE,
      })
      .then((doc) => doc as SiteSetting)
      .catch(() => null),
  ])
  return { articles, projects, siteSettings }
}
