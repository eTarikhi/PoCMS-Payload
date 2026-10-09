/**
 * Parity tests for the portfolio data layer.
 *
 * The original site's text is the oracle. Each Payload-shaped fixture below is built from
 * `src/app/(frontend)/data/database.json` by the same field mapping the seed uses, and the
 * mapped view models are compared against the original strings.
 *
 * These tests do not need a database. They exercise the pure mappers only.
 */

import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { Projects } from '../../src/collections/Projects'
import { legacy, mediaDoc, toPayloadDocs } from '../helpers/portfolio-fixtures'
import { formatDisplayDate, formatReadTime, joinDisplay } from '../../src/app/(frontend)/lib/format'
import {
  mapAbout,
  mapArticles,
  mapCertificates,
  mapEducations,
  mapExperiences,
  mapFooter,
  mapHeader,
  mapPortfolioContent,
  mapProjects,
  mapServices,
  mapSkills,
  PROJECT_FILTERS,
  type RawPortfolioDocs,
} from '../../src/app/(frontend)/lib/mappers'
const raw = toPayloadDocs()

describe('display formatting', () => {
  it('formats ISO dates as "MMMM d, yyyy" in UTC', () => {
    expect(formatDisplayDate('2025-02-02T12:00:00.000Z')).toBe('February 2, 2025')
    expect(formatDisplayDate('2025-01-01T00:00:00.000Z')).toBe('January 1, 2025')
  })

  it('returns an empty string for empty or invalid dates', () => {
    expect(formatDisplayDate(null)).toBe('')
    expect(formatDisplayDate('not-a-date')).toBe('')
  })

  it('formats read time as "<n> min" and drops non-positive values', () => {
    expect(formatReadTime(3)).toBe('3 min')
    expect(formatReadTime(0)).toBe('')
    expect(formatReadTime(null)).toBe('')
  })

  it('joins non-empty parts with " / "', () => {
    expect(joinDisplay(['Payam-e Nur University', null, '', 'Tabriz'])).toBe(
      'Payam-e Nur University / Tabriz',
    )
  })
})

describe('header and about', () => {
  it('maps the hero text and CTA exactly as in the original data', () => {
    const header = mapHeader(raw.header)
    expect(header?.sureName).toBe(legacy.header.sureName)
    expect(header?.professionTexts).toEqual(legacy.header.professionTexts)
    expect(header?.requestCV).toBe(legacy.header.requestCV)
    expect(header?.imageUrl).toBe(legacy.header.imageUrl)
  })

  it('prefers the Payload upload URL over the legacy text URL', () => {
    const header = mapHeader({
      ...raw.header!,
      profileImage: mediaDoc('/api/media/file/profile.webp'),
    })
    expect(header?.imageUrl).toBe('/api/media/file/profile.webp')
  })

  it('maps experience, work permit and interests exactly as in the original data', () => {
    const about = mapAbout(raw.about)
    expect(about?.experience).toEqual(legacy.about.experience)
    expect(about?.workPermit).toEqual(legacy.about.workPermit)
    expect(about?.interests).toEqual(legacy.about.interests)
    expect(about?.images).toEqual(legacy.about.images)
  })

  it('prefers uploads over the legacy image URL list when both are present', () => {
    const about = mapAbout({ ...raw.about!, uploadImages: [mediaDoc('/api/media/file/a.jpg')] })
    expect(about?.images).toEqual(['/api/media/file/a.jpg'])
  })
})

describe('skills, experience and education', () => {
  it('groups skills by group and preserves their order', () => {
    const skills = mapSkills(raw.skills)
    expect(skills.frontend.map(({ label, value, color }) => ({ label, value, color }))).toEqual(
      legacy.skills.frontend.map(({ label, value, color }) => ({ label, value, color })),
    )
    expect(skills.backend.map(({ label, value, color }) => ({ label, value, color }))).toEqual(
      legacy.skills.backend.map(({ label, value, color }) => ({ label, value, color })),
    )
  })

  it('maps experiences exactly as in the original data', () => {
    const items = mapExperiences(raw.experiences)
    expect(items.map(({ title, date, company }) => ({ title, date, company }))).toEqual(
      legacy.experiences.map(({ title, date, company }) => ({ title, date, company })),
    )
  })

  it('renders education location as "<institution> / <location>", as in the original data', () => {
    const items = mapEducations(raw.educations)
    expect(items.map((e) => e.location)).toEqual(legacy.educations.map((e) => e.location))
    expect(items.map((e) => e.title)).toEqual(legacy.educations.map((e) => e.title))
    expect(items.map((e) => e.date)).toEqual(legacy.educations.map((e) => e.date))
  })
})

describe('certificates and articles', () => {
  it('formats certificate dates as in the original data', () => {
    const items = mapCertificates(raw.certificates)
    expect(items.map((c) => c.date)).toEqual(legacy.certificates.map((c) => c.date))
    expect(items.map((c) => ({ title: c.title, issuer: c.issuer, link: c.link }))).toEqual(
      legacy.certificates.map((c) => ({ title: c.title, issuer: c.issuer, link: c.link })),
    )
  })

  it('shows the publication date as "author" and read time as "<n> min"', () => {
    const items = mapArticles(raw.articles)
    expect(items.map((a) => a.author)).toEqual(legacy.articles.map((a) => a.author))
    expect(items.map((a) => a.readTime)).toEqual(legacy.articles.map((a) => a.readTime))
    expect(items.map((a) => a.link)).toEqual(legacy.articles.map((a) => a.link))
  })

  it('preserves the order given by the query (no re-sorting in the mapper)', () => {
    const reversed = [...raw.articles].reverse()
    expect(mapArticles(reversed).map((a) => a.id)).toEqual(reversed.map((a) => String(a.id)))
  })
})

