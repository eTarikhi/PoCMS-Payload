/**
 * Payload data source for the portfolio site.
 *
 * Public published content reads dispatch fixed server-owned persisted GraphQL operations first and
 * fall back cleanly to authorized Local API projections (`overrideAccess: false`) on error or list
 * truncation. Draft preview reads (`{ draft: true }`) and the restricted `CustomCode` global read
 * intentionally remain on Payload's Local API. Media/document binary delivery stays on Payload's
 * existing REST/static file routes.
 */

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { PUBLISHED_OR_LEGACY_WHERE } from '@/access/roles'
import { executePersistedQuery } from '@/fgql/executePersistedQuery'
import type { PersistedQueryId } from '@/fgql/persistedQueryRegistry'
import {
  logPersistedQueryFallback,
  logPersistedQueryFallbackFailure,
  readCompleteGraphQLList,
  readGraphQLList,
  readGraphQLObject,
} from '@/fgql/response'
import type {
  About,
  AboutSelect,
  Article,
  ArticlesSelect,
  Certificate,
  CertificatesSelect,
  CustomCode,
  CustomCodeSelect,
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
import { type CustomCodeContent, mapCustomCode } from './custom-code'
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
 * Populate projection for `media` relations — fetches URL, `filename` (required by Payload's
 * upload `afterRead` hook to compute REST `/api/media/file/<filename>` URLs), dimensions, focal
 * point, WebP sizes, and `blurDataURL` while skipping folder/audit/file-system columns.
 */
export const MEDIA_PUBLIC_POPULATE = {
  media: {
    url: true,
    filename: true,
    alt: true,
    width: true,
    height: true,
    mimeType: true,
    blurDataURL: true,
    sizes: true,
    focalX: true,
    focalY: true,
  },
  skills: {
    label: true,
    deletedAt: true,
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
  ogTitle: true,
  ogDescription: true,
  ogImage: true,
  ogImageUrl: true,
  allowIndexing: true,
  twitterSite: true,
  twitterCreator: true,
  verification: true,
  articlesHubSeo: true,
  projectsHubSeo: true,
  jobTitle: true,
  knowsAboutSkills: true,
  knowsAbout: true,
  worksFor: true,
  alumniOf: true,
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
  primaryMedia: true,
  mediaMode: true,
  mediaSource: true,
  image: true,
  imageUrl: true,
  imageAlt: true,
  imageUrlMeta: true,
  link: true,
} satisfies ArticlesSelect

export const ARTICLE_SLUG_SELECT = {
  slug: true,
  content: true,
  description: true,
} satisfies ArticlesSelect

export const ARTICLE_DETAIL_SELECT = {
  ...ARTICLE_CARD_SELECT,
  detailMedia: true,
  galleryLayout: true,
  gallery: true,
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
  relatedSkills: true,
  techStack: true,
  content: true,
  primaryMedia: true,
  mediaMode: true,
  mediaSource: true,
  image: true,
  src: true,
  imageAlt: true,
  srcMeta: true,
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
  detailMedia: true,
  galleryLayout: true,
  gallery: true,
  client: true,
  readMoreUrl: true,
  meta: true,
} satisfies ProjectsSelect

export const PROJECT_FEED_SELECT = {
  title: true,
  slug: true,
  excerpt: true,
  role: true,
  relatedSkills: true,
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
  type: true,
} satisfies RedirectsSelect

export const CUSTOM_CODE_GLOBAL_SELECT = {
  enabled: true,
  skipInPreview: true,
  metaTags: true,
  linkTags: true,
  headCode: true,
  customCss: true,
  afterFooter: true,
  bodyStart: true,
  bodyEnd: true,
} satisfies CustomCodeSelect

export type SiteChromeContent = {
  siteSettings: SiteSettingsContent
  navigation: NavigationContent
  header: HeaderContent | null
  headerStudio: HeaderStudioConfig
  footer: FooterContent | null
  customCode: CustomCodeContent
}

export type HomeProfileRawDocs = {
  about: About | null
  skills: Skill[]
  experiences: Experience[]
  educations: Education[]
  certificates: Certificate[]
  services: Service[]
}

const withAuthorizedLocalApiFallback = async <T>(
  operationId: PersistedQueryId,
  runPersisted: () => Promise<T>,
  runFallback: () => Promise<T>,
): Promise<T> => {
  try {
    return await runPersisted()
  } catch (primaryError) {
    logPersistedQueryFallback(operationId, primaryError)
    try {
      return await runFallback()
    } catch (fallbackError) {
      logPersistedQueryFallbackFailure(operationId, fallbackError)
      throw fallbackError
    }
  }
}

/** Fine-grained per-global loaders so `cache.ts` can tag each global independently. */
export const fetchSiteSettingsGlobal = async (): Promise<SiteSetting> =>
  withAuthorizedLocalApiFallback(
    'public.site-settings.v1',
    async () => {
      const data = await executePersistedQuery('public.site-settings.v1')
      return readGraphQLObject<SiteSetting>(data, 'SiteSetting')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      return (await payload.findGlobal({
        slug: 'site-settings',
        depth: 1,
        overrideAccess: false,
        select: SITE_SETTINGS_GLOBAL_SELECT,
        populate: MEDIA_PUBLIC_POPULATE,
      })) as SiteSetting
    },
  )

export const fetchNavigationGlobal = async (): Promise<Navigation> =>
  withAuthorizedLocalApiFallback(
    'public.navigation.v1',
    async () => {
      const data = await executePersistedQuery('public.navigation.v1')
      return readGraphQLObject<Navigation>(data, 'Navigation')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      return (await payload.findGlobal({
        slug: 'navigation',
        depth: 0,
        overrideAccess: false,
        select: NAVIGATION_GLOBAL_SELECT,
      })) as Navigation
    },
  )

export const fetchHeaderGlobal = async (): Promise<Header> =>
  withAuthorizedLocalApiFallback(
    'public.header.v1',
    async () => {
      const data = await executePersistedQuery('public.header.v1')
      return readGraphQLObject<Header>(data, 'Header')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      return (await payload.findGlobal({
        slug: 'header',
        depth: 1,
        overrideAccess: false,
        select: HEADER_GLOBAL_SELECT,
        populate: MEDIA_PUBLIC_POPULATE,
      })) as Header
    },
  )

export const fetchFooterGlobal = async (): Promise<Footer> =>
  withAuthorizedLocalApiFallback(
    'public.footer.v1',
    async () => {
      const data = await executePersistedQuery('public.footer.v1')
      return readGraphQLObject<Footer>(data, 'Footer')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      return (await payload.findGlobal({
        slug: 'footer',
        depth: 0,
        overrideAccess: false,
        select: FOOTER_GLOBAL_SELECT,
      })) as Footer
    },
  )

export const fetchCustomCodeGlobal = async (): Promise<CustomCode | null> => {
  const payload = await getPayload({ config: configPromise })
  return (await payload
    .findGlobal({
      slug: 'custom-code',
      depth: 0,
      select: CUSTOM_CODE_GLOBAL_SELECT,
    })
    .catch(() => null)) as CustomCode | null
}

/** Fetches the Home-only profile collections (`about`, `skills`, `experiences`, `educations`, `certificates`, `services`). */
export const fetchHomeProfileRawDocs = async (): Promise<HomeProfileRawDocs> =>
  withAuthorizedLocalApiFallback(
    'public.home-profile.v1',
    async () => {
      const data = await executePersistedQuery('public.home-profile.v1')
      const aboutList = readGraphQLList<About>(data, 'Abouts')
      return {
        about: aboutList.docs[0] ?? null,
        skills: readCompleteGraphQLList<Skill>(data, 'Skills'),
        experiences: readCompleteGraphQLList<Experience>(data, 'Experiences'),
        educations: readCompleteGraphQLList<Education>(data, 'Educations'),
        certificates: readCompleteGraphQLList<Certificate>(data, 'Certificates'),
        services: readCompleteGraphQLList<Service>(data, 'Services'),
      }
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      const [about, skills, experiences, educations, certificates, services] = await Promise.all([
        payload
          .find({
            collection: 'about',
            limit: 1,
            depth: 1,
            overrideAccess: false,
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
            joins: false,
            overrideAccess: false,
            select: SKILL_SELECT,
          })
          .then((res) => res.docs as Skill[]),
        payload
          .find({
            collection: 'experiences',
            pagination: false,
            sort: '_order',
            depth: 0,
            overrideAccess: false,
            select: EXPERIENCE_SELECT,
          })
          .then((res) => res.docs as Experience[]),
        payload
          .find({
            collection: 'educations',
            pagination: false,
            sort: '_order',
            depth: 0,
            overrideAccess: false,
            select: EDUCATION_SELECT,
          })
          .then((res) => res.docs as Education[]),
        payload
          .find({
            collection: 'certificates',
            pagination: false,
            sort: 'issuedAt',
            depth: 1,
            overrideAccess: false,
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
            overrideAccess: false,
            select: SERVICE_SELECT,
          })
          .then((res) => res.docs as Service[]),
      ])

      return { about, skills, experiences, educations, certificates, services }
    },
  )

/** Fetches raw published `Article` card rows with `ARTICLE_CARD_SELECT`. */
export const fetchPublishedArticleCardDocs = async (): Promise<Article[]> =>
  withAuthorizedLocalApiFallback(
    'public.article-cards.v1',
    async () => {
      const data = await executePersistedQuery('public.article-cards.v1')
      return readCompleteGraphQLList<Article>(data, 'Articles')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'articles',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        sort: '-publishedAt',
        depth: 1,
        overrideAccess: false,
        select: ARTICLE_CARD_SELECT,
        populate: MEDIA_PUBLIC_POPULATE,
      })
      return res.docs as Article[]
    },
  )

