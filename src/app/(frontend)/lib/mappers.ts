/**
 * Pure mappers from Payload documents to portfolio view models.
 *
 * Rules:
 * - No I/O, no Payload runtime import (types only). These functions are unit-testable
 *   without a database.
 * - Mappers preserve the order of the input array. Sorting is the responsibility of the
 *   query (see `payload-source.ts`), so the database stays the single source of order.
 * - Every field that the original site rendered is produced here, with the same text.
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
  Project,
  Service,
  Skill,
} from '@/payload-types'

import { articlePagePath, hasArticlePage } from './article-page'
import { formatDisplayDate, formatReadTime, joinDisplay } from './format'
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
  PortfolioContent,
  ProjectFilter,
  ProjectItem,
  ProjectsContent,
  ServiceItem,
  ServicesContent,
  SkillBar,
  SkillsContent,
} from './types'

/**
 * Raw documents as returned by the data source. Singletons are `null` when absent.
 */
export type RawPortfolioDocs = {
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

/**
 * Project filter bar. The original site defines these in `database.json`
 * (`projects.categories`). They are kept in code because `All Projects` is a UI-only entry.
 * The `value`s must match the `categories` select options in `src/collections/Projects.ts`.
 * A unit test asserts this equivalence against the original data.
 */
export const PROJECT_FILTERS: ProjectFilter[] = [
  { label: 'All Projects', value: '*' },
  { label: 'Front-End', value: 'front-end' },
  { label: 'Back-End', value: 'back-end' },
  { label: 'CMS-CRM', value: 'cms-crm' },
]

/** Returns the resolved URL of an upload, or `null` when the relation is not populated. */
export const resolveMediaUrl = (media: number | Media | null | undefined): string | null => {
  if (!media || typeof media !== 'object') return null
  return media.url ?? null
}

const idToString = (id: number | string): string => String(id)

const withFallback = (value: string | null | undefined, fallback: string): string =>
  value && value.length > 0 ? value : fallback

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

  // Uploads win when present. The text URL list is the legacy fallback.
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

/**
 * The original row shows `"<institution> / <location>"` in the subtitle line.
 * Payload stores these as two fields, so they are joined here to keep the same text.
 */
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
 * `author` is the publication date, because the original site printed the date in
 * that field. `readTime` is stored as minutes and rendered as "<n> min".
 */
export const mapArticles = (docs: Article[]): ArticleItem[] =>
  docs.map((doc) => ({
    id: idToString(doc.id),
    title: doc.title,
    excerpt: doc.excerpt,
    author: formatDisplayDate(doc.publishedAt),
    readTime: formatReadTime(doc.readTime),
    imageUrl: resolveMediaUrl(doc.image) ?? withFallback(doc.imageUrl, ''),
    link: doc.link,
    pagePath: doc.slug && hasArticlePage(doc) ? articlePagePath(doc.slug) : null,
  }))

export const mapServices = (docs: Service[], hiringCta: HiringCta | null): ServicesContent => ({
  items: docs.map((doc): ServiceItem => ({
    id: idToString(doc.id),
    category: doc.category,
    iconFont: withFallback(doc.iconFont, ''),
    descriptions: doc.descriptions ?? [],
  })),
  hiring: hiringCta,
})

/**
 * The thumbnail is the legacy `placeHolder` URL, and falls back to the upload.
 * Payload's `media.sizes` is not configured yet (see the migration analysis, F-10).
 */
export const mapProjects = (docs: Project[]): ProjectsContent => ({
  filters: PROJECT_FILTERS,
  items: docs.map((doc): ProjectItem => {
    const uploadUrl = resolveMediaUrl(doc.image)
    return {
      id: idToString(doc.id),
      title: doc.title,
      categories: doc.categories ?? [],
      thumbnailUrl: withFallback(doc.placeHolder, uploadUrl ?? ''),
      imageUrl: uploadUrl ?? withFallback(doc.src, ''),
      url: withFallback(doc.url, '#'),
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
    fullName: doc.roles.fullName,
    roles: doc.roles.footerRoles ?? [],
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
      year: doc.copyRight.year,
      website: withFallback(doc.copyRight.website, ''),
      url: doc.copyRight.url,
    },
  }
}

/** Hiring CTA lives in the Footer global (decision D-3). Empty label or URL means no CTA. */
export const mapHiringCta = (doc: Footer | null): HiringCta | null => {
  const label = doc?.hiringCta?.label
  const url = doc?.hiringCta?.url
  if (!label || !url) return null
  return { label, url }
}

/** Builds the full home-page view model from raw documents. Pure and deterministic. */
export const mapPortfolioContent = (raw: RawPortfolioDocs): PortfolioContent => ({
  header: mapHeader(raw.header),
  about: mapAbout(raw.about),
  skills: mapSkills(raw.skills),
  experiences: mapExperiences(raw.experiences),
  educations: mapEducations(raw.educations),
  certificates: mapCertificates(raw.certificates),
  articles: mapArticles(raw.articles),
  services: mapServices(raw.services, mapHiringCta(raw.footer)),
  projects: mapProjects(raw.projects),
  footer: mapFooter(raw.footer),
})
