import { sql } from '@payloadcms/db-vercel-postgres'
import fs from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'

import { siteUrl } from '@/app/(frontend)/lib/seo'

export type DatabaseProvider = 'neon' | 'vercel-postgres' | 'local' | 'postgresql' | 'unconfigured'

export type DatabaseConnectionInfo = {
  configured: boolean
  provider: DatabaseProvider
  providerLabel: string
  host: string | null
  database: string | null
  pooled: boolean
  hasUnpooledUrl: boolean
  sslMode: string | null
}

export type DatabaseLiveHealth = DatabaseConnectionInfo & {
  status: 'connected' | 'unreachable' | 'not-configured'
  latencyMs: number | null
  serverVersion: string | null
  migrationsApplied: number | null
  latestMigration: string | null
  errorMessage: string | null
}

export type IntegrationStatus = 'configured' | 'partial' | 'not-configured'

export type IntegrationHealthItem = {
  key: string
  name: string
  category: string
  status: IntegrationStatus
  presentVars: string[]
  missingVars: string[]
  note: string
}

export type SystemInfoReport = {
  generatedAt: string
  versions: {
    app: string
    payload: string
    next: string
    react: string
    node: string
    platform: string
  }
  runtime: {
    nodeEnv: string
    deploymentEnv: string
    gitCommit: string | null
    siteUrl: string
    uptimeSeconds: number
    rssMb: number
    heapUsedMb: number
  }
  schema: {
    collections: number
    globals: number
    endpoints: number
    jobTasks: number
  }
  database: DatabaseLiveHealth
  integrations: IntegrationHealthItem[]
}

/**
 * Parses Postgres/Neon connection metadata without ever exposing credentials or tokens.
 */
export function parseDatabaseConnectionInfo(
  rawUrl: string | undefined = process.env.POSTGRES_URL,
  rawUnpooledUrl: string | undefined =
    process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL_UNPOOLED,
): DatabaseConnectionInfo {
  const trimmed = rawUrl?.trim() ?? ''
  const hasUnpooledUrl = Boolean(rawUnpooledUrl?.trim())

  if (!trimmed) {
    return {
      configured: false,
      provider: 'unconfigured',
      providerLabel: 'Not configured',
      host: null,
      database: null,
      pooled: false,
      hasUnpooledUrl,
      sslMode: null,
    }
  }

  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    const dbName = parsed.pathname.replace(/^\/+/, '') || null
    const sslMode = parsed.searchParams.get('sslmode')
    const pooled =
      host.includes('-pooler.') ||
      parsed.port === '6543' ||
      parsed.searchParams.get('pgbouncer') === 'true'

    let provider: DatabaseProvider = 'postgresql'
    let providerLabel = 'PostgreSQL'
    if (host.includes('.neon.tech')) {
      provider = 'neon'
      providerLabel = 'Neon Serverless Postgres'
    } else if (host.includes('vercel-storage.com')) {
      provider = 'vercel-postgres'
      providerLabel = 'Vercel Postgres (Neon)'
    } else if (host === 'localhost' || host === '127.0.0.1') {
      provider = 'local'
      providerLabel = 'Local PostgreSQL'
    }

    return {
      configured: true,
      provider,
      providerLabel,
      host,
      database: dbName,
      pooled,
      hasUnpooledUrl,
      sslMode,
    }
  } catch {
    return {
      configured: true,
      provider: 'postgresql',
      providerLabel: 'PostgreSQL (unparsed URL)',
      host: null,
      database: null,
      pooled: false,
      hasUnpooledUrl,
      sslMode: null,
    }
  }
}

const isSet = (env: NodeJS.ProcessEnv, key: string): boolean =>
  Boolean(env[key] && env[key]!.trim().length > 0)

/**
 * Inspects environment variable presence for every external integration (never returns secret values).
 */
export function inspectIntegrations(env: NodeJS.ProcessEnv = process.env): IntegrationHealthItem[] {
  const buildItem = ({
    key,
    name,
    category,
    required,
    optional = [],
    note,
  }: {
    key: string
    name: string
    category: string
    required: readonly string[]
    optional?: readonly string[]
    note: string
  }): IntegrationHealthItem => {
    const allVars = [...required, ...optional]
    const presentVars = allVars.filter((v) => isSet(env, v))
    const missingRequired = required.filter((v) => !isSet(env, v))
    const missingOptional = optional.filter((v) => !isSet(env, v))

    const status: IntegrationStatus =
      missingRequired.length === 0
        ? 'configured'
        : presentVars.length > 0
          ? 'partial'
          : 'not-configured'

    return {
      key,
      name,
      category,
      status,
      presentVars,
      missingVars: [...missingRequired, ...missingOptional],
      note,
    }
  }

  return [
    buildItem({
      key: 'database',
      name: 'Neon / PostgreSQL',
      category: 'Database',
      required: ['POSTGRES_URL'],
      optional: ['POSTGRES_URL_NON_POOLING'],
      note: 'Pooled URL for serverless queries; unpooled URL recommended for Drizzle migrations.',
    }),
    buildItem({
      key: 'storage',
      name: 'Vercel Blob',
      category: 'Media storage',
      required: ['BLOB_READ_WRITE_TOKEN'],
      note: 'Stores uploaded Media assets in Vercel Blob CDN.',
    }),
    buildItem({
      key: 'email',
      name: 'Resend',
      category: 'Transactional email',
      required: ['RESEND_API_KEY'],
      note: 'Outbound password resets and form notifications.',
    }),
    buildItem({
      key: 'vercel',
      name: 'Vercel Analytics & Deployments',
      category: 'Observability',
      required: ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'],
      optional: ['VERCEL_TEAM_ID'],
      note: 'Powers the Site traffic and Deployments dashboard widgets.',
    }),
    buildItem({
      key: 'github',
      name: 'GitHub Actions CI',
      category: 'CI / CD',
      required: ['GITHUB_REPO'],
      optional: ['GITHUB_TOKEN'],
      note: 'Powers the CI status dashboard widget.',
    }),
    buildItem({
      key: 'pagespeed',
      name: 'PageSpeed Insights',
      category: 'Performance',
      required: ['NEXT_PUBLIC_SITE_URL'],
      optional: ['PAGESPEED_API_KEY'],
      note: 'Powers Core Web Vitals & Lighthouse scores on the dashboard.',
    }),
    buildItem({
      key: 'cron',
      name: 'Jobs Cron Secret',
      category: 'Background jobs',
      required: ['CRON_SECRET'],
      note: 'Authenticates automated scheduled job runners (Bearer token).',
    }),
  ]
}

