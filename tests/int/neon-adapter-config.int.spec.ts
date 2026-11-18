// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildPostgresAdapterArgs,
  isLocalPostgresUrl,
  isServerlessAutoscalingPostgresUrl,
  resolvePostgresPoolOptions,
  resolveReadReplicaUrls,
} from '@/lib/postgresAdapterConfig'
import config from '@/payload.config'

/**
 * Guards for the supported database architecture.
 *
 * The application is Vercel/Neon PostgreSQL in **every** environment, including local development:
 * the developer runs the app locally while the database is a Neon branch. A local PostgreSQL
 * server, or a Docker PostgreSQL service reached through a plain `pg.Pool`, is not part of the
 * supported architecture.
 *
 * These tests therefore assert two things:
 *
 * 1. `src/payload.config.ts` is wired to `@payloadcms/db-vercel-postgres` and keeps its
 *    serverless-appropriate pool semantics. Replacing it with `@payloadcms/db-postgres`, or
 *    letting a local/`pg.Pool` path back into the production config, must fail loudly here.
 * 2. Remote Neon URL handling is byte-for-byte unchanged, so nothing in this repository can
 *    silently rewrite a real connection string.
 *
 * No database connection is made. These are configuration tests.
 */

const NEON_POOLED =
  'postgresql://user:pass@ep-cool-sky-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full'

describe('Supported runtime: Vercel/Neon PostgreSQL adapter', () => {
  it('payload.config.ts imports the Vercel/Neon adapter, not @payloadcms/db-postgres', () => {
    const configPath = join(process.cwd(), 'src', 'payload.config.ts')
    const source = readFileSync(configPath, 'utf8')

    expect(source).toContain("from '@payloadcms/db-vercel-postgres'")
    expect(source).toContain('vercelPostgresAdapter(')

    // A plain local-postgres adapter must never take over the application config.
    expect(source).not.toContain("from '@payloadcms/db-postgres'")
    expect(source).not.toContain('postgresAdapter(')

    // The Phase 2A local-driver escape hatch must not reappear on the required path.
    expect(source).not.toContain('forceUseVercelPostgres')
  })

  it('uses a driver whose installed implementation is the Neon/Vercel one', () => {
    const installedAdapter = join(
      process.cwd(),
      'node_modules',
      '@payloadcms',
      'db-vercel-postgres',
      'dist',
      'index.js',
    )
    const source = readFileSync(installedAdapter, 'utf8')

    // `forceUseVercelPostgres` is specific to the Vercel/Neon adapter; @payloadcms/db-postgres has
    // no such concept. Its presence proves which implementation is actually installed and used.
    expect(source).toContain('forceUseVercelPostgres')
    expect(source).toContain('poolOptions: args.pool')
  })

  it('keeps serverless pool sizing for Neon hosts', () => {
    // Remote Neon must stay on the scale-to-zero friendly profile, not a local pg.Pool profile.
    expect(isServerlessAutoscalingPostgresUrl(NEON_POOLED)).toBe(true)
    expect(isLocalPostgresUrl(NEON_POOLED)).toBe(false)
    // The direct (non-pooler) Neon host is equally remote.
    expect(
      isServerlessAutoscalingPostgresUrl(
        'postgresql://user:pass@ep-cool-sky-123456.eu-central-1.aws.neon.tech/neondb',
      ),
    ).toBe(true)

    const pool = resolvePostgresPoolOptions({ POSTGRES_URL: NEON_POOLED })
    expect(pool.max).toBe(4)
    expect(pool.idleTimeoutMillis).toBe(5_000)
    expect(pool.connectionTimeoutMillis).toBe(30_000)
  })

  it('preserves the remote connection string byte-for-byte when building adapter args', () => {
    const args = buildPostgresAdapterArgs({
      NODE_ENV: 'production',
      POSTGRES_URL: NEON_POOLED,
    })

    // No host rewriting, no local-driver forcing: the URL reaches the adapter untouched.
    expect(args.pool?.connectionString).toBe(NEON_POOLED)
    expect('forceUseVercelPostgres' in args).toBe(false)
    expect(args.blocksAsJSON).toBe(true)
  })

  it('deduplicates read replicas exactly as before', () => {
    const replica1 =
      'postgresql://user:pass@ep-replica-1-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full'
    const replica2 =
      'postgresql://user:pass@ep-replica-2-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full'

    expect(
      resolveReadReplicaUrls({
        POSTGRES_URL: NEON_POOLED,
        POSTGRES_READ_REPLICA_URLS: `${replica1}, ${NEON_POOLED}, ${replica2}, ${replica1}`,
      }),
    ).toEqual([replica1, replica2])
  })

  it('disables schema push under NODE_ENV=test unless explicitly opted in', () => {
    // This is why the integration suite must pre-push the schema; it must not be changed silently.
    expect(buildPostgresAdapterArgs({ NODE_ENV: 'test' }).push).toBe(false)
    expect(buildPostgresAdapterArgs({ NODE_ENV: 'test', PAYLOAD_DB_PUSH: 'true' }).push).toBe(true)
    expect(buildPostgresAdapterArgs({ NODE_ENV: 'production' }).push).toBeUndefined()
  })

  it('exposes the Vercel/Neon adapter on the loaded config', async () => {
    // `buildConfig` returns a promise resolving to the SanitizedConfig. Its `db` entry is the
    // adapter produced by vercelPostgresAdapter: an object exposing `init`, the name and ID type.
    const resolved = await config
    const db = resolved.db as unknown as {
      name?: string
      defaultIDType?: string
      init?: unknown
    }

    expect(db).toBeTypeOf('object')
    expect(db.name).toBe('postgres')
    expect(db.defaultIDType).toBe('number')
    expect(db.init).toBeTypeOf('function')
  })
})
