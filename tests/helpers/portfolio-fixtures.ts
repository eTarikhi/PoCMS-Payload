/**
 * Shared Payload-shaped fixtures for the portfolio tests.
 *
 * Built from `src/app/(frontend)/data/database.json` by the same field mapping the seed uses, so the
 * mapper suite and the section suite check against one source of truth.
 */

import database from '../../src/app/(frontend)/data/database.json'
import type { RawPortfolioDocs } from '../../src/app/(frontend)/lib/mappers'
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
} from '../../src/payload-types'

export const legacy = database[0]

export const meta = {
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

/** Noon UTC, matching the seed convention for date-only values. */
export const noonUTC = (display: string): string =>
  new Date(`${display} 12:00:00 UTC`).toISOString()

export const mediaDoc = (url: string): Media => ({
  id: 900,
  alt: 'test',
  url,
  ...meta,
})

export type FooterPlatform = NonNullable<Footer['socialLinks']>[number]['platform']
export type FooterIconName = NonNullable<Footer['socialLinks']>[number]['iconName']
export type ContactType = NonNullable<Footer['contactInfo']>[number]['type']
export type ContactClass = NonNullable<NonNullable<Footer['contactInfo']>[number]['className']>

/** Builds Payload documents from the original JSON, using the same field mapping as the seed. */
export const toPayloadDocs = (): RawPortfolioDocs => {
  const header: Header = {
    id: 1,
    sureName: legacy.header.sureName,
    imageUrl: legacy.header.imageUrl,
    requestCV: legacy.header.requestCV,
    professionTexts: legacy.header.professionTexts,
    ...meta,
  }

  const about: About = {
    id: 1,
    title: 'About',
    experience: { ...legacy.about.experience },
    workPermit: { ...legacy.about.workPermit },
    uploadImages: null,
    images: legacy.about.images.map((imageUrl) => ({ imageUrl })),
    interests: {
      title: legacy.about.interests.title,
      description: legacy.about.interests.description,
      areas: legacy.about.interests.areas,
    },
    ...meta,
  }

  const skills: Skill[] = [
    ...legacy.skills.frontend.map((s, i): Skill => ({
      id: s.id,
      order: i,
      label: s.label,
      group: 'frontend',
      value: s.value,
      color: s.color as Skill['color'],
      ...meta,
    })),
    ...legacy.skills.backend.map((s, i): Skill => ({
      id: 100 + s.id,
      order: i,
      label: s.label,
      group: 'backend',
      value: s.value,
      color: s.color as Skill['color'],
      ...meta,
    })),
  ]

  const experiences: Experience[] = legacy.experiences.map((e, i) => ({
    id: e.id,
    order: i,
    title: e.title,
    date: e.date,
    company: e.company,
    ...meta,
  }))

  // The legacy `location` is "<institution> / <location>", so split it back into the two fields.
  const educations: Education[] = legacy.educations.map((e, i) => {
    const [institution, ...rest] = e.location.split(' / ')
    return {
      id: e.id,
      order: i,
      title: e.title,
      institution,
      location: rest.join(' / '),
      date: e.date,
      ...meta,
    }
  })

  const certificates: Certificate[] = legacy.certificates.map((c) => ({
    id: c.id,
    title: c.title,
    issuer: c.issuer,
    issuedAt: noonUTC(c.date),
    image: null,
    imageUrl: c.imageUrl,
    link: c.link,
    ...meta,
  }))

  const articles: Article[] = legacy.articles.map((a) => ({
    id: Number(a.id),
    title: a.title,
    excerpt: a.excerpt,
    publishedAt: noonUTC(a.author),
    readTime: Number.parseInt(a.readTime, 10),
    image: null,
    imageUrl: a.imageUrl,
    link: a.link,
    ...meta,
  }))

  const services: Service[] = legacy.services.items.map((s, i) => ({
    id: s.id,
    order: i,
    category: s.category,
    iconFont: s.iconFont as Service['iconFont'],
    descriptions: s.descriptions,
    ...meta,
  }))

  const projects: Project[] = legacy.projects.items.map((p, i) => ({
    id: p.id,
    order: i,
    title: p.alt,
    image: null,
    src: p.src,
    placeHolder: p.placeHolder,
    url: p.url,
    readMoreUrl: null,
    categories: p.class as Project['categories'],
    ...meta,
  }))

  const footer: Footer = {
    id: 1,
    roles: {
      fullName: legacy.footer.personalInfo.name,
      footerRoles: legacy.footer.personalInfo.skills.map((s) => s.title),
    },
    socialLinks: legacy.footer.socialLinks.map((s) => ({
      platform: s.name.toLowerCase() as FooterPlatform,
      url: s.url,
      iconName: s.iconName as FooterIconName,
      ariaLabel: s.ariaLabel,
    })),
    profiles: legacy.footer.profiles.map((p) => ({ name: p.name, url: p.url })),
    contactInfo: legacy.footer.contactInfo.map((c) => ({
      type: c.type as ContactType,
      iconName: c.iconName as FooterIconName,
      content: c.content,
      url: c.url,
      isLink: c.isLink,
      className: (c.className ?? 'text-white') as ContactClass,
    })),
    hiringCta: {
      label: legacy.services.hiring[0].title,
      url: legacy.services.hiring[0].link,
    },
    copyRight: {
      year: legacy.footer.copyright.year,
      website: legacy.footer.copyright.website,
      url: legacy.footer.copyright.url,
    },
    ...meta,
  }

  return {
    header,
    about,
    skills,
    experiences,
    educations,
    certificates,
    articles,
    services,
    projects,
    footer,
  }
}