/** Fetches raw published `Project` card rows with `PROJECT_CARD_SELECT`. */
export const fetchPublishedProjectCardDocs = async (): Promise<Project[]> =>
  withAuthorizedLocalApiFallback(
    'public.project-cards.v1',
    async () => {
      const data = await executePersistedQuery('public.project-cards.v1')
      return readCompleteGraphQLList<Project>(data, 'Projects')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'projects',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        sort: '_order',
        depth: 1,
        overrideAccess: false,
        select: PROJECT_CARD_SELECT,
        populate: MEDIA_PUBLIC_POPULATE,
      })
      return res.docs as Project[]
    },
  )

const fetchProjectsSectionSiteSettings = async (): Promise<Partial<SiteSetting> | null> =>
  withAuthorizedLocalApiFallback<Partial<SiteSetting> | null>(
    'public.projects-section.v1',
    async () => {
      const data = await executePersistedQuery('public.projects-section.v1')
      return readGraphQLObject<Partial<SiteSetting>>(data, 'SiteSetting')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      return (await payload.findGlobal({
        slug: 'site-settings',
        depth: 0,
        overrideAccess: false,
        select: SITE_SETTINGS_PROJECTS_SELECT,
      })) as Partial<SiteSetting>
    },
  ).catch(() => null)

