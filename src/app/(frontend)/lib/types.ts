/**
 * Framework-free view models for the portfolio site.
 *
 * These are the only shapes the presentational components in
 * `src/app/(frontend)/components/*` are allowed to depend on. They mirror the props
 * interfaces of the original `vTarikhi/` components, with the following changes:
 *
 * - Unused placeholder members (`map`, `filter`) are removed.
 * - Display strings are pre-formatted here (dates, "3 min", joined locations),
 *   so components render the same text as the original site.
 * - Image URLs are resolved to plain strings, whether they come from a Payload
 *   upload or from a legacy text URL.
 *
 * Nothing in this file imports Payload or React.
 */

export type HeaderContent = {
  id: string
  sureName: string
  /** Profile image URL (Payload upload URL, or legacy text URL as fallback). */
  imageUrl: string
  /** Target of the "Request CV" button. */
  requestCV: string
  /** Job titles cycled by the typing effect. */
  professionTexts: string[]
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
  link: string
  /** Internal page path, e.g. "/articles/devops-roadmap". Null when the article has no page (D-A10). */
  pagePath: string | null
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
  categories: string[]
  /** Small image shown in the grid. */
  thumbnailUrl: string
  /** Full-size image. */
  imageUrl: string
  /** Live site or case-study URL. */
  url: string
}

export type ProjectsContent = {
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

/** One link in the top bar. `newTab` is only set for links that leave the site. */
export type NavLink = {
  label: string
  href: string
  newTab: boolean
}

/**
 * The navigation bar. `primaryLinks` render left of the brand on wide screens, `secondaryLinks`
 * right of it; on small screens they follow each other in that order.
 */
export type NavigationContent = {
  brand: string
  primaryLinks: NavLink[]
  secondaryLinks: NavLink[]
}

/**
 * An editor-written SEO value with its resolved image (Payload's SEO plugin `meta` group). Every
 * field is nullable so the metadata builders can fall back to what the document already says.
 */
export type SeoMeta = {
  title: string | null
  description: string | null
  /** The `og` crop when the media record has one, the original otherwise. */
  image: { url: string; width: number | null; height: number | null } | null
}

/** The maintenance switch the public layout reads, plus the identity the page shows. */
export type SiteSettingsContent = {
  siteName: string
  /** Site-wide SEO defaults, edited in Site settings → SEO. Empty fields fall back to `seo.ts`. */
  seo: SeoMeta
  /** `null` when unset: the maintenance page then hides its "Email us" link. */
  supportEmail: string | null
  maintenance: {
    enabled: boolean
    title: string
    message: string
  }
}

/** Everything the home page renders. Singletons may be `null` when unseeded. */
export type PortfolioContent = {
  header: HeaderContent | null
  about: AboutContent | null
  skills: SkillsContent
  experiences: ExperienceItem[]
  educations: EducationItem[]
  certificates: CertificateItem[]
  articles: ArticleItem[]
  services: ServicesContent
  projects: ProjectsContent
  footer: FooterContent | null
  navigation: NavigationContent
  settings: SiteSettingsContent
}
