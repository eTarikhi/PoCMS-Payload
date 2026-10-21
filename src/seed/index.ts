import fs from 'fs/promises'
import path from 'path'
import type { Payload, PayloadRequest, File } from 'payload'

import { headerData } from './header.js'
import { aboutData } from './about.js'
import { skillsData } from './skills.js'
import { experiencesData } from './experiences.js'
import { educationsData } from './educations.js'
import { certificatesData } from './certificates.js'
import { articlesData } from './articles.js'
import { servicesData } from './services.js'
import { projectsData } from './projects.js'
import { footerData } from './footer.js'
import { navigationData } from './navigation.js'
import { siteSettingsData } from './siteSettings.js'

const collections = [
  'header',
  'about',
  'skills',
  'experiences',
  'educations',
  'certificates',
  'articles',
  'services',
  'projects',
  'media',
  // Payload's folder collection (media folders, beta). After media: it holds the relations.
  'payload-folders',
] as const

/**
 * Database seed function
 * Clears existing data and populates the database with portfolio information
 */
export const seed = async ({
  payload,
  req,
}: {
  payload: Payload
  req: PayloadRequest
}): Promise<void> => {
  payload.logger.info('🌱 Seeding portfolio database...')

  payload.logger.info(`— Clearing collections...`)

  // Clear all collections
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

  payload.logger.info(`— Seeding media and images...`)

  let profileImage: any = null

  try {
    const profileImageBuffer = await fetchFileByURL(
      '/images/profile.webp',
    )

    profileImage = await payload.create({
      collection: 'media',
      data: {
        alt: 'Amir v.Tarikhi Profile Picture',
      },
      file: profileImageBuffer,
      overrideAccess: true,
      context: { skipAudit: true },
    })
    payload.logger.info(`  ✓ Profile image seeded (ID: ${profileImage.id})`)
  } catch (error) {
    payload.logger.warn(`  Could not seed profile image: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding header section...`)

  try {
    const header = await payload.create({
      collection: 'header',
      data: headerData(profileImage),
      overrideAccess: true,
      context: { skipAudit: true },
    })
    payload.logger.info(`  ✓ Header seeded (ID: ${header.id})`)
  } catch (error) {
    payload.logger.error(`  Failed to seed header: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding media folders...`)

  const folders: Record<'projects' | 'articles' | 'certificates', number> = {
    projects: 0,
    articles: 0,
    certificates: 0,
  }

  try {
    // Folders group the media library by where the images are used. The folder browser in the admin
    // (/admin/browse-by-folder) reads them, and the media list gains a Folder column.
    for (const [name, key] of [
      ['Project covers', 'projects'],
      ['Article covers', 'articles'],
      ['Certificates', 'certificates'],
    ] as const) {
      const folder = await payload.create({
        collection: 'payload-folders',
        data: { name, folderType: ['media'] } as never,
        overrideAccess: true,
        context: { skipAudit: true },
      })
      folders[key] = folder.id
    }
    payload.logger.info(`  ✓ ${Object.keys(folders).length} media folders seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed media folders: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding about section...`)

  try {
    const about = await payload.create({
      collection: 'about',
      data: aboutData(),
      overrideAccess: true,
      context: { skipAudit: true },
    })
    payload.logger.info(`  ✓ About seeded (ID: ${about.id})`)
  } catch (error) {
    payload.logger.error(`  Failed to seed about: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding skills...`)

  try {
    // One at a time: Skills is orderable, and Payload appends each new document by reading the
    // highest `_order`, so parallel creates would give the list an arbitrary order.
    let seededSkills = 0
    for (const skill of skillsData()) {
      await payload.create({
        collection: 'skills',
        data: skill,
        overrideAccess: true,
        context: { skipAudit: true },
      })
      seededSkills += 1
    }
    payload.logger.info(`  ✓ ${seededSkills} skills seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed skills: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding experiences...`)

  try {
    // One at a time: the collection is orderable, and Payload appends each new document by reading
    // the highest `_order`, so parallel creates would give the list an arbitrary order.
    let seededExperiences = 0
    for (const experience of experiencesData()) {
      await payload.create({
        collection: 'experiences',
        data: experience,
        overrideAccess: true,
        context: { skipAudit: true },
      })
      seededExperiences += 1
    }
    payload.logger.info(`  ✓ ${seededExperiences} experiences seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed experiences: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding educations...`)

  try {
    // Sequential for the same reason as experiences: orderable collections append on create.
    let seededEducations = 0
    for (const education of educationsData()) {
      await payload.create({
        collection: 'educations',
        data: education,
        overrideAccess: true,
        context: { skipAudit: true },
      })
      seededEducations += 1
    }
    payload.logger.info(`  ✓ ${seededEducations} educations seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed educations: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding certificates...`)

  try {
    const certificatesResults = await Promise.allSettled(
      certificatesData().map(async (certificate) => {
        try {
          const image = await createMediaFromURL(
            payload,
            certificate.imageUrl,
            certificate.title,
            folders.certificates || undefined,
          )
          return await payload.create({
            collection: 'certificates',
            data: {
              title: certificate.title,
              issuer: certificate.issuer,
              issuedAt: certificate.issuedAt,
              link: certificate.link,
              image,
            },
            overrideAccess: true,
            context: { skipAudit: true },
          })
        } catch (error) {
          payload.logger.warn(
            `  Could not seed certificate "${certificate.title}": ${error instanceof Error ? error.message : String(error)}`,
          )
          // Create without image as fallback
          return await payload.create({
            collection: 'certificates',
            data: {
              title: certificate.title,
              issuer: certificate.issuer,
              issuedAt: certificate.issuedAt,
              link: certificate.link,
              imageUrl: certificate.imageUrl,
            },
            overrideAccess: true,
            context: { skipAudit: true },
          })
        }
      }),
    )
    const successful = certificatesResults.filter((r) => r.status === 'fulfilled').length
    payload.logger.info(`  ✓ ${successful} certificates seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed certificates: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding articles...`)

  try {
    const articlesResults = await Promise.allSettled(
      articlesData().map(async (article) => {
        try {
          const image = await createMediaFromURL(
            payload,
            article.imageUrl,
            article.title,
            folders.articles || undefined,
          )
          return await payload.create({
            collection: 'articles',
            data: {
              title: article.title,
              excerpt: article.excerpt,
              category: article.category as 'articles' | 'others',
              publishedAt: article.publishedAt,
              readTime: article.readTime,
              link: article.link,
              image,
              // Drafts are on for Articles, so a document created without a status is a draft and
              // would not appear on the site: the sample content has to be published.
              _status: 'published' as const,
            },
            overrideAccess: true,
            context: { skipAudit: true },
          })
        } catch (error) {
          payload.logger.warn(
            `  Could not seed article "${article.title}": ${error instanceof Error ? error.message : String(error)}`,
          )
          // Create without image as fallback
          return await payload.create({
            collection: 'articles',
            data: {
              title: article.title,
              excerpt: article.excerpt,
              category: article.category as 'articles' | 'others',
              publishedAt: article.publishedAt,
              readTime: article.readTime,
              link: article.link,
              imageUrl: article.imageUrl,
              _status: 'published' as const,
            },
            overrideAccess: true,
            context: { skipAudit: true },
          })
        }
      }),
    )
    const successful = articlesResults.filter((r) => r.status === 'fulfilled').length
    payload.logger.info(`  ✓ ${successful} articles seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed articles: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding services...`)

  try {
    // Sequential for the same reason as experiences: orderable collections append on create.
    let seededServices = 0
    for (const service of servicesData()) {
      await payload.create({
        collection: 'services',
        data: service,
        overrideAccess: true,
        context: { skipAudit: true },
      })
      seededServices += 1
    }
    payload.logger.info(`  ✓ ${seededServices} services seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed services: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding projects...`)

  try {
    // Images in parallel, documents one at a time: Projects is orderable and Payload appends each
    // new document by reading the highest `_order`.
    const prepared = await Promise.all(
      projectsData().map(async (project) => ({
        project,
        image: await createMediaFromURL(
          payload,
          project.src,
          project.title,
          folders.projects || undefined,
        ).catch(() => undefined),
      })),
    )

    let seededProjects = 0
    for (const { project, image } of prepared) {
      const data = {
        title: project.title,
        url: project.url,
        readMoreUrl: project.readMoreUrl,
        categories: project.categories as ('front-end' | 'back-end' | 'cms-crm')[],
        placeHolder: project.placeHolder,
        src: project.src,
      }
      try {
        await payload.create({
          collection: 'projects',
          data: image ? { ...data, image } : data,
          overrideAccess: true,
          context: { skipAudit: true },
        })
      } catch (error) {
        if (!image) {
          payload.logger.warn(
            `  Could not seed project "${project.title}": ${error instanceof Error ? error.message : String(error)}`,
          )
          continue
        }
        // The image is optional on the site: keep the project, drop the file that failed.
        payload.logger.warn(
          `  Could not seed project "${project.title}" with its image: ${error instanceof Error ? error.message : String(error)}`,
        )
        try {
          await payload.create({
            collection: 'projects',
            data,
            overrideAccess: true,
            context: { skipAudit: true },
          })
        } catch (fallbackError) {
          payload.logger.warn(
            `  Could not seed project "${project.title}": ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          )
          continue
        }
      }
      seededProjects += 1
    }
    payload.logger.info(`  ✓ ${seededProjects} projects seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed projects: ${error instanceof Error ? error.message : String(error)}`)
  }

  payload.logger.info(`— Seeding footer global...`)

  try {
    await payload.updateGlobal({
      slug: 'footer',
      data: footerData(),
      overrideAccess: true,
      context: { skipAudit: true },
    })
    payload.logger.info(`  ✓ Footer seeded`)
  } catch (error) {
    payload.logger.error(`  Failed to seed footer: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Navigation and site settings: saved here so the admin shows a filled-in form instead of an
  // empty global. The public site renders the same values from its fallbacks before seeding.
  payload.logger.info(`— Seeding navigation and site settings globals...`)
  for (const [slug, data] of [
    ['navigation', navigationData()],
    ['site-settings', siteSettingsData()],
  ] as const) {
    try {
      await payload.updateGlobal({
        slug,
        // The two globals have different shapes; the tuple above keeps each call typed to its own.
        data: data as never,
        overrideAccess: true,
        context: { skipAudit: true },
      })
      payload.logger.info(`  ✓ ${slug} seeded`)
    } catch (error) {
      payload.logger.error(
        `  Failed to seed ${slug}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  payload.logger.info('✅ Portfolio database seeded successfully!')
}

const MIME_TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

/**
 * Uploads the image at `url` to the `media` collection and returns the new document ID,
 * so seeded documents reference a real upload (thumbnails in the admin, `image` relations).
 */
async function createMediaFromURL(
  payload: Payload,
  url: string,
  alt: string,
  folder?: number,
): Promise<number> {
  const file = await fetchFileByURL(url)
  const media = await payload.create({
    collection: 'media',
    data: { alt, ...(folder ? { folder } : {}) } as never,
    file,
    overrideAccess: true,
    context: { skipAudit: true },
  })
  return media.id
}

/**
 * Loads a file for seeding.
 *
 * - Root-relative paths (`/images/profile.webp`) are read from this repository's `public/` folder,
 *   so `pnpm seed` works offline and without a running server.
 * - Absolute URLs are downloaded.
 */
async function fetchFileByURL(url: string): Promise<File> {
  try {
    const filename = url.split('/').pop()?.split('?')[0] || `file-${Date.now()}`
    const extension = filename.split('.').pop()?.toLowerCase() || 'webp'

    let data: Buffer
    if (url.startsWith('/')) {
      const publicDir = path.join(process.cwd(), 'public')
      const filePath = path.normalize(path.join(publicDir, url))
      if (!filePath.startsWith(publicDir)) {
        throw new Error(`Refusing to read outside public/: ${url}`)
      }
      data = await fs.readFile(filePath)
    } else {
      const res = await fetch(url, { method: 'GET' })
      if (!res.ok) {
        throw new Error(`Failed to fetch file from ${url}, status: ${res.status}`)
      }
      data = Buffer.from(await res.arrayBuffer())
    }

    return {
      name: filename,
      data,
      mimetype: MIME_TYPES[extension] ?? `image/${extension}`,
      size: data.byteLength,
    }
  } catch (error) {
    throw new Error(
      `Error fetching file from ${url}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
