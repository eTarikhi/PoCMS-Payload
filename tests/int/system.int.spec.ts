import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { databaseSnapshot } from '@/system/database'
import {
  commitInfo,
  environmentInfo,
  formatBytes,
  integrationStatuses,
  isNewer,
  packageVersions,
  parseVersion,
} from '@/system/status'

/** The System page's data (CR-12 E6): pure helpers and a read-only database snapshot. */
describe('System', () => {
  it('reports integrations as set only when every variable is set', () => {
    const statuses = integrationStatuses({
      POSTGRES_URL: 'postgres://example',
      BLOB_READ_WRITE_TOKEN: 'token',
      VERCEL_TOKEN: 'token',
      // VERCEL_PROJECT_ID deliberately missing: the integration needs both.
      CRON_SECRET: ' ',
    })
    const byName = Object.fromEntries(statuses.map((status) => [status.name, status]))
    expect(byName.database.configured).toBe(true)
    expect(byName.blob.configured).toBe(true)
    expect(byName.vercel.configured).toBe(false)
    expect(byName.cron.configured).toBe(false) // whitespace is not a value
    expect(byName.email.needs).toEqual(['RESEND_API_KEY'])
    // Names only, never the values.
    expect(JSON.stringify(statuses)).not.toContain('postgres://example')
    expect(JSON.stringify(statuses)).not.toContain('token')
  })

  it('names the environment', () => {
    expect(environmentInfo({ VERCEL_ENV: 'production', VERCEL_URL: 'x.vercel.app' })).toEqual({
      label: 'Production',
      detail: 'Vercel · x.vercel.app',
    })
    expect(environmentInfo({ VERCEL_ENV: 'preview' }).label).toBe('Preview')
    expect(environmentInfo({ NODE_ENV: 'development' }).label).toBe('Development')
    expect(environmentInfo({ NODE_ENV: 'test' }).label).toBe('Test')
  })

  it('reads the commit from Vercel, from git, or not at all', () => {
    expect(
      commitInfo({
        VERCEL_GIT_COMMIT_SHA: 'abcdef0123456789',
        VERCEL_GIT_COMMIT_REF: 'main',
        VERCEL_GIT_COMMIT_MESSAGE: 'A change',
      }),
    ).toEqual({
      short: 'abcdef0',
      full: 'abcdef0123456789',
      ref: 'main',
      message: 'A change',
      source: 'Vercel',
    })
    expect(commitInfo({}, { short: 'abc1234', full: 'abc1234def', message: 'Local' })).toMatchObject(
      { short: 'abc1234', source: 'git', message: 'Local' },
    )
    expect(commitInfo({})).toEqual({ short: 'unknown', source: 'unknown' })
  })

  it('compares versions, including ranges and prereleases', () => {
    expect(parseVersion('v16.3.8')).toEqual([16, 3, 8])
    expect(parseVersion('^3.90.2')).toEqual([3, 90, 2])
    expect(parseVersion('4.0.0-beta.1')).toEqual([4, 0, 0])
    expect(parseVersion('not a version')).toBeNull()
    expect(isNewer('16.4.0', '16.3.8')).toBe(true)
    expect(isNewer('16.3.9', '^16.3.8')).toBe(true)
    expect(isNewer('16.3.8', '16.3.8')).toBe(false)
    expect(isNewer('3.90.2', '4.0.0')).toBe(false)
  })

  it('shows the declared package versions and the running Node', () => {
    const versions = packageVersions(
      {
        version: '1.0.0',
        dependencies: { payload: '3.90.2', next: '16.3.8', react: '19.2.6' },
      },
      'v22.0.0',
    )
    expect(versions).toEqual({
      app: '1.0.0',
      payload: '3.90.2',
      next: '16.3.8',
      react: '19.2.6',
      node: 'v22.0.0',
    })
    expect(packageVersions({}).payload).toBe('not declared')
  })

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 kB')
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB')
    expect(formatBytes(Number.NaN)).toBe('–')
  })
})

describe('System database snapshot', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('lists tables, counts connections and compares migrations', async () => {
    const snapshot = await databaseSnapshot(payload, [
      '20261020_125655_baseline',
      '20990101_000000_future',
    ])
    expect(snapshot.error).toBeNull()
    expect(snapshot.tables.map((table) => table.name)).toContain('users')
    expect(snapshot.totalBytes).toBeGreaterThan(0)
    expect(snapshot.connections).toBeGreaterThan(0)
    // This database was created by development schema push: nothing is recorded, so every committed
    // migration is pending until `pnpm migrate:adopt` runs. A migration in the future is pending too.
    expect(snapshot.pending).toContain('20990101_000000_future')
    expect(Array.isArray(snapshot.migrations)).toBe(true)
  })
})
