// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildPostgresAdapterArgs,
  isLocalPostgresUrl,
  resolveLocalDriverConnectionString,
  resolvePoolOptions,
  usesDriftedLocalHost,
} from '@/lib/postgresAdapterConfig'

/**
 * Driver-selection regression coverage for `@payloadcms/db-vercel-postgres`.
 *
 * `node_modules/@payloadcms/db-vercel-postgres/dist/connect.js:13-24` picks the driver as:
 *
 *     const connectionString = this.poolOptions?.connectionString ?? process.env.POSTGRES_URL;
 *     if (!this.forceUseVercelPostgres && connectionString && [
 *         '127.0.0.1', 'localhost'
 *     ].includes(new URL(connectionString).hostname)) { new pg.Pool(...) }
 *     else { new VercelPool(...) }
 *
 * Two consequences drive this file:
 *
 * 1. `VercelPool` is `@neondatabase/serverless`'s `Pool`, which tunnels over `wss://<host>/v2`
 *    instead of opening plain TCP 5432. The Compose alias `postgres` is local to our
 *    `LOCAL_POSTGRES_HOSTS` but *not* to the adapter, so it silently took the WebSocket path.
 * 2. `forceUseVercelPostgres: true` forces the *serverless* driver — the opposite of what a local
 *    fix needs. The only lever that selects `pg.Pool` is the hostname inside
 *    `pool.connectionString`.
 *
 * These are driver-selection tests. They require no database and prove no database connection.
 */

