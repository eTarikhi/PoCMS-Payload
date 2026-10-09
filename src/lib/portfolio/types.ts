/**
 * Framework-free view models for the portfolio site.
 *
 * These are the only shapes the presentational components in
 * `src/components/portfolio/*` are allowed to depend on. They mirror the props
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
}
