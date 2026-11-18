// @vitest-environment node
/**
 * Guard-rail tests for the fail-closed harness.
 *
 * These run in the normal `test:int` suite (not the pg suite) because they must pass without any
 * database. They pin the refusals that make `test:int:pg` safe: no implicit `POSTGRES_URL` fallback,
 * no remote host, no non-disposable database name.
 */
import { describe, expect, it } from 'vitest'

import {
  DISPOSABLE_DB_MARKER,
  IntegrationEnvironmentError,
  resolveTestDatabaseTarget,
} from '../integration/postgresHarness'

const VALID = 'postgres://postgres:postgres@127.0.0.1:5433/pocms_test'

describe('fail-closed integration harness guards', () => {
  it('accepts a loopback disposable database and derives a maintenance URL', () => {
    const target = resolveTestDatabaseTarget({ POSTGRES_TEST_URL: VALID })

    expect(target.databaseName).toBe('pocms_test')
    expect(target.host).toBe('127.0.0.1')
    expect(target.port).toBe('5433')
    expect(target.databaseUrl).toBe(VALID)
    // Lifecycle operations use the always-present `postgres` maintenance database.
    expect(target.adminUrl).toContain('/postgres')
  })

  it('accepts localhost and ::1 as integration hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(() =>
        resolveTestDatabaseTarget({ POSTGRES_TEST_URL: `postgres://u:p@${host}:5432/pocms_test` }),
      ).not.toThrow()
    }
  })

  it('refuses to run when POSTGRES_TEST_URL is unset, and never falls back to POSTGRES_URL', () => {
    expect(() =>
      resolveTestDatabaseTarget({
        POSTGRES_URL: 'postgres://postgres:postgres@127.0.0.1/pocms_test',
      }),
    ).toThrow(IntegrationEnvironmentError)

    expect(() => resolveTestDatabaseTarget({})).toThrow(/POSTGRES_TEST_URL is not set/)
  })

  it('refuses remote or managed hosts even when the database name looks disposable', () => {
    for (const host of [
      'ep-cool-sky-123456-pooler.eu-central-1.aws.neon.tech',
      'db.example.com',
      'postgres',
    ]) {
      expect(() =>
        resolveTestDatabaseTarget({ POSTGRES_TEST_URL: `postgres://u:p@${host}:5432/pocms_test` }),
      ).toThrow(/not an allowed integration host/)
    }
  })

  it('refuses a database name without the disposable marker', () => {
    expect(() =>
      resolveTestDatabaseTarget({ POSTGRES_TEST_URL: 'postgres://u:p@127.0.0.1:5432/pocms' }),
    ).toThrow(new RegExp(DISPOSABLE_DB_MARKER))
  })

  it('refuses an unparseable connection string', () => {
    expect(() => resolveTestDatabaseTarget({ POSTGRES_TEST_URL: 'not-a-url' })).toThrow(
      /not a valid PostgreSQL connection string/,
    )
  })

  it('reports the marker the operator must include', () => {
    expect(DISPOSABLE_DB_MARKER).toBe('pocms_test')
  })
})