/** Mirrors `connect.js` verbatim, including the `forceUseVercelPostgres` bypass. */
const adapterDriver = (
  adapterArgs: { forceUseVercelPostgres?: boolean; pool?: { connectionString?: string } },
  envPostgresUrl: string | undefined,
): 'pg.Pool' | 'VercelPool' => {
  const connectionString = adapterArgs.pool?.connectionString ?? envPostgresUrl
  if (
    !adapterArgs.forceUseVercelPostgres &&
    connectionString &&
    ['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname)
  ) {
    return 'pg.Pool'
  }
  return 'VercelPool'
}

const HOSTS = {
  localhost: 'postgres://postgres:postgres@localhost:5432/pocms',
  loopback: 'postgres://postgres:postgres@127.0.0.1:5432/pocms',
  composeAlias: 'postgres://postgres:postgres@postgres:5432/pocms',
  composeAliasCustomPort: 'postgres://postgres:postgres@postgres:5433/pocms',
  composeAliasQuery: 'postgres://postgres:postgres@postgres:5432/pocms?sslmode=disable',
  ipv6Loopback: 'postgres://postgres:postgres@[::1]:5432/pocms',
  neonPooled:
    'postgresql://user:pass@ep-cool-sky-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full',
  neonDirect: 'postgresql://user:pass@ep-cool-sky-123456.eu-central-1.aws.neon.tech/neondb',
} as const

describe('PostgreSQL driver selection — baseline from installed adapter', () => {
  it('transcribes the real connect.js predicate rather than assuming it', () => {
    const connectPath = join(
      process.cwd(),
      'node_modules',
      '@payloadcms',
      'db-vercel-postgres',
      'dist',
      'connect.js',
    )
    const source = readFileSync(connectPath, 'utf8')

    // The hardcoded hostname list that causes the drift.
    expect(source).toContain("'127.0.0.1'")
    expect(source).toContain("'localhost'")
    expect(source).toContain('.includes(new URL(connectionString).hostname)')
    expect(source).toContain('new VercelPool(this.poolOptions)')
    // The flag bypasses the pg.Pool branch, i.e. `true` means "use the serverless driver".
    expect(source).toMatch(/!this\.forceUseVercelPostgres\s*&&\s*connectionString\s*&&/)
  })

  it('documents that the adapter reads the connection string from poolOptions', () => {
    const connectPath = join(
      process.cwd(),
      'node_modules',
      '@payloadcms',
      'db-vercel-postgres',
      'dist',
      'connect.js',
    )
    expect(readFileSync(connectPath, 'utf8')).toContain(
      'this.poolOptions?.connectionString ?? process.env.POSTGRES_URL',
    )
  })

  it.each([
    ['localhost', HOSTS.localhost, 'pg.Pool'],
    ['127.0.0.1', HOSTS.loopback, 'pg.Pool'],
    ['postgres (compose alias)', HOSTS.composeAlias, 'VercelPool'],
    ['[::1]', HOSTS.ipv6Loopback, 'VercelPool'],
    ['Neon pooled', HOSTS.neonPooled, 'VercelPool'],
  ] as const)('%s selects %s with no override', (_label, url, expected) => {
    expect(adapterDriver({ pool: { connectionString: url } }, url)).toBe(expected)
  })

  it('shows forceUseVercelPostgres: true forces the serverless driver, not the plain one', () => {
    // This is why the flag is not the fix for the local-host drift.
    const forced = { forceUseVercelPostgres: true, pool: { connectionString: HOSTS.loopback } }
    expect(adapterDriver(forced, HOSTS.loopback)).toBe('VercelPool')
  })
})

describe('PostgreSQL driver selection — drift detection', () => {
  it('reports no drift for hosts the adapter already treats as local', () => {
    for (const url of [HOSTS.localhost, HOSTS.loopback]) {
      expect(isLocalPostgresUrl(url)).toBe(true)
      expect(usesDriftedLocalHost(url)).toBe(false)
      expect(resolveLocalDriverConnectionString(url)).toBeUndefined()
    }
  })

  it('detects drift for the Compose alias `postgres`', () => {
    expect(isLocalPostgresUrl(HOSTS.composeAlias)).toBe(true)
    expect(
      adapterDriver({ pool: { connectionString: HOSTS.composeAlias } }, HOSTS.composeAlias),
    ).toBe('VercelPool')
    expect(usesDriftedLocalHost(HOSTS.composeAlias)).toBe(true)
  })

  it('detects drift for IPv6 loopback', () => {
    expect(isLocalPostgresUrl(HOSTS.ipv6Loopback)).toBe(true)
    expect(usesDriftedLocalHost(HOSTS.ipv6Loopback)).toBe(true)
  })

  it('reports no drift for remote hosts, leaving production untouched', () => {
    for (const url of [HOSTS.neonPooled, HOSTS.neonDirect]) {
      expect(isLocalPostgresUrl(url)).toBe(false)
      expect(usesDriftedLocalHost(url)).toBe(false)
      expect(resolveLocalDriverConnectionString(url)).toBeUndefined()
    }
  })

  it('returns undefined for unset or unparseable input', () => {
    expect(usesDriftedLocalHost(undefined)).toBe(false)
    expect(usesDriftedLocalHost('')).toBe(false)
    expect(usesDriftedLocalHost('not-a-url')).toBe(false)
  })
})

describe('PostgreSQL driver selection — rewrite closes the gap', () => {
  it('rewrites the Compose alias to loopback so the adapter selects pg.Pool', () => {
    const rewritten = resolveLocalDriverConnectionString(HOSTS.composeAlias)

    expect(rewritten).toBe('postgres://postgres:postgres@127.0.0.1:5432/pocms')
    expect(adapterDriver({ pool: { connectionString: rewritten } }, HOSTS.composeAlias)).toBe(
      'pg.Pool',
    )
  })

  it('preserves credentials, database path, scheme, and query parameters', () => {
    expect(resolveLocalDriverConnectionString(HOSTS.composeAliasQuery)).toBe(
      'postgres://postgres:postgres@127.0.0.1:5432/pocms?sslmode=disable',
    )
    expect(resolveLocalDriverConnectionString('postgresql://u%40corp:p%3Aw@postgres:5432/db')).toBe(
      'postgresql://u@corp:p:w@127.0.0.1:5432/db',
    )
  })

  it('carries a non-default port over as a parameter, because pg prefers options.port', () => {
    const rewritten = resolveLocalDriverConnectionString(HOSTS.composeAliasCustomPort)

    // Hostname is loopback (so the adapter picks pg.Pool); the real port travels in the query.
    expect(rewritten).toBe('postgres://postgres:postgres@127.0.0.1:5432/pocms?port=5433')
    expect(adapterDriver({ pool: { connectionString: rewritten } }, HOSTS.composeAlias)).toBe(
      'pg.Pool',
    )
  })

  it('leaves adapter args for remote hosts byte-identical to the unresolved pool options', () => {
    const env = { NODE_ENV: 'production', POSTGRES_URL: HOSTS.neonPooled }
    const args = buildPostgresAdapterArgs(env)

    expect(args.pool?.connectionString).toBe(HOSTS.neonPooled)
    expect('forceUseVercelPostgres' in args).toBe(false)
    expect(adapterDriver(args, HOSTS.neonPooled)).toBe('VercelPool')
  })

  it('rewrites adapter args for the Compose alias and keeps pool sizing', () => {
    const args = buildPostgresAdapterArgs({
      NODE_ENV: 'development',
      POSTGRES_URL: HOSTS.composeAlias,
    })

    expect(args.pool?.connectionString).toBe('postgres://postgres:postgres@127.0.0.1:5432/pocms')
    expect(args.pool?.max).toBe(10)
    expect(args.pool?.idleTimeoutMillis).toBe(30_000)
    expect(adapterDriver(args, HOSTS.composeAlias)).toBe('pg.Pool')
  })

  it('keeps loopback adapter args unchanged', () => {
    const env = { NODE_ENV: 'test', POSTGRES_URL: HOSTS.loopback }
    expect(resolvePoolOptions(env).connectionString).toBe(HOSTS.loopback)
    expect(buildPostgresAdapterArgs(env).pool?.connectionString).toBe(HOSTS.loopback)
  })
})
