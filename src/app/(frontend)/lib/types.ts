/**
 * Framework-free view models for the portfolio site.
 *
 * These are the only shapes the presentational components in
 * `src/app/(frontend)/components/*` are allowed to depend on.
 *
 * Nothing in this file imports Payload or React.
 */

export type NavigationItem = {
  id: string
  label: string
  href: string
  position: 'left' | 'right'
  openInNewTab: boolean
}

export type NavigationContent = {
  brand: {
    text: string
    href: string
  }
  skipToContentLabel: string
  items: NavigationItem[]
}

export type PostalAddressContent = {
  streetAddress: string
  addressLocality: string
  addressRegion: string
  postalCode: string
}

export type SectionCta = {
  label: string
  url: string
}

export type SeoOverride = {
  title: string | null
  description: string | null
  imageUrl: string | null
  imageAlt: string | null
}

export type SiteSettingsContent = {
  siteName: string
  ownerName: string
  locale: string
  themeColor: string
  siteTitle: string
  metaDescription: string
  keywords: string
  ogDescription: string
  ogImage: {
    url: string
    width: number
    height: number
    alt: string
    mimeType?: string
  }
  jobTitle: string
  address: PostalAddressContent
  hero: {
    greeting: string
    requestCvLabel: string
  }
  servicesSection: {
    heading: string
  }
  skillsSection: {
    heading: string
    intro: string
    skillsSubheading: string
    experienceTabLabel: string
    educationTabLabel: string
  }
  certificatesSection: {
    heading: string
    cta: SectionCta | null
    viewCertificateLabel: string
  }
  projectsSection: {
    heading: string
    allFilterLabel: string
    archiveDescription: string
    searchPlaceholder: string
    caseStudyLabel: string
    backToProjectsLabel: string
    liveProjectLabel: string
    notFoundTitle: string
    notFoundDescription: string
  }
  articlesSection: {
    heading: string
    cta: SectionCta | null
    readOnSiteLabel: string
    featuredBadgeLabel: string
    archiveDescription: string
    searchPlaceholder: string
    backToArticlesLabel: string
    externalPublicationLabel: string
    notFoundTitle: string
    notFoundDescription: string
  }
  footerLabels: {
    socialPrompt: string
    profilesHeading: string
    contactHeading: string
  }
}

export type HeaderBackgroundPreset =
  | 'aurora-grain'
  | 'blueprint-spotlight'
  | 'chromatic-cover'
  | 'constellation-canvas'
  | 'obsidian-minimal'

export type HeaderAccentTone = 'gold-copper' | 'amber-slate' | 'cyan-gold'

export type ArticlesArchiveLayoutMode = 'magazine' | 'list' | 'grid'

export type ProjectsArchiveLayoutMode = 'showcase' | 'list' | 'grid'

export type ArticlesArchiveHeaderConfig = {
  eyebrow: string
  headingOverride: string | null
  subtitleOverride: string | null
  backgroundPreset: HeaderBackgroundPreset
  accentTone: HeaderAccentTone
  defaultLayout: ArticlesArchiveLayoutMode
  showSearch: boolean
  showFilters: boolean
  showStatsBar: boolean
  showRssLink: boolean
}

export type ProjectsArchiveHeaderConfig = {
  eyebrow: string
  headingOverride: string | null
  subtitleOverride: string | null
  backgroundPreset: HeaderBackgroundPreset
  accentTone: HeaderAccentTone
  defaultLayout: ProjectsArchiveLayoutMode
  showSearch: boolean
  showCategoryFilters: boolean
  showTechFilters: boolean
  showStatsBar: boolean
}

export type ArticleDetailHeaderConfig = {
  eyebrow: string
  backgroundPreset: HeaderBackgroundPreset
  accentTone: HeaderAccentTone
  showBreadcrumbs: boolean
  showShareActions: boolean
  showSectionJumpDock: boolean
  showStickyToc: boolean
  showRelatedArticles: boolean
}

export type ProjectDetailHeaderConfig = {
  eyebrow: string
  backgroundPreset: HeaderBackgroundPreset
  accentTone: HeaderAccentTone
  showBreadcrumbs: boolean
  showSpecDock: boolean
  showTechLinks: boolean
  showStickySidebar: boolean
  showRelatedProjects: boolean
}

export type HeaderStudioConfig = {
  articlesArchive: ArticlesArchiveHeaderConfig
  projectsArchive: ProjectsArchiveHeaderConfig
  articleDetail: ArticleDetailHeaderConfig
  projectDetail: ProjectDetailHeaderConfig
}