/**
 * Fetches only the site-wide chrome (`site-settings`, `navigation`, `header`, `footer`, `custom-code`)
 * via projected global queries instead of loading all 12 home-page collections.
 */
export const getSiteChromeContent = async (): Promise<SiteChromeContent> => {
  const [siteSettingsDoc, navigationDoc, headerDoc, footerDoc, customCodeDoc] = await Promise.all([
    fetchSiteSettingsGlobal(),
    fetchNavigationGlobal(),
    fetchHeaderGlobal(),
    fetchFooterGlobal(),
    fetchCustomCodeGlobal(),
  ])

  return {
    siteSettings: mapSiteSettings(siteSettingsDoc),
    navigation: mapNavigation(navigationDoc),
    header: mapHeader(headerDoc),
    headerStudio: mapHeaderStudio(headerDoc),
    footer: mapFooter(footerDoc),
    customCode: mapCustomCode(customCodeDoc),
  }
}

/** Fetches only published articles mapped to `ArticleItem[]`. */
export const getPublishedArticlesList = async (): Promise<ArticleItem[]> => {
  return mapArticles(await fetchPublishedArticleCardDocs())
}

/** Fetches only published projects mapped to `ProjectsContent` (projects + `projectsSection` labels only). */
export const getPublishedProjectsList = async (): Promise<ProjectsContent> => {
  const [projectDocs, siteSettingsDoc] = await Promise.all([
    fetchPublishedProjectCardDocs(),
    fetchProjectsSectionSiteSettings(),
  ])
  const siteSettings = mapSiteSettings(siteSettingsDoc)
  return mapProjects(projectDocs, siteSettings.projectsSection)
}

