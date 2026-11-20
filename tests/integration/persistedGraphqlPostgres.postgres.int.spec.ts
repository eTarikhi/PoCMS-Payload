// @vitest-environment node
/**
 * Real loopback PostgreSQL HTTP & Payload 3.90.2 integration proof for `POST /api/fgql`.
 *
 * Runs only via `pnpm test:int:postgres` against an explicit disposable loopback PostgreSQL
 * database (`POSTGRES_LOCAL_TEST_URL`, restricted to `127.0.0.1` / `localhost`). It never reads
 * `.env`, never connects to Neon or any remote host, and uses zero mocks on `@payloadcms/next`,
 * Payload's GraphQL handler, or the PostgreSQL adapter.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'

import { revalidateTag } from 'next/cache'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload, PayloadRequest } from 'payload'

import { PUBLISHED_OR_LEGACY_WHERE } from '@/access/roles'
import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import { buildRssFeedXml, buildSitemapEntries } from '@/app/(frontend)/lib/feeds'
import { mapPublicForm } from '@/app/(frontend)/lib/forms-types'
import {
  mapArticles,
  mapCustomCode,
  mapFooter,
  mapHeader,
  mapHeaderStudio,
  mapNavigation,
  mapPortfolioContent,
  mapProjects,
  mapSiteSettings,
} from '@/app/(frontend)/lib/mappers'
import { mapProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import { matchRedirect } from '@/app/(frontend)/lib/redirects-utils'
import { MAX_GRAPHQL_REQUEST_BODY_BYTES } from '@/auth/graphqlRequestBodyLimit'
import { PERSISTED_QUERY_IDS } from '@/fgql/persistedQueryRegistry'
import * as fgqlResponse from '@/fgql/response'
import type {
  About,
  Article,
  Certificate,
  Education,
  Experience,
  Form,
  Project,
  Redirect,
  Service,
  Skill,
} from '@/payload-types'

import { isNeonHost } from './neonTarget'

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])

const resolveLoopbackTestDatabaseUrl = (): string => {
  const raw = process.env.POSTGRES_LOCAL_TEST_URL?.trim()
  if (!raw) {
    throw new Error(
      'POSTGRES_LOCAL_TEST_URL is required and must point to an isolated loopback PostgreSQL test database.',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('POSTGRES_LOCAL_TEST_URL is not a valid PostgreSQL URL.')
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`Unsupported PostgreSQL protocol "${parsed.protocol}".`)
  }

  const hostname = parsed.hostname.toLowerCase()
  if (isNeonHost(hostname) || !LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing non-loopback PostgreSQL host "${parsed.hostname}". Only 127.0.0.1 or localhost is permitted.`,
    )
  }

  const dbName = parsed.pathname.replace(/^\/+/, '')
  if (!dbName || dbName === 'postgres' || dbName === 'pocms') {
    throw new Error(
      `Refusing non-disposable database name "${dbName || '(empty)'}"; supply a dedicated *_test / *_suite database.`,
    )
  }

  return raw
}

const toWebRequest = (req: IncomingMessage, origin: string): Request => {
  const url = new URL(req.url || '/', origin)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else if (typeof value === 'string') {
      headers.set(key, value)
    }
  }

  const method = (req.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url.toString(), { method, headers })
  }

  return new Request(url.toString(), {
    method,
    headers,
    body: Readable.toWeb(req) as unknown as BodyInit,
    duplex: 'half',
  } as RequestInit)
}

const stripEphemeralLexicalBlockIds = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripEphemeralLexicalBlockIds(item)) as unknown as T
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  const rec = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (
      k === 'id' &&
      typeof v === 'string' &&
      /^[0-9a-f]{24}$/i.test(v) &&
      typeof rec.blockType === 'string'
    ) {
      continue
    }
    out[k] = stripEphemeralLexicalBlockIds(v)
  }
  return out as T
}

let payload: Payload
let httpServer: Server
let baseOrigin: string
let adminToken: string
let publishedArticleSlug: string
let publishedProjectSlug: string
let contactFormId: number | string
let seededMediaFilename: string

beforeAll(async () => {
  const connectionString = resolveLoopbackTestDatabaseUrl()

  vi.stubEnv('NODE_ENV', 'test')
  process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'true'
  process.env.PAYLOAD_DROP_DATABASE = 'false'
  process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'loopback-pg-fgql-integration-secret'
  process.env.POSTGRES_URL = connectionString
  delete process.env.POSTGRES_READ_REPLICA_URLS
  delete process.env.POSTGRES_READ_REPLICA_URL
  delete process.env.RESEND_API_KEY
  delete process.env.BLOB_READ_WRITE_TOKEN
  process.env.PLAYWRIGHT_TEST = 'true'

  const [{ createLocalReq, getPayload }, { default: configPromise }, { seed }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
    import('@/seed/index'),
  ])

  const config = await configPromise
  payload = await getPayload({ config })

  const db = payload.db as unknown as {
    disableCreateDatabase?: boolean
    packageName?: string
    poolOptions?: { connectionString?: string }
    readReplicaOptions?: unknown[]
  }

  expect(db.packageName).toBe('@payloadcms/db-vercel-postgres')
  expect(db.poolOptions?.connectionString).toBe(connectionString)
  expect(db.readReplicaOptions).toBeUndefined()
  db.disableCreateDatabase = true

  const seedReq = await createLocalReq({}, payload)
  await seed({ payload, req: seedReq })

  const mediaRes = await payload.find({
    collection: 'media',
    limit: 1,
    overrideAccess: true,
  })
  expect(mediaRes.docs.length).toBeGreaterThan(0)
  seededMediaFilename = mediaRes.docs[0]!.filename!

  const articlesRes = await payload.find({
    collection: 'articles',
    where: PUBLISHED_OR_LEGACY_WHERE,
    limit: 5,
    overrideAccess: true,
  })
  const onSiteArticle = articlesRes.docs.find((doc) => Boolean(doc.slug && doc.content))
  expect(onSiteArticle?.slug).toBeTruthy()
  publishedArticleSlug = onSiteArticle!.slug!

  const projectsRes = await payload.find({
    collection: 'projects',
    where: PUBLISHED_OR_LEGACY_WHERE,
    limit: 5,
    overrideAccess: true,
  })
  const onSiteProject = projectsRes.docs.find((doc) => Boolean(doc.slug && doc.content))
  expect(onSiteProject?.slug).toBeTruthy()
  publishedProjectSlug = onSiteProject!.slug!

  // Create synthetic unpublished drafts to verify strict exclusion from public GraphQL reads.
  await payload.create({
    collection: 'articles',
    draft: true,
    overrideAccess: true,
    context: { skipAuditLog: true, skipRevalidate: true },
    data: {
      title: 'Synthetic Unpublished Draft Article',
      slug: 'synthetic-unpublished-draft-article',
      excerpt: 'Unpublished draft article secret excerpt',
      description: 'Draft body paragraph for unpublished article.',
      _status: 'draft',
    },
  })

  await payload.create({
    collection: 'projects',
    draft: true,
    overrideAccess: true,
    context: { skipAuditLog: true, skipRevalidate: true },
    data: {
      title: 'Synthetic Unpublished Draft Project',
      slug: 'synthetic-unpublished-draft-project',
      excerpt: 'Unpublished draft project secret excerpt',
      categories: ['front-end'],
      _status: 'draft',
    },
  })

  // Seed 301 reference redirect + 302 custom redirect + private CustomCode global.
  await payload.create({
    collection: 'redirects',
    overrideAccess: true,
    context: { skipAuditLog: true, skipRevalidate: true },
    data: {
      from: '/old-article-link',
      type: '301',
      to: {
        type: 'reference',
        reference: {
          relationTo: 'articles',
          value: onSiteArticle!.id,
        },
      },
    },
  })

  await payload.create({
    collection: 'redirects',
    overrideAccess: true,
    context: { skipAuditLog: true, skipRevalidate: true },
    data: {
      from: '/temp-cv',
      type: '302',
      to: {
        type: 'custom',
        url: '/contact',
      },
    },
  })

  await payload.updateGlobal({
    slug: 'custom-code',
    overrideAccess: true,
    context: { skipAuditLog: true, skipRevalidate: true },
    data: {
      enabled: true,
      customCss: {
        enabled: true,
        scope: 'all',
        css: '/* secret-custom-code-marker */',
      },
    },
  })

  const formsRes = await payload.find({
    collection: 'forms',
    where: { slug: { equals: 'contact' } },
    limit: 1,
    overrideAccess: true,
  })
  expect(formsRes.docs[0]?.id).toBeDefined()
  contactFormId = formsRes.docs[0]!.id

  // Create real Administrator user & mint signed Payload JWT.
  const adminRoleRes = await payload.find({
    collection: 'roles',
    where: { fullAccess: { equals: true } },
    limit: 1,
    overrideAccess: true,
  })
  expect(adminRoleRes.docs[0]?.id).toBeDefined()

  const adminEmail = 'fgql-pg-admin@example.test'
  const adminPassword = 'StrongTestPassword!2026'
  await payload.create({
    collection: 'users',
    overrideAccess: true,
    context: { skipAuditLog: true },
    data: {
      email: adminEmail,
      password: adminPassword,
      roles: [adminRoleRes.docs[0]!.id],
    },
  })

  const loginResult = await payload.login({
    collection: 'users',
    data: { email: adminEmail, password: adminPassword },
    context: { skipAuditLog: true },
  })
  expect(typeof loginResult.token).toBe('string')
  adminToken = loginResult.token!

  const [fgqlRoute, adminGraphqlRoute, restCatchAllRoute] = await Promise.all([
    import('@/app/(payload)/api/fgql/route'),
    import('@/app/(payload)/api/graphql/route'),
    import('@/app/(payload)/api/[...slug]/route'),
  ])

  httpServer = createServer(async (req, res) => {
    try {
      const request = toWebRequest(req, baseOrigin)
      const pathname = new URL(request.url).pathname
      const method = request.method.toUpperCase()
      let response: Response

      if (pathname === '/api/fgql') {
        const handler = (
          fgqlRoute as unknown as Record<string, ((r: Request) => Promise<Response>) | undefined>
        )[method]
        response =
          typeof handler === 'function'
            ? await handler(request)
            : new Response(null, { status: 405 })
      } else if (pathname === '/api/graphql') {
        const handler = (
          adminGraphqlRoute as unknown as Record<
            string,
            ((r: Request) => Promise<Response>) | undefined
          >
        )[method]
        response =
          typeof handler === 'function'
            ? await handler(request)
            : new Response(null, { status: 405 })
      } else if (pathname.startsWith('/api/')) {
        const slug = pathname.slice('/api/'.length).split('/').filter(Boolean)
        const handler = (
          restCatchAllRoute as unknown as Record<
            string,
            | ((r: Request, ctx: { params: Promise<{ slug: string[] }> }) => Promise<Response>)
            | undefined
          >
        )[method]
        response =
          typeof handler === 'function'
            ? await handler(request, { params: Promise.resolve({ slug }) })
            : new Response(null, { status: 405 })
      } else {
        response = new Response(null, { status: 404 })
      }

      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      const arrayBuffer = await response.arrayBuffer()
      res.end(Buffer.from(arrayBuffer))
    } catch (error) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    }
  })

  await new Promise<void>((resolveListen) => {
    httpServer.listen(0, '127.0.0.1', () => resolveListen())
  })
  const address = httpServer.address() as AddressInfo
  baseOrigin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  if (httpServer) {
    await new Promise<void>((resolveClose) => {
      httpServer.close(() => resolveClose())
    })
  }
  if (payload?.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.mocked(revalidateTag).mockClear()
})

