// @vitest-environment node
/**
 * Guard-rail tests for the Neon integration harness.
 *
 * These run in the normal `test:int` suite because they must pass without any database. They pin
 * the refusals that make `test:int:neon` safe to run, above all that it can never target the
 * application's own Neon database.
 *
 * Fake URLs are built from obviously synthetic components; no real credential appears here.
 */
import { describe, expect, it } from 'vitest'

import { detectNeonEndpointId, isNeonHost } from '../integration/neonTarget'
import {
  assertDestructiveOptIn,
  assertProcessPointsAtTestDatabase,
  DESTRUCTIVE_OPT_IN_ENV,
  DISPOSABLE_DB_MARKER,
  NeonIntegrationEnvironmentError,
  resolveNeonTestTarget,
} from '../integration/neonTestHarness'

const TEST_URL =
  'postgresql://u:p@ep-test-branch-123456-pooler.eu-central-1.aws.neon.tech/pocms_test?sslmode=require'
const APP_URL =
  'postgresql://u:p@ep-prod-branch-999999-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require'

const baseEnv = (): Record<string, string | undefined> => ({
  POSTGRES_TEST_URL: TEST_URL,
  POSTGRES_URL: APP_URL,
})

describe('Neon target parsing', () => {
  it('extracts endpoint ids from pooled and direct Neon hosts', () => {
    expect(detectNeonEndpointId('ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech')).toBe(
      'ep-cool-morning-a2bc',
    )
    expect(detectNeonEndpointId('ep-cool-morning-a2bc.eu-central-1.aws.neon.tech')).toBe(
      'ep-cool-morning-a2bc',
    )
    expect(detectNeonEndpointId('db.example.com')).toBeNull()
    expect(detectNeonEndpointId('')).toBeNull()
  })

  it('recognises Neon hosts only', () => {
    expect(isNeonHost('ep-x-1.eu-central-1.aws.neon.tech')).toBe(true)
    expect(isNeonHost('127.0.0.1')).toBe(false)
    expect(isNeonHost('postgres')).toBe(false)
    expect(isNeonHost('db.example.com')).toBe(false)
  })
})

describe('Neon integration harness guards', () => {
  it('accepts a disposable Neon branch distinct from the application database', () => {
    const target = resolveNeonTestTarget(baseEnv())

    expect(target.endpointId).toBe('ep-test-branch-123456')
    expect(target.database).toBe('pocms_test')
    // The connection string is carried through unchanged for the adapter to use.
    expect(target.connectionString).toBe(TEST_URL)
  })

  it('refuses when POSTGRES_TEST_URL is unset and never falls back to POSTGRES_URL', () => {
    expect(() => resolveNeonTestTarget({ POSTGRES_URL: APP_URL })).toThrow(
      /POSTGRES_TEST_URL is not set/,
    )
  })

  it('refuses when POSTGRES_TEST_URL equals POSTGRES_URL', () => {
    expect(() =>
      resolveNeonTestTarget({ POSTGRES_TEST_URL: APP_URL, POSTGRES_URL: APP_URL }),
    ).toThrow(/identical to POSTGRES_URL/)
  })

  it('refuses a non-Neon host, including localhost and Docker aliases', () => {
    for (const host of ['127.0.0.1', 'localhost', 'postgres', 'db.example.com']) {
      expect(() =>
        resolveNeonTestTarget({
          POSTGRES_TEST_URL: `postgresql://u:p@${host}:5432/pocms_test`,
        }),
      ).toThrow(/not a Neon host/)
    }
  })

  it('refuses the same Neon endpoint as the application, even with a different database name', () => {
    // Same endpoint id, different database name: still the same Neon compute and project.
    const sameEndpoint =
      'postgresql://u:p@ep-prod-branch-999999-pooler.eu-central-1.aws.neon.tech/pocms_test?sslmode=require'

    expect(() =>
      resolveNeonTestTarget({ POSTGRES_TEST_URL: sameEndpoint, POSTGRES_URL: APP_URL }),
    ).toThrow(/same Neon endpoint/)
  })

  it('refuses the same database name as the application', () => {
    const sameDbName =
      'postgresql://u:p@ep-other-branch-777777-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require'

    expect(() =>
      resolveNeonTestTarget({ POSTGRES_TEST_URL: sameDbName, POSTGRES_URL: APP_URL }),
    ).toThrow(/same database name/)
  })

  it('refuses a database name without the disposable marker', () => {
    const noMarker =
      'postgresql://u:p@ep-other-branch-777777-pooler.eu-central-1.aws.neon.tech/scratch?sslmode=require'

    expect(() =>
      resolveNeonTestTarget({ POSTGRES_TEST_URL: noMarker, POSTGRES_URL: APP_URL }),
    ).toThrow(new RegExp(DISPOSABLE_DB_MARKER))
  })

  it('does not treat a "test"-looking name as sufficient proof of disposability', () => {
    // `mytest`/`test` contain the word but not the required marker, so they stay refused.
    for (const name of ['test', 'mytest', 'pocms_staging']) {
      const url = `postgresql://u:p@ep-other-branch-777777-pooler.eu-central-1.aws.neon.tech/${name}?sslmode=require`
      expect(() =>
        resolveNeonTestTarget({ POSTGRES_TEST_URL: url, POSTGRES_URL: APP_URL }),
      ).toThrow(new RegExp(DISPOSABLE_DB_MARKER))
    }
  })

  it('refuses a target that names no database', () => {
    expect(() =>
      resolveNeonTestTarget({
        POSTGRES_TEST_URL: 'postgresql://u:p@ep-x-1.eu-central-1.aws.neon.tech/',
      }),
    ).toThrow(/does not name a database/)
  })

  it('refuses an unparseable connection string', () => {
    expect(() =>
      resolveNeonTestTarget({ POSTGRES_TEST_URL: 'not-a-url', POSTGRES_URL: APP_URL }),
    ).toThrow(/not a valid PostgreSQL connection string/)
  })
})

describe('Destructive operation guards', () => {
  it('requires explicit opt-in before any destructive operation', () => {
    const env = baseEnv()
    const target = resolveNeonTestTarget(env)

    expect(() => assertDestructiveOptIn(env, target)).toThrow(new RegExp(DESTRUCTIVE_OPT_IN_ENV))
    expect(() =>
      assertDestructiveOptIn({ ...env, [DESTRUCTIVE_OPT_IN_ENV]: 'yes' }, target),
    ).toThrow(NeonIntegrationEnvironmentError)
    expect(() =>
      assertDestructiveOptIn({ ...env, [DESTRUCTIVE_OPT_IN_ENV]: 'true' }, target),
    ).not.toThrow()
  })

  it('refuses a destructive operation if the target changed mid-run', () => {
    const env = baseEnv()
    const target = resolveNeonTestTarget(env)

    const switched = {
      ...env,
      [DESTRUCTIVE_OPT_IN_ENV]: 'true',
      POSTGRES_TEST_URL:
        'postgresql://u:p@ep-switched-555555-pooler.eu-central-1.aws.neon.tech/pocms_test?sslmode=require',
    }

    expect(() => assertDestructiveOptIn(switched, target)).toThrow(/changed during the run/)
  })

  it('refuses to boot Payload unless the process points at the test database', () => {
    const target = resolveNeonTestTarget(baseEnv())

    expect(() => assertProcessPointsAtTestDatabase(target, { POSTGRES_URL: APP_URL })).toThrow(
      /would not use the disposable test database/,
    )
    expect(() =>
      assertProcessPointsAtTestDatabase(target, { POSTGRES_URL: TEST_URL }),
    ).not.toThrow()
  })
})