export type HeaderContent = {
  id: string
  sureName: string
  /** Profile image URL (Payload upload URL, or legacy text URL as fallback). */
  imageUrl: string
  /** Target of the "Request CV" button. */
  requestCV: string
  /** Job titles cycled by the typing effect. */
  professionTexts: string[]
  /** Unified Header Studio configuration for inner archive & detail pages. */
  studio?: HeaderStudioConfig
}

export type AboutContent = {
  experience: {
    years: number
    title: string
    description: string
  }
  workPermit: {
    title: string
    description: string
  }
  /** Gallery image URLs. */
  images: string[]
  interests: {
    title: string
    description: string
    areas: string[]
  }
}

export type SkillBar = {
  id: string
  label: string
  /** Proficiency, 0-100. */
  value: number
  /** Bootstrap contextual colour name, e.g. "success". */
  color: string
}

export type SkillsContent = {
  frontend: SkillBar[]
  backend: SkillBar[]
}

export type ExperienceItem = {
  id: string
  title: string
  /** Display text, e.g. "2022 - 2023". */
  date: string
  company: string
}

export type EducationItem = {
  id: string
  title: string
  /** Display text, e.g. "2001 - 2007". */
  date: string
  /** Display location. For Payload content this is "<institution> / <location>". */
  location: string
}

export type CertificateItem = {
  id: string
  title: string
  issuer: string
  /** Display date, e.g. "January 9, 2025". */
  date: string
  imageUrl: string
  link: string | null
}

export type ArticleItem = {
  id: string
  title: string
  excerpt: string
  /** Display date shown after "Issued:", e.g. "February 2, 2025". */
  author: string
  /** Display read time, e.g. "3 min". */
  readTime: string
  imageUrl: string
  /** Optional base64 WebP blur placeholder generated via `sharp` on upload. */
  blurDataURL?: string | null
  /** External publication URL (empty string when on-site only). */
  link: string
  /** Internal page path, e.g. "/articles/devops-roadmap". Null when the article has no page. */
  pagePath: string | null
  /** Highlighted in the featured slot on the home page and `/articles`. */
  featured?: boolean
  /** Article category (`"articles"` | `"others"`). */
  category?: 'articles' | 'others' | null
}

export type ServiceItem = {
  id: string
  category: string
  /** Key into the Font Awesome icon map, e.g. "faCode". */
  iconFont: string
  descriptions: string[]
}

export type HiringCta = {
  label: string
  url: string
}

export type ServicesContent = {
  items: ServiceItem[]
  hiring: HiringCta | null
}

export type ProjectFilter = {
  label: string
  /** "*" means "all projects"; other values match a project's `categories`. */
  value: string
}

export type ProjectItem = {
  id: string
  title: string
  excerpt?: string | null
  categories: string[]
  /** Technologies used in the project (e.g. ["Next.js", "Payload CMS"]). */
  techStack?: string[]
  role?: string | null
  year?: string | null
  readTime?: string | null
  /** Small image shown in the grid. */
  thumbnailUrl: string
  /** Full-size image. */
  imageUrl: string
  /** Optional base64 WebP blur placeholder generated via `sharp` on upload. */
  blurDataURL?: string | null
  /** Live site or external project URL. */
  url: string
  /** Internal case-study page path, e.g. "/projects/alyapanel". Null when the project has no case study. */
  pagePath?: string | null
}

export type ProjectsContent = {
  heading: string
  caseStudyLabel?: string
  filters: ProjectFilter[]
  items: ProjectItem[]
}

export type SocialLink = {
  url: string
  /** Key into the footer icon map, e.g. "faGithub". */
  iconName: string
  ariaLabel: string
}

export type ContactItem = {
  type: 'address' | 'email' | 'phone' | 'whatsapp'
  iconName: string
  content: string
  url: string | null
  isLink: boolean
  className: string
}

export type FooterContent = {
  socialLinks: SocialLink[]
  fullName: string
  roles: string[]
  profiles: Array<{ name: string; url: string }>
  contactInfo: ContactItem[]
  copyright: {
    year: number
    website: string
    url: string
  }
}

/** Everything the home page renders. Singletons may be `null` when unseeded. */
export type PortfolioContent = {
  siteSettings: SiteSettingsContent
  navigation: NavigationContent
  header: HeaderContent | null
  headerStudio: HeaderStudioConfig
  about: AboutContent | null
  skills: SkillsContent
  experiences: ExperienceItem[]
  educations: EducationItem[]
  certificates: CertificateItem[]
  articles: ArticleItem[]
  services: ServicesContent
  projects: ProjectsContent
  footer: FooterContent | null
}
