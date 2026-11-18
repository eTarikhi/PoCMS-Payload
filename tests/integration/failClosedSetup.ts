// @vitest-environment node
/**
 * Fail-closed setup for the PostgreSQL integration suite (`pnpm test:int:pg`).
 *
 * Runs once before any integration spec. Every failure mode here throws, so a broken or missing
 * database produces a red run instead of a green run full of skipped tests. This is the deliberate
 * counterpart to `tests/int/api.int.spec.ts`, whose permissive skip behaviour is left untouched.
 *
 * Because it throws in `beforeAll`-equivalent position, Vitest reports the suite as failed and
 * never executes the specs.
 */
import { beforeAll } from 'vitest'

import {
  assertDatabaseReachable,
  assertPostgres16,
  IntegrationEnvironmentError,
  resolveTestDatabaseTarget,
  type TestDatabaseTarget,
} from '../integration/postgresHarness'

declare global {
  var __PG_TEST_TARGET__: TestDatabaseTarget | undefined
}

beforeAll(async () => {
  const target = resolveTestDatabaseTarget(process.env)
  await assertDatabaseReachable(target)
  await assertPostgres16(target)
  globalThis.__PG_TEST_TARGET__ = target
}, 60_000)

// Surface a readable message rather than a bare stack when the environment is wrong.
process.on('unhandledRejection', (reason) => {
  if (reason instanceof IntegrationEnvironmentError) {
    console.error(`\n[test:int:pg] ${reason.message}\n`)
  }
})