describe('real loopback PostgreSQL HTTP & Payload 3.90.2 integration proof', () => {
  it('classifies /api/fgql as GraphQL, strips Admin credentials, populates DataLoader, and leaves read transactions idle', async () => {
    const authObservations: Array<{
      isGraphQL: boolean
      hasCookie: boolean
      hasAuth: boolean
    }> = []
    const accessObservations: Array<{
      payloadAPI: string | undefined
      pathname: string | undefined
      user: unknown
      language: string | undefined
      hasDataLoader: boolean
      hasLoadFn: boolean
      transactionID: unknown
      origin: string | null
      acceptLanguage: string | null
      cookieHeader: string | null
      authHeader: string | null
    }> = []

    const originalAuthStrategies = [...payload.authStrategies]
    const articlesCollection = payload.collections.articles!
    const originalArticlesReadAccess = articlesCollection.config.access.read

    payload.authStrategies = [
      {
        name: 'probe-strategy',
        authenticate: async (args) => {
          authObservations.push({
            isGraphQL: Boolean(args.isGraphQL),
            hasCookie: Boolean(args.headers.get('cookie')),
            hasAuth: Boolean(args.headers.get('authorization')),
          })
          return { user: null }
        },
      },
      ...originalAuthStrategies,
    ]

    articlesCollection.config.access.read = async (args) => {
      const req = args.req as PayloadRequest
      accessObservations.push({
        payloadAPI: req.payloadAPI,
        pathname: req.pathname,
        user: req.user,
        language: req.i18n?.language,
        hasDataLoader: Boolean(req.payloadDataLoader),
        hasLoadFn: typeof req.payloadDataLoader?.load === 'function',
        transactionID: req.transactionID ?? null,
        origin: req.headers.get('origin'),
        acceptLanguage: req.headers.get('accept-language'),
        cookieHeader: req.headers.get('cookie'),
        authHeader: req.headers.get('authorization'),
      })
      return originalArticlesReadAccess ? originalArticlesReadAccess(args) : true
    }

    try {
      const response = await fetch(`${baseOrigin}/api/fgql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `payload-token=${adminToken}`,
          Authorization: `JWT ${adminToken}`,
          Origin: 'http://127.0.0.1:3000',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
        body: JSON.stringify({ id: 'public.article-cards.v1' }),
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')

      const body = (await response.json()) as {
        data?: { Articles?: { docs: Array<{ slug?: string }> } }
        errors?: unknown[]
      }
      expect(body.errors).toBeUndefined()
      expect(
        body.data?.Articles?.docs.some((doc) => doc.slug === 'synthetic-unpublished-draft-article'),
      ).toBe(false)

      expect(authObservations.length).toBeGreaterThan(0)
      expect(authObservations[0]).toEqual({
        isGraphQL: true,
        hasCookie: false,
        hasAuth: false,
      })

      expect(accessObservations.length).toBeGreaterThan(0)
      expect(accessObservations[0]).toEqual({
        payloadAPI: 'GraphQL',
        pathname: '/api/graphql',
        user: null,
        language: 'en',
        hasDataLoader: true,
        hasLoadFn: true,
        transactionID: null,
        origin: 'http://127.0.0.1:3000',
        acceptLanguage: 'fr-FR,fr;q=0.9',
        cookieHeader: null,
        authHeader: null,
      })
    } finally {
      payload.authStrategies = originalAuthStrategies
      articlesCollection.config.access.read = originalArticlesReadAccess
    }
  })

  it('executes all 16 registered operations over HTTP without errors, drafts, Forms.emails, CustomCode, or FormSubmissions, while keeping Media binary delivery on REST', async () => {
    for (const id of PERSISTED_QUERY_IDS) {
      const variables =
        id === 'public.article-detail.v1'
          ? { slug: publishedArticleSlug }
          : id === 'public.project-detail.v1'
            ? { slug: publishedProjectSlug }
            : undefined

      const response = await fetch(`${baseOrigin}/api/fgql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `payload-token=${adminToken}`,
          Authorization: `JWT ${adminToken}`,
        },
        body: JSON.stringify(variables ? { id, variables } : { id }),
      })

      expect(response.status, id).toBe(200)
      expect(response.headers.get('cache-control'), id).toBe('no-store')

      const rawText = await response.text()
      expect(rawText).not.toContain('synthetic-unpublished-draft-article')
      expect(rawText).not.toContain('synthetic-unpublished-draft-project')
      expect(rawText).not.toContain('secret-custom-code-marker')

      const json = JSON.parse(rawText) as {
        data?: Record<string, unknown>
        errors?: unknown[]
      }
      expect(json.errors, id).toBeUndefined()
      expect(json.data, id).toBeDefined()

      if (id === 'public.forms.v1') {
        const forms = (json.data?.Forms as { docs: Array<Record<string, unknown>> }).docs
        expect(forms.length).toBeGreaterThanOrEqual(2)
        for (const form of forms) {
          expect(form).not.toHaveProperty('emails')
        }
      }

      if (id === 'public.header.v1') {
        const profileImage = (
          json.data?.Header as { profileImage?: { url?: string | null } | null }
        )?.profileImage
        expect(profileImage?.url).toContain('/api/media/file/')
      }
    }

    // Confirm binary image retrieval remains served by Payload's REST `/api/media/file/:filename` route.
    const mediaRestRes = await fetch(
      `${baseOrigin}/api/media/file/${encodeURIComponent(seededMediaFilename)}`,
    )
    expect(mediaRestRes.status).toBe(200)
    expect(mediaRestRes.headers.get('content-type')).toContain('image/')
    const mediaBytes = new Uint8Array(await mediaRestRes.arrayBuffer())
    expect(mediaBytes.byteLength).toBeGreaterThan(100)
  })

  it('matches authorized Local API fixtures across every frontend reader and mapper with zero fallback invocations', async () => {
    const fallbackSpy = vi.spyOn(fgqlResponse, 'logPersistedQueryFallback')
    const fallbackFailureSpy = vi.spyOn(fgqlResponse, 'logPersistedQueryFallbackFailure')

    try {
      const source = await import('@/app/(frontend)/lib/payload-source')
      const formsCache = await import('@/app/(frontend)/lib/forms-cache')

      const [
        localSiteSettings,
        localNavigation,
        localHeader,
        localFooter,
        localCustomCode,
        localAboutRes,
        localSkillsRes,
        localExperiencesRes,
        localEducationsRes,
        localCertificatesRes,
        localArticlesRes,
        localServicesRes,
        localProjectsRes,
        localProjectsSection,
      ] = await Promise.all([
        payload.findGlobal({
          slug: 'site-settings',
          depth: 1,
          overrideAccess: false,
          select: source.SITE_SETTINGS_GLOBAL_SELECT,
          populate: source.MEDIA_PUBLIC_POPULATE,
        }),
        payload.findGlobal({
          slug: 'navigation',
          depth: 0,
          overrideAccess: false,
          select: source.NAVIGATION_GLOBAL_SELECT,
        }),
        payload.findGlobal({
          slug: 'header',
          depth: 1,
          overrideAccess: false,
          select: source.HEADER_GLOBAL_SELECT,
          populate: source.MEDIA_PUBLIC_POPULATE,
        }),
        payload.findGlobal({
          slug: 'footer',
          depth: 0,
          overrideAccess: false,
          select: source.FOOTER_GLOBAL_SELECT,
        }),
        payload
          .findGlobal({
            slug: 'custom-code',
            depth: 0,
            select: source.CUSTOM_CODE_GLOBAL_SELECT,
          })
          .catch(() => null),
        payload.find({
          collection: 'about',
          limit: 1,
          depth: 1,
          overrideAccess: false,
          select: source.ABOUT_SELECT,
          populate: source.MEDIA_PUBLIC_POPULATE,
        }),
        payload.find({
          collection: 'skills',
          pagination: false,
          sort: '_order',
          depth: 0,
          joins: false,
          overrideAccess: false,
          select: source.SKILL_SELECT,
        }),
        payload.find({
          collection: 'experiences',
          pagination: false,
          sort: '_order',
          depth: 0,
          overrideAccess: false,
          select: source.EXPERIENCE_SELECT,
        }),
        payload.find({
          collection: 'educations',
          pagination: false,
          sort: '_order',
          depth: 0,
          overrideAccess: false,
          select: source.EDUCATION_SELECT,
        }),
        payload.find({
          collection: 'certificates',
          pagination: false,
          sort: 'issuedAt',
          depth: 1,
          overrideAccess: false,
          select: source.CERTIFICATE_SELECT,
          populate: source.MEDIA_PUBLIC_POPULATE,
        }),
        payload.find({
          collection: 'articles',
          where: PUBLISHED_OR_LEGACY_WHERE,
          pagination: false,
          sort: '-publishedAt',
          depth: 1,
          overrideAccess: false,
          select: source.ARTICLE_CARD_SELECT,
          populate: source.MEDIA_PUBLIC_POPULATE,
        }),
        payload.find({
          collection: 'services',
          pagination: false,
          sort: '_order',
          depth: 0,
          overrideAccess: false,
          select: source.SERVICE_SELECT,
        }),
        payload.find({
          collection: 'projects',
          where: PUBLISHED_OR_LEGACY_WHERE,
          pagination: false,
          sort: '_order',
          depth: 1,
          overrideAccess: false,
          select: source.PROJECT_CARD_SELECT,
          populate: source.MEDIA_PUBLIC_POPULATE,
        }),
        payload.findGlobal({
          slug: 'site-settings',
          depth: 0,
          overrideAccess: false,
          select: source.SITE_SETTINGS_PROJECTS_SELECT,
        }),
      ])

      const expectedPortfolio = mapPortfolioContent({
        siteSettings: localSiteSettings,
        navigation: localNavigation,
        header: localHeader,
        about: (localAboutRes.docs[0] as About | undefined) ?? null,
        skills: localSkillsRes.docs as Skill[],
        experiences: localExperiencesRes.docs as Experience[],
        educations: localEducationsRes.docs as Education[],
        certificates: localCertificatesRes.docs as Certificate[],
        articles: localArticlesRes.docs as Article[],
        services: localServicesRes.docs as Service[],
        projects: localProjectsRes.docs as Project[],
        footer: localFooter,
        customCode: localCustomCode,
      })

      expect(await source.getPortfolioContent()).toEqual(expectedPortfolio)
      expect(await source.getSiteChromeContent()).toEqual({
        siteSettings: mapSiteSettings(localSiteSettings),
        navigation: mapNavigation(localNavigation),
        header: mapHeader(localHeader),
        headerStudio: mapHeaderStudio(localHeader),
        footer: mapFooter(localFooter),
        customCode: mapCustomCode(localCustomCode),
      })
      expect(await source.getPublishedArticlesList()).toEqual(
        mapArticles(localArticlesRes.docs as Article[]),
      )
      expect(await source.getPublishedProjectsList()).toEqual(
        mapProjects(
          localProjectsRes.docs as Project[],
          mapSiteSettings(localProjectsSection).projectsSection,
        ),
      )

      const articleSlugs = await source.fetchPublishedArticleSlugs()
      expect(articleSlugs).toContain(publishedArticleSlug)
      expect(articleSlugs).not.toContain('synthetic-unpublished-draft-article')

      const projectSlugs = await source.fetchPublishedProjectSlugs()
      expect(projectSlugs).toContain(publishedProjectSlug)
      expect(projectSlugs).not.toContain('synthetic-unpublished-draft-project')

      // Detail reader parity + draft Local API preview preservation
      const localArticleDetail = (
        await payload.find({
          collection: 'articles',
          where: {
            and: [{ slug: { equals: publishedArticleSlug } }, PUBLISHED_OR_LEGACY_WHERE],
          },
          limit: 1,
          depth: 2,
          overrideAccess: false,
          select: source.ARTICLE_DETAIL_SELECT,
          populate: source.DETAIL_POPULATE,
        })
      ).docs[0]! as Article
      const gqlArticleDetail = await source.fetchArticleBySlug(publishedArticleSlug)
      expect(stripEphemeralLexicalBlockIds(mapArticleDetail(gqlArticleDetail!))).toEqual(
        stripEphemeralLexicalBlockIds(mapArticleDetail(localArticleDetail)),
      )
      expect(await source.fetchArticleBySlug('synthetic-unpublished-draft-article')).toBeNull()
      expect(
        (await source.fetchArticleBySlug('synthetic-unpublished-draft-article', { draft: true }))
          ?.slug,
      ).toBe('synthetic-unpublished-draft-article')

      const localProjectDetail = (
        await payload.find({
          collection: 'projects',
          where: {
            and: [{ slug: { equals: publishedProjectSlug } }, PUBLISHED_OR_LEGACY_WHERE],
          },
          limit: 1,
          depth: 2,
          overrideAccess: false,
          select: source.PROJECT_DETAIL_SELECT,
          populate: source.DETAIL_POPULATE,
        })
      ).docs[0]! as Project
      const gqlProjectDetail = await source.fetchProjectBySlug(publishedProjectSlug)
      expect(stripEphemeralLexicalBlockIds(mapProjectDetail(gqlProjectDetail!))).toEqual(
        stripEphemeralLexicalBlockIds(mapProjectDetail(localProjectDetail)),
      )
      expect(await source.fetchProjectBySlug('synthetic-unpublished-draft-project')).toBeNull()
      expect(
        (await source.fetchProjectBySlug('synthetic-unpublished-draft-project', { draft: true }))
          ?.slug,
      ).toBe('synthetic-unpublished-draft-project')

      // Forms parity
      const localForms = (
        await payload.find({
          collection: 'forms',
          pagination: false,
          depth: 1,
          sort: 'id',
          overrideAccess: false,
          select: formsCache.PUBLIC_FORM_SELECT,
        })
      ).docs
        .map((doc) => mapPublicForm(doc as Partial<Form>))
        .filter((f): f is NonNullable<typeof f> => f !== null)

      expect(await formsCache.fetchPublishedForms()).toEqual(localForms)

      // Redirects parity (including 301 & 302 enum normalization)
      const localRedirects = (
        await payload.find({
          collection: 'redirects',
          pagination: false,
          depth: 1,
          overrideAccess: false,
          select: source.REDIRECT_SELECT,
          populate: {
            articles: { slug: true },
            projects: { slug: true },
          },
        })
      ).docs as Redirect[]
      const gqlRedirects = await source.fetchRedirects()
      expect(matchRedirect('/old-article-link', gqlRedirects)).toEqual({
        from: '/old-article-link',
        destination: `/articles/${publishedArticleSlug}`,
        statusCode: 301,
      })
      expect(matchRedirect('/old-article-link', gqlRedirects)).toEqual(
        matchRedirect('/old-article-link', localRedirects),
      )
      expect(matchRedirect('/temp-cv', gqlRedirects)).toEqual({
        from: '/temp-cv',
        destination: '/contact',
        statusCode: 302,
      })
      expect(matchRedirect('/temp-cv', gqlRedirects)).toEqual(
        matchRedirect('/temp-cv', localRedirects),
      )

      // Feed & Sitemap parity
      const gqlFeedDocs = await source.fetchFeedSourceDocs()
      const [localFeedArticles, localFeedProjects] = await Promise.all([
        payload.find({
          collection: 'articles',
          where: PUBLISHED_OR_LEGACY_WHERE,
          pagination: false,
          sort: '-publishedAt',
          depth: 0,
          overrideAccess: false,
          select: source.ARTICLE_FEED_SELECT,
        }),
        payload.find({
          collection: 'projects',
          where: PUBLISHED_OR_LEGACY_WHERE,
          pagination: false,
          sort: '_order',
          depth: 1,
          overrideAccess: false,
          select: source.PROJECT_FEED_SELECT,
          populate: { skills: { label: true, deletedAt: true } },
        }),
      ])

      const site = 'http://127.0.0.1:3000'
      expect(
        buildSitemapEntries({
          articles: gqlFeedDocs.articles,
          projects: gqlFeedDocs.projects,
          site,
        }),
      ).toEqual(
        buildSitemapEntries({
          articles: localFeedArticles.docs as Article[],
          projects: localFeedProjects.docs as Project[],
          site,
        }),
      )
      expect(
        buildRssFeedXml({
          articles: gqlFeedDocs.articles,
          projects: gqlFeedDocs.projects,
          settings: mapSiteSettings(gqlFeedDocs.siteSettings),
          site,
        }),
      ).toEqual(
        buildRssFeedXml({
          articles: localFeedArticles.docs as Article[],
          projects: localFeedProjects.docs as Project[],
          settings: mapSiteSettings(localSiteSettings),
          site,
        }),
      )

      expect(fallbackSpy).not.toHaveBeenCalled()
      expect(fallbackFailureSpy).not.toHaveBeenCalled()
    } finally {
      fallbackSpy.mockRestore()
      fallbackFailureSpy.mockRestore()
    }
  })

  it('rejects arbitrary queries, mutations, introspection, batching, URL parameters, unsupported methods, and oversized bodies over HTTP', async () => {
    const getRes = await fetch(`${baseOrigin}/api/fgql`, { method: 'GET' })
    expect(getRes.status).toBe(405)
    expect(getRes.headers.get('cache-control')).toBe('no-store')

    const queryParamRes = await fetch(`${baseOrigin}/api/fgql?id=public.footer.v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'public.footer.v1' }),
    })
    expect(queryParamRes.status).toBe(400)

    const introspectionRes = await fetch(`${baseOrigin}/api/fgql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query { __schema { queryType { name } } }' }),
    })
    expect(introspectionRes.status).toBe(400)

    const mutationRes = await fetch(`${baseOrigin}/api/fgql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'mutation { createFormSubmission(data: { form: 1 }) { id } }',
      }),
    })
    expect(mutationRes.status).toBe(400)

    const batchRes = await fetch(`${baseOrigin}/api/fgql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: 'public.footer.v1' }]),
    })
    expect(batchRes.status).toBe(400)

    const unknownIdRes = await fetch(`${baseOrigin}/api/fgql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'public.unknown.v1' }),
    })
    expect(unknownIdRes.status).toBe(404)

    const textRes = await fetch(`${baseOrigin}/api/fgql`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"id":"public.footer.v1"}',
    })
    expect(textRes.status).toBe(415)

    const oversizedRes = await fetch(`${baseOrigin}/api/fgql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: new Uint8Array(MAX_GRAPHQL_REQUEST_BODY_BYTES + 1),
    })
    expect(oversizedRes.status).toBe(413)
    expect(oversizedRes.headers.get('cache-control')).toBe('no-store')
  })

  it('preserves Admin-gated /api/graphql and public REST /api/form-submissions while emitting real PostgreSQL cache revalidation tags', async () => {
    const anonGraphqlRes = await fetch(`${baseOrigin}/api/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query { meUser { user { email } } }' }),
    })
    expect(anonGraphqlRes.status).toBe(401)
    expect(anonGraphqlRes.headers.get('cache-control')).toBe('no-store')

    const adminGraphqlRes = await fetch(`${baseOrigin}/api/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `payload-token=${adminToken}`,
      },
      body: JSON.stringify({
        query:
          'query { meUser { user { email } } Articles(draft: true, where: { slug: { equals: "synthetic-unpublished-draft-article" } }) { docs { slug _status } } }',
      }),
    })
    expect(adminGraphqlRes.status).toBe(200)
    const adminBody = (await adminGraphqlRes.json()) as {
      data?: {
        meUser?: { user?: { email?: string } }
        Articles?: { docs?: Array<{ slug?: string; _status?: string }> }
      }
      errors?: unknown[]
    }
    expect(adminBody.errors).toBeUndefined()
    expect(adminBody.data?.meUser?.user?.email).toBe('fgql-pg-admin@example.test')
    expect(adminBody.data?.Articles?.docs?.[0]?.slug).toBe('synthetic-unpublished-draft-article')

    const createSubRes = await fetch(`${baseOrigin}/api/form-submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form: contactFormId,
        submissionData: [
          { field: 'name', value: 'Integration Visitor' },
          { field: 'email', value: 'visitor@example.test' },
          { field: 'subject', value: 'project' },
          { field: 'message', value: 'Testing REST form submission boundary.' },
        ],
      }),
    })
    expect(createSubRes.status).toBe(201)
    const createdSub = (await createSubRes.json()) as { doc?: { id?: number | string } }
    expect(createdSub.doc?.id).toBeDefined()

    const readSubRes = await fetch(`${baseOrigin}/api/form-submissions/${createdSub.doc!.id}`)
    expect(readSubRes.status).toBe(403)

    // Verify real PostgreSQL mutation cache invalidation tags vs pure draft autosave skip.
    vi.mocked(revalidateTag).mockClear()
    const createdDraft = await payload.create({
      collection: 'articles',
      draft: true,
      overrideAccess: true,
      context: { skipAuditLog: true },
      data: {
        title: 'Revalidate Tag Draft Probe',
        slug: 'revalidate-tag-draft-probe',
        excerpt: 'Draft autosave should not bust public caches',
        description: 'Draft body',
        _status: 'draft',
      },
    })
    expect(vi.mocked(revalidateTag)).not.toHaveBeenCalled()

    await payload.update({
      collection: 'articles',
      id: createdDraft.id,
      draft: false,
      overrideAccess: true,
      context: { skipAuditLog: true },
      data: {
        publishedAt: new Date().toISOString(),
        _status: 'published',
      },
    })
    const articleTags = vi.mocked(revalidateTag).mock.calls.map((call) => call[0])
    expect(articleTags).toContain('articles:list')
    expect(articleTags).toContain('home:articles')
    expect(articleTags).toContain('portfolio:home')
    expect(articleTags).toContain('portfolio:feeds')
    expect(articleTags).toContain('article:revalidate-tag-draft-probe')

    vi.mocked(revalidateTag).mockClear()
    const currentFooter = await payload.findGlobal({ slug: 'footer', overrideAccess: true })
    await payload.updateGlobal({
      slug: 'footer',
      overrideAccess: true,
      context: { skipAuditLog: true },
      data: {
        copyRight: {
          year: currentFooter.copyRight?.year ?? 2026,
          website: currentFooter.copyRight?.website ?? 'Portfolio',
          url: currentFooter.copyRight?.url ?? '/',
        },
      },
    })
    const footerTags = vi.mocked(revalidateTag).mock.calls.map((call) => call[0])
    expect(footerTags).toContain('global:footer')
    expect(footerTags).toContain('portfolio:chrome')
    expect(footerTags).toContain('portfolio:home')

    await payload.delete({
      collection: 'articles',
      id: createdDraft.id,
      overrideAccess: true,
      context: { skipAuditLog: true, skipRevalidate: true },
    })
  })
})
