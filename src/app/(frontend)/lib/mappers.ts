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
  ArticleItem,
  CertificateItem,
  ContactItem,
  EducationItem,
  ExperienceItem,
  FooterContent,
  HeaderContent,
  HiringCta,
  NavigationContent,
  NavigationItem,
  PortfolioContent,
  ProjectFilter,
  ProjectItem,
  ProjectsContent,
  SectionCta,
  ServiceItem,
  ServicesContent,
  SiteSettingsContent,
  SkillBar,
  SkillsContent,
} from './types'

/**
 * Raw documents as returned by the data source. Singletons and unsaved globals may be `null`.
 */
export type RawPortfolioDocs = {
  siteSettings?: Partial<SiteSetting> | null
  navigation?: Partial<Navigation> | null
  header: Header | null
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
  ogDescription:
    'Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant',
  ogImage: {
    url: DEFAULT_PROFILE_IMAGE_PATH,
    width: DEFAULT_PROFILE_IMAGE_WIDTH,
    height: DEFAULT_PROFILE_IMAGE_HEIGHT,
    alt: 'Amir v.Tarikhi',
    mimeType: 'image/webp',
  },
  jobTitle: 'Senior Full-Stack Web Developer',
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

/** Returns the resolved URL of an upload, or `null` when the relation is not populated. */
export const resolveMediaUrl = (media: number | Media | null | undefined): string | null => {
  if (!media || typeof media !== 'object') return null
  return media.url ?? null
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
  const fallbackOgUrl = withFallback(doc.ogImageUrl, DEFAULT_SITE_SETTINGS.ogImage.url)
  const ogImage = uploadedOgMedia
    ? {
        url: uploadedOgMedia.url as string,
        width: uploadedOgMedia.width ?? DEFAULT_PROFILE_IMAGE_WIDTH,
        height: uploadedOgMedia.height ?? DEFAULT_PROFILE_IMAGE_HEIGHT,
        alt: withFallback(uploadedOgMedia.alt, ownerName),
        ...(uploadedOgMedia.mimeType ? { mimeType: uploadedOgMedia.mimeType } : {}),
      }
    : {
        url: fallbackOgUrl,
        width: DEFAULT_PROFILE_IMAGE_WIDTH,
        height: DEFAULT_PROFILE_IMAGE_HEIGHT,
        alt: ownerName,
        ...(fallbackOgUrl.endsWith('.webp') ? { mimeType: 'image/webp' } : {}),
      }

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
    ogDescription:
      doc.ogDescription === undefined
        ? DEFAULT_SITE_SETTINGS.ogDescription
        : ogDescription,
    ogImage,
    jobTitle: withFallback(doc.jobTitle, DEFAULT_SITE_SETTINGS.jobTitle),
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

export const mapHeader = (doc: Header | null): HeaderContent | null => {
  if (!doc) return null
  return {
    id: idToString(doc.id),
    sureName: doc.sureName,
    imageUrl: resolveMediaUrl(doc.profileImage) ?? withFallback(doc.imageUrl, ''),
    requestCV: withFallback(doc.requestCV, '#'),
    professionTexts: doc.professionTexts ?? [],
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

    return {
      id: idToString(doc.id),
      title: doc.title,
      excerpt: doc.excerpt,
      author: formatDisplayDate(doc.publishedAt),
      readTime: formatReadTime(minutes),
      imageUrl: resolveMediaUrl(doc.image) ?? withFallback(doc.imageUrl, ''),
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
    const uploadUrl = resolveMediaUrl(doc.image)
    const caseStudyPath = doc.slug && hasProjectPage(doc) ? projectPagePath(doc.slug) : null
    return {
      id: idToString(doc.id),
      title: doc.title,
      excerpt: doc.excerpt?.trim() || null,
      categories: doc.categories ?? [],
      thumbnailUrl: withFallback(doc.placeHolder, uploadUrl ?? ''),
      imageUrl: uploadUrl ?? withFallback(doc.src, ''),
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