let cachedPackageVersions: {
  app: string
  payload: string
  next: string
  react: string
} | null = null

function readPackageVersions() {
  if (cachedPackageVersions) return cachedPackageVersions
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as {
      version?: string
      dependencies?: Record<string, string>
    }
    const clean = (ver: string | undefined) => (ver ?? 'unknown').replace(/^[\^~]/, '')
    cachedPackageVersions = {
      app: pkg.version ?? '1.0.0',
      payload: clean(pkg.dependencies?.payload),
      next: clean(pkg.dependencies?.next),
      react: clean(pkg.dependencies?.react),
    }
  } catch {
    cachedPackageVersions = {
      app: '1.0.0',
      payload: '3.x',
      next: '16.x',
      react: '19.x',
    }
  }
  return cachedPackageVersions
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function probeDatabase(payload: Payload): Promise<DatabaseLiveHealth> {
  const conn = parseDatabaseConnectionInfo()
  if (!conn.configured) {
    return {
      ...conn,
      status: 'not-configured',
      latencyMs: null,
      serverVersion: null,
      migrationsApplied: null,
      latestMigration: null,
      errorMessage: null,
    }
  }

  const started = Date.now()
  try {
    const drizzle = (payload.db as { drizzle?: { execute?: (query: unknown) => Promise<unknown> } })
      ?.drizzle
    let serverVersion: string | null = null
    if (drizzle?.execute) {
      const result = (await withTimeout(
        drizzle.execute(sql`SELECT version() AS version`),
        2500,
      )) as { rows?: Array<{ version?: string }> }
      const rawVersion = result?.rows?.[0]?.version ?? null
      serverVersion = rawVersion ? rawVersion.split(',')[0]?.trim() ?? rawVersion : null
    }
    const latencyMs = Date.now() - started

    let migrationsApplied: number | null = null
    let latestMigration: string | null = null
    try {
      const migrations = await withTimeout(
        payload.find({
          collection: 'payload-migrations',
          sort: '-createdAt',
          limit: 1,
          depth: 0,
          overrideAccess: true,
        }),
        2000,
      )
      migrationsApplied = migrations.totalDocs
      latestMigration = migrations.docs[0]?.name ?? null
    } catch {
      // Migration table may not exist yet in dev push mode.
    }

    return {
      ...conn,
      status: 'connected',
      latencyMs,
      serverVersion,
      migrationsApplied,
      latestMigration,
      errorMessage: null,
    }
  } catch (error) {
    return {
      ...conn,
      status: 'unreachable',
      latencyMs: Date.now() - started,
      serverVersion: null,
      migrationsApplied: null,
      latestMigration: null,
      errorMessage: error instanceof Error ? error.message : 'Database connection failed',
    }
  }
}

/**
 * Builds the full System Information snapshot for `/admin/system`, `SystemInfoWidget`,
 * and `GET /api/system-info`.
 */
export async function collectSystemInfo(payload: Payload): Promise<SystemInfoReport> {
  const pkg = readPackageVersions()
  const mem = process.memoryUsage()
  const vercelEnv = process.env.VERCEL_ENV?.trim()
  const deploymentEnv = vercelEnv
    ? `Vercel (${vercelEnv})`
    : process.env.NODE_ENV === 'production'
      ? 'Production'
      : 'Development'

  const database = await probeDatabase(payload)
  const integrations = inspectIntegrations(process.env)

  return {
    generatedAt: new Date().toISOString(),
    versions: {
      app: pkg.app,
      payload: pkg.payload,
      next: pkg.next,
      react: pkg.react,
      node: process.version,
      platform: `${process.platform} (${process.arch})`,
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      deploymentEnv,
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      siteUrl: siteUrl(),
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
      heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
    },
    schema: {
      collections: payload.config.collections.filter((c) => !c.slug.startsWith('payload-')).length,
      globals: payload.config.globals.filter((g) => !g.slug.startsWith('payload-')).length,
      endpoints: payload.config.endpoints?.length ?? 0,
      jobTasks: payload.config.jobs?.tasks?.length ?? 0,
    },
    database,
    integrations,
  }
}