/** Fetches the raw Payload documents needed by the home page and site chrome. */
export const fetchRawPortfolioDocs = async (): Promise<RawPortfolioDocs> => {
  const [siteSettings, navigation, header, profile, articles, projects, footer, customCode] =
    await Promise.all([
      fetchSiteSettingsGlobal(),
      fetchNavigationGlobal(),
      fetchHeaderGlobal(),
      fetchHomeProfileRawDocs(),
      fetchPublishedArticleCardDocs(),
      fetchPublishedProjectCardDocs(),
      fetchFooterGlobal(),
      fetchCustomCodeGlobal(),
    ])

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
    customCode,
  }
}

/** Returns the home-page view model. */
export const getPortfolioContent = async (): Promise<PortfolioContent> => {
  return mapPortfolioContent(await fetchRawPortfolioDocs())
}

/**
 * Fetches one article by slug (`depth: 2` populates cover image, Media blocks, and internal doc links).
 * When `options.draft` is `true`, returns the latest draft version via Local API; otherwise dispatches
 * `public.article-detail.v1` with authorized Local API fallback.
 */
export const fetchArticleBySlug = async (
  slug: string,
  options?: { draft?: boolean },
): Promise<Article | null> => {
  const isDraft = Boolean(options?.draft)
  if (isDraft) {
    const payload = await getPayload({ config: configPromise })
    const res = await payload.find({
      collection: 'articles',
      where: { slug: { equals: slug } },
      draft: true,
      limit: 1,
      depth: 2,
      select: ARTICLE_DETAIL_SELECT,
      populate: DETAIL_POPULATE,
    })
    return (res.docs[0] as Article | undefined) ?? null
  }

  return withAuthorizedLocalApiFallback(
    'public.article-detail.v1',
    async () => {
      const data = await executePersistedQuery('public.article-detail.v1', { slug })
      const list = readGraphQLList<Article>(data, 'Articles')
      return list.docs[0] ?? null
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'articles',
        where: { and: [{ slug: { equals: slug } }, PUBLISHED_OR_LEGACY_WHERE] },
        draft: false,
        limit: 1,
        depth: 2,
        overrideAccess: false,
        select: ARTICLE_DETAIL_SELECT,
        populate: DETAIL_POPULATE,
      })
      return (res.docs[0] as Article | undefined) ?? null
    },
  )
}

/**
 * Returns the slugs of published articles that have an on-site page (`hasArticlePage`).
 */
export const fetchPublishedArticleSlugs = async (): Promise<string[]> => {
  const docs = await withAuthorizedLocalApiFallback(
    'public.article-slugs.v1',
    async () => {
      const data = await executePersistedQuery('public.article-slugs.v1')
      return readCompleteGraphQLList<Article>(data, 'Articles')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'articles',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        depth: 0,
        sort: '-publishedAt',
        overrideAccess: false,
        select: ARTICLE_SLUG_SELECT,
      })
      return res.docs as Article[]
    },
  )
  return docs.filter((doc) => hasArticlePage(doc)).map((doc) => doc.slug as string)
}

/**
 * Fetches one project by slug (`depth: 2` populates cover image, Media blocks, and internal doc links).
 * When `options.draft` is `true`, returns the latest draft version via Local API; otherwise dispatches
 * `public.project-detail.v1` with authorized Local API fallback.
 */
