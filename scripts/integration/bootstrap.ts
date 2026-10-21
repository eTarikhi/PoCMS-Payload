import { assertIntegrationEnvironment } from './safety'

assertIntegrationEnvironment()
const { getPayload } = await import('payload')
const { default: config } = await import('../../src/payload.config')
const payload = await getPayload({ config })
try {
  const users = await payload.find({
    collection: 'users',
    where: { email: { equals: 'studio-admin@example.test' } },
    limit: 1,
    overrideAccess: true,
  })
  if (!users.docs.length)
    await payload.create({
      collection: 'users',
      data: {
        email: 'studio-admin@example.test',
        password: process.env.INTEGRATION_ADMIN_PASSWORD!,
        name: 'Integration administrator',
      },
      overrideAccess: true,
    })
  const header = await payload.find({ collection: 'header', limit: 1, overrideAccess: true })
  if (!header.docs.length)
    await payload.create({
      collection: 'header',
      data: {
        sureName: 'Studio Integration',
        professionTexts: ['Integration test portfolio'],
        imageUrl: '/images/profile.webp',
      },
      overrideAccess: true,
    })
  const projects = await payload.find({
    collection: 'projects',
    where: { title: { equals: 'Integration project' } },
    limit: 1,
    overrideAccess: true,
  })
  if (!projects.docs.length)
    await payload.create({
      collection: 'projects',
      data: {
        title: 'Integration project',
        categories: ['front-end'],
        src: '/images/projects/SepiWhite.webp',
        url: 'https://example.test/project',
      },
      overrideAccess: true,
    })
  const articles = await payload.find({
    collection: 'articles',
    where: { slug: { equals: 'integration-field-note' } },
    limit: 1,
    overrideAccess: true,
  })
  if (!articles.docs.length)
    await payload.create({
      collection: 'articles',
      data: {
        title: 'Integration field note',
        slug: 'integration-field-note',
        excerpt: 'This is a database-backed integration fixture.',
        description:
          'This article exists only in the isolated integration database.\n\nIt exercises the actual Payload and Next application.',
        publishedAt: '2026-10-22T00:00:00.000Z',
        readTime: 2,
        category: 'articles',
        link: 'https://example.test/article',
      },
      overrideAccess: true,
    })
  await payload.updateGlobal({
    slug: 'footer',
    data: {
      roles: { fullName: 'Studio Integration' },
      copyRight: { year: 2026, website: 'Integration fixture', url: 'https://example.test' },
    },
    overrideAccess: true,
  })
  console.log('Isolated integration fixtures ready; no existing database was reset.')
} finally {
  await payload.destroy()
}
