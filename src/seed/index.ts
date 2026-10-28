import fs from 'node:fs/promises'
import path from 'node:path'
import type { File, Payload, PayloadRequest } from 'payload'
import { generateNKeysBetween } from 'payload/shared'

import type { Media } from '@/payload-types'

import { aboutData } from './about.js'
import { articlesData } from './articles.js'
import { certificatesData } from './certificates.js'
import { educationsData } from './educations.js'
import { experiencesData } from './experiences.js'
import { footerData } from './footer.js'
import { headerData } from './header.js'
import { navigationData } from './navigation.js'
import { projectsData } from './projects.js'
import { servicesData } from './services.js'
import { siteSettingsData } from './siteSettings.js'
import { skillsData } from './skills.js'

const collections = [
  'about',
  'skills',
  'experiences',
  'educations',
  'certificates',
  'articles',
  'services',
  'projects',
  'media',
] as const

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  gif: 'image/gif',
}

/**
 * Database seed function.
 * Clears existing content and populates collections and globals with portfolio data.
 */
export const seed = async ({
  payload,
  req,
}: {
  payload: Payload
  req: PayloadRequest
}): Promise<void> => {
  const seedContext = { skipRevalidate: true, skipAuditLog: true }
  payload.logger.info('🌱 Seeding portfolio database...')

  payload.logger.info('— Clearing collections...')

  for (const collection of collections) {
    try {
      await payload.db.deleteMany({ collection, req, where: {} })
      if (payload.collections[collection]?.config.versions) {
        await payload.db.deleteVersions({ collection, req, where: {} })
      }
      payload.logger.info(`  ✓ Cleared ${collection}`)
    } catch (error) {
      payload.logger.warn(
        `  Could not clear ${collection}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const createMediaFromSource = async (source: string, alt: string): Promise<Media | null> => {
    try {
      const file = await loadSeedFile(source)
      return await payload.create({
        collection: 'media',
        data: { alt },
        file,
        overrideAccess: true,
        context: seedContext,
      })
    } catch (error) {
      payload.logger.warn(
        `  Could not seed media "${source}": ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  payload.logger.info('— Seeding media and images...')
  const profileImage = await createMediaFromSource(
    '/images/profile.webp',
    'Amir v.Tarikhi Profile Picture',
  )
  if (profileImage) {
    payload.logger.info(`  ✓ Profile image seeded (ID: ${profileImage.id})`)
  }

  payload.logger.info('— Seeding header global...')
  try {
    await payload.updateGlobal({
      slug: 'header',
      data: headerData(profileImage),
      overrideAccess: true,
      context: seedContext,
    })
    payload.logger.info('  ✓ Header global seeded')
  } catch (error) {
    payload.logger.error(
      `  Failed to seed header: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding about section...')
  try {
    const about = await payload.create({
      collection: 'about',
      data: aboutData(),
      overrideAccess: true,
      context: seedContext,
    })
    payload.logger.info(`  ✓ About seeded (ID: ${about.id})`)
  } catch (error) {
    payload.logger.error(
      `  Failed to seed about: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding skills...')
  try {
    const skills = skillsData()
    const skillOrders = generateNKeysBetween(null, null, skills.length)
    let count = 0
    for (let index = 0; index < skills.length; index++) {
      await payload.create({
        collection: 'skills',
        data: { ...skills[index], _order: skillOrders[index] },
        overrideAccess: true,
        context: seedContext,
      })
      count++
    }
    payload.logger.info(`  ✓ ${count} skills seeded`)
  } catch (error) {
    payload.logger.error(
      `  Failed to seed skills: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding experiences...')
  try {
    const experiences = experiencesData()
    const experienceOrders = generateNKeysBetween(null, null, experiences.length)
    let count = 0
    for (let index = 0; index < experiences.length; index++) {
      await payload.create({
        collection: 'experiences',
        data: { ...experiences[index], _order: experienceOrders[index] },
        overrideAccess: true,
        context: seedContext,
      })
      count++
    }
    payload.logger.info(`  ✓ ${count} experiences seeded`)
  } catch (error) {
    payload.logger.error(
      `  Failed to seed experiences: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding educations...')
  try {
    const educations = educationsData()
    const educationOrders = generateNKeysBetween(null, null, educations.length)
    let count = 0
    for (let index = 0; index < educations.length; index++) {
      await payload.create({
        collection: 'educations',
        data: { ...educations[index], _order: educationOrders[index] },
        overrideAccess: true,
        context: seedContext,
      })
      count++
    }
    payload.logger.info(`  ✓ ${count} educations seeded`)
  } catch (error) {
    payload.logger.error(
      `  Failed to seed educations: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding certificates...')
  try {
    const certificatesResults = await Promise.allSettled(
      certificatesData().map(async (certificate) => {
        const media = await createMediaFromSource(certificate.imageUrl, certificate.title)
        return payload.create({
          collection: 'certificates',
          data: {
            title: certificate.title,
            issuer: certificate.issuer,
            issuedAt: certificate.issuedAt,
            link: certificate.link,
            ...(media ? { image: media.id } : { imageUrl: certificate.imageUrl }),
          },
          overrideAccess: true,
          context: seedContext,
        })
      }),
    )
    const successful = certificatesResults.filter((r) => r.status === 'fulfilled').length
    payload.logger.info(`  ✓ ${successful} certificates seeded`)
  } catch (error) {
    payload.logger.error(
      `  Failed to seed certificates: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding articles...')
  try {
    const articlesResults = await Promise.allSettled(
      articlesData().map(async (article) => {
        const media = await createMediaFromSource(article.imageUrl, article.title)
        return payload.create({
          collection: 'articles',
          data: {
            _status: 'published',
            title: article.title,
            excerpt: article.excerpt,
            featured: Boolean(article.featured),
            category: article.category as 'articles' | 'others',
            publishedAt: article.publishedAt,
            readTime: article.readTime,
            link: article.link,
            ...(article.content ? { content: article.content as never } : {}),
            ...(media ? { image: media.id } : { imageUrl: article.imageUrl }),
          },
          overrideAccess: true,
          context: seedContext,
        })
      }),
    )
    const successful = articlesResults.filter((r) => r.status === 'fulfilled').length
    payload.logger.info(`  ✓ ${successful} articles seeded`)
  } catch (error) {
    payload.logger.error(
      `  Failed to seed articles: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding services...')
  try {
    const services = servicesData()
    const serviceOrders = generateNKeysBetween(null, null, services.length)
    let count = 0
    for (let index = 0; index < services.length; index++) {
      await payload.create({
        collection: 'services',
        data: { ...services[index], _order: serviceOrders[index] },
        overrideAccess: true,
        context: seedContext,
      })
      count++
    }
    payload.logger.info(`  ✓ ${count} services seeded`)
  } catch (error) {
    payload.logger.error(
      `  Failed to seed services: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding projects...')
  try {
    const projects = projectsData()
    const projectOrders = generateNKeysBetween(null, null, projects.length)
    let successful = 0
    for (let index = 0; index < projects.length; index++) {
      const project = projects[index]
      try {
        const media = await createMediaFromSource(project.src, project.title)
        await payload.create({
          collection: 'projects',
          data: {
            _status: 'published',
            title: project.title,
            excerpt: 'excerpt' in project ? project.excerpt : undefined,
            role: 'role' in project ? project.role : undefined,
            client: 'client' in project ? project.client : undefined,
            year: 'year' in project ? project.year : undefined,
            techStack: 'techStack' in project ? project.techStack : undefined,
            content: 'content' in project && project.content ? (project.content as never) : undefined,
            url: project.url,
            readMoreUrl: project.readMoreUrl,
            categories: project.categories as ('front-end' | 'back-end' | 'cms-crm')[],
            placeHolder: project.placeHolder,
            src: project.src,
            _order: projectOrders[index],
            ...(media ? { image: media.id } : {}),
          },
          overrideAccess: true,
          context: seedContext,
        })
        successful++
      } catch (projectError) {
        payload.logger.warn(
          `  Could not seed project "${project.title}": ${projectError instanceof Error ? projectError.message : String(projectError)}`,
        )
      }
    }
    payload.logger.info(`  ✓ ${successful} projects seeded`)
  } catch (error) {
    payload.logger.error(
      `  Failed to seed projects: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('— Seeding site-settings, navigation and footer globals...')
  try {
    await payload.updateGlobal({
      slug: 'site-settings',
      data: siteSettingsData(profileImage),
      overrideAccess: true,
      context: seedContext,
    })
    payload.logger.info('  ✓ Site settings seeded')
  } catch (error) {
    payload.logger.error(
      `  Failed to seed site-settings: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  try {
    await payload.updateGlobal({
      slug: 'navigation',
      data: navigationData(),
      overrideAccess: true,
      context: seedContext,
    })
    payload.logger.info('  ✓ Navigation seeded')
  } catch (error) {
    payload.logger.error(
      `  Failed to seed navigation: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  try {
    await payload.updateGlobal({
      slug: 'footer',
      data: footerData(),
      overrideAccess: true,
      context: seedContext,
    })
    payload.logger.info('  ✓ Footer seeded')
  } catch (error) {
    payload.logger.error(
      `  Failed to seed footer: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  payload.logger.info('✅ Portfolio database seeded successfully!')
}

/**
 * Loads a seed file either from `public/` (when starting with `/`) or over HTTP(S).
 */
async function loadSeedFile(source: string): Promise<File> {
  const filename = path.posix.basename(source) || `file-${Date.now()}.webp`
  const extension = path.posix.extname(filename).replace(/^\./, '').toLowerCase() || 'webp'
  const mimetype = MIME_BY_EXT[extension] ?? `image/${extension}`

  if (source.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', source.replace(/^\/+/, ''))
    const buffer = await fs.readFile(filePath)
    return {
      name: filename,
      data: buffer,
      mimetype,
      size: buffer.byteLength,
    }
  }

  const res = await fetch(source, { credentials: 'include', method: 'GET' })
  if (!res.ok) {
    throw new Error(`Failed to fetch file from ${source}, status: ${res.status}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return {
    name: filename,
    data: buffer,
    mimetype,
    size: buffer.byteLength,
  }
}