export const fetchProjectBySlug = async (
  slug: string,
  options?: { draft?: boolean },
): Promise<Project | null> => {
  const isDraft = Boolean(options?.draft)
  if (isDraft) {
    const payload = await getPayload({ config: configPromise })
    const res = await payload.find({
      collection: 'projects',
      where: { slug: { equals: slug } },
      draft: true,
      limit: 1,
      depth: 2,
      select: PROJECT_DETAIL_SELECT,
      populate: DETAIL_POPULATE,
    })
    return (res.docs[0] as Project | undefined) ?? null
  }

  return withAuthorizedLocalApiFallback(
    'public.project-detail.v1',
    async () => {
      const data = await executePersistedQuery('public.project-detail.v1', { slug })
      const list = readGraphQLList<Project>(data, 'Projects')
      return list.docs[0] ?? null
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'projects',
        where: { and: [{ slug: { equals: slug } }, PUBLISHED_OR_LEGACY_WHERE] },
        draft: false,
        limit: 1,
        depth: 2,
        overrideAccess: false,
        select: PROJECT_DETAIL_SELECT,
        populate: DETAIL_POPULATE,
      })
      return (res.docs[0] as Project | undefined) ?? null
    },
  )
}

/**
 * Returns the slugs of published projects that have an on-site case-study page (`hasProjectPage`).
 */
export const fetchPublishedProjectSlugs = async (): Promise<string[]> => {
  const docs = await withAuthorizedLocalApiFallback(
    'public.project-slugs.v1',
    async () => {
      const data = await executePersistedQuery('public.project-slugs.v1')
      return readCompleteGraphQLList<Project>(data, 'Projects')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'projects',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        depth: 0,
        sort: '_order',
        overrideAccess: false,
        select: PROJECT_SLUG_SELECT,
      })
      return res.docs as Project[]
    },
  )
  return docs.filter((doc) => hasProjectPage(doc)).map((doc) => doc.slug as string)
}

/**
 * Fetches all CMS-configured URL redirects (`depth: 1` populates internal `articles`/`projects` references).
 */
export const fetchRedirects = async (): Promise<Redirect[]> =>
  withAuthorizedLocalApiFallback(
    'public.redirects.v1',
    async () => {
      const data = await executePersistedQuery('public.redirects.v1')
      return readCompleteGraphQLList<Redirect>(data, 'Redirects')
    },
    async () => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'redirects',
        pagination: false,
        depth: 1,
        overrideAccess: false,
        select: REDIRECT_SELECT,
        populate: {
          articles: { slug: true },
          projects: { slug: true },
        },
      })
      return res.docs as Redirect[]
    },
  )

/**
 * Fetches projected published articles, published projects, and site settings for `/sitemap.xml` and `/feed.xml`.
 */
export const fetchFeedSourceDocs = async (): Promise<{
  articles: Article[]
  projects: Project[]
  siteSettings: SiteSetting | null
}> => {
  const [articles, projects, siteSettings] = await Promise.all([
    withAuthorizedLocalApiFallback(
      'public.article-feed.v1',
      async () => {
        const data = await executePersistedQuery('public.article-feed.v1')
        return readCompleteGraphQLList<Article>(data, 'Articles')
      },
      async () => {
        const payload = await getPayload({ config: configPromise })
        const res = await payload.find({
          collection: 'articles',
          where: PUBLISHED_OR_LEGACY_WHERE,
          pagination: false,
          sort: '-publishedAt',
          depth: 0,
          overrideAccess: false,
          select: ARTICLE_FEED_SELECT,
        })
        return res.docs as Article[]
      },
    ),
    withAuthorizedLocalApiFallback(
      'public.project-feed.v1',
      async () => {
        const data = await executePersistedQuery('public.project-feed.v1')
        return readCompleteGraphQLList<Project>(data, 'Projects')
      },
      async () => {
        const payload = await getPayload({ config: configPromise })
        const res = await payload.find({
          collection: 'projects',
          where: PUBLISHED_OR_LEGACY_WHERE,
          pagination: false,
          sort: '_order',
          depth: 1,
          overrideAccess: false,
          select: PROJECT_FEED_SELECT,
          populate: {
            skills: {
              label: true,
              deletedAt: true,
            },
          },
        })
        return res.docs as Project[]
      },
    ),
    fetchSiteSettingsGlobal().catch(() => null),
  ])
  return { articles, projects, siteSettings }
}