describe('services and hiring CTA', () => {
  it('maps service cards exactly as in the original data', () => {
    const { items } = mapServices(raw.services, null)
    expect(
      items.map(({ category, iconFont, descriptions }) => ({ category, iconFont, descriptions })),
    ).toEqual(
      legacy.services.items.map(({ category, iconFont, descriptions }) => ({
        category,
        iconFont,
        descriptions,
      })),
    )
  })

  it('takes the hiring CTA from the footer global', () => {
    const content = mapPortfolioContent(raw)
    expect(content.services.hiring).toEqual({
      label: legacy.services.hiring[0].title,
      url: legacy.services.hiring[0].link,
    })
  })

  it('returns no hiring CTA when the label or URL is missing', () => {
    const content = mapPortfolioContent({
      ...raw,
      footer: { ...raw.footer!, hiringCta: { label: 'Hire', url: '' } },
    })
    expect(content.services.hiring).toBeNull()
  })
})

describe('projects', () => {
  it('keeps the filter bar in sync with the original categories', () => {
    expect(PROJECT_FILTERS).toEqual(
      legacy.projects.categories.map((c) => ({ label: c.category, value: c.class })),
    )
  })

  it('keeps the filter values in sync with the Payload Projects.categories options', () => {
    const field = Projects.fields.find((f: Field) => 'name' in f && f.name === 'categories')
    const optionValues =
      field && 'options' in field
        ? field.options.map((option: string | { value: string }) =>
            typeof option === 'string' ? option : option.value,
          )
        : []
    expect(PROJECT_FILTERS.filter((f) => f.value !== '*').map((f) => f.value)).toEqual(optionValues)
  })

  it('maps project cards exactly as in the original data', () => {
    const { items } = mapProjects(raw.projects)
    expect(items.map((p) => p.title)).toEqual(legacy.projects.items.map((p) => p.alt))
    expect(items.map((p) => p.thumbnailUrl)).toEqual(
      legacy.projects.items.map((p) => p.placeHolder),
    )
    expect(items.map((p) => p.imageUrl)).toEqual(legacy.projects.items.map((p) => p.src))
    expect(items.map((p) => p.url)).toEqual(legacy.projects.items.map((p) => p.url))
    expect(items.map((p) => p.categories)).toEqual(legacy.projects.items.map((p) => p.class))
  })

  it('uses the upload for the full image when present, and keeps the legacy thumbnail', () => {
    const { items } = mapProjects([
      { ...raw.projects[0], image: mediaDoc('/api/media/file/full.webp') },
    ])
    expect(items[0].imageUrl).toBe('/api/media/file/full.webp')
    expect(items[0].thumbnailUrl).toBe(legacy.projects.items[0].placeHolder)
  })
})

describe('footer', () => {
  it('maps the footer exactly as in the original data', () => {
    const footer = mapFooter(raw.footer)
    expect(footer?.fullName).toBe(legacy.footer.personalInfo.name)
    expect(footer?.roles).toEqual(legacy.footer.personalInfo.skills.map((s) => s.title))
    expect(
      footer?.socialLinks.map(({ url, iconName, ariaLabel }) => ({ url, iconName, ariaLabel })),
    ).toEqual(
      legacy.footer.socialLinks.map(({ url, iconName, ariaLabel }) => ({
        url,
        iconName,
        ariaLabel,
      })),
    )
    expect(footer?.profiles).toEqual(legacy.footer.profiles)
    expect(
      footer?.contactInfo.map((c) => ({
        type: c.type,
        content: c.content,
        url: c.url,
        isLink: c.isLink,
      })),
    ).toEqual(
      legacy.footer.contactInfo.map((c) => ({
        type: c.type,
        content: c.content,
        url: c.url ?? null,
        isLink: Boolean(c.isLink),
      })),
    )
    expect(footer?.copyright).toEqual(legacy.footer.copyright)
  })
})

describe('whole-page composition', () => {
  it('returns empty but well-formed content when nothing is seeded', () => {
    const empty: RawPortfolioDocs = {
      header: null,
      about: null,
      skills: [],
      experiences: [],
      educations: [],
      certificates: [],
      articles: [],
      services: [],
      projects: [],
      footer: null,
    }
    const content = mapPortfolioContent(empty)
    expect(content.header).toBeNull()
    expect(content.about).toBeNull()
    expect(content.footer).toBeNull()
    expect(content.services).toEqual({ items: [], hiring: null })
    expect(content.projects).toEqual({ filters: PROJECT_FILTERS, items: [] })
  })

  it('composes every section from the raw documents', () => {
    const content = mapPortfolioContent(raw)
    expect(content.header?.sureName).toBe(legacy.header.sureName)
    expect(content.about?.experience.years).toBe(legacy.about.experience.years)
    expect(content.skills.frontend).toHaveLength(legacy.skills.frontend.length)
    expect(content.experiences).toHaveLength(legacy.experiences.length)
    expect(content.educations).toHaveLength(legacy.educations.length)
    expect(content.certificates).toHaveLength(legacy.certificates.length)
    expect(content.articles).toHaveLength(legacy.articles.length)
    expect(content.services.items).toHaveLength(legacy.services.items.length)
    expect(content.projects.items).toHaveLength(legacy.projects.items.length)
    expect(content.footer?.copyright.year).toBe(legacy.footer.copyright.year)
  })
})
