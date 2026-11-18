// @vitest-environment node
/**
 * Fail-closed setup for the Neon integration suite (`pnpm test:int:neon`).
 *
 * Every failure mode throws from `beforeAll`, so Vitest marks the file failed and never executes
 * the specs. There is no skip path: a missing or unsafe target can only produce a red run.
 *
 * Order matters. The target is validated *before* `POSTGRES_URL` is overwritten, because
 * `payload.config.ts` builds its database pool from `POSTGRES_URL`; overwriting first would risk
 * pointing Payload at the application database.
 */
import { beforeAll } from 'vitest'

import {
  assertProcessPointsAtTestDatabase,
  NeonIntegrationEnvironmentError,
  resolveNeonTestTarget,
  type NeonTestTarget,
} from './neonTestHarness'

declare global {
  var __NEON_TEST_TARGET__: NeonTestTarget | undefined
}

beforeAll(() => {
  const env = process.env as Record<string, string | undefined>

  // 1. Validate the disposable target (throws if unsafe, missing, or not Neon).
  const target = resolveNeonTestTarget(env)

  // 2. Only now point the application's variable at the test database. The adapter and
  //    payload.config.ts both read POSTGRES_URL, so this is what makes the run target Neon's
  //    disposable branch instead of the owner's database.
  process.env.POSTGRES_URL = target.connectionString

  // 3. Prove the process really is pointed at the test database before any spec can boot Payload.
  assertProcessPointsAtTestDatabase(target)

  if (!process.env.PAYLOAD_SECRET || process.env.PAYLOAD_SECRET.length < 16) {
    process.env.PAYLOAD_SECRET = 'neon-integration-placeholder-secret-32-chars'
  }

  globalThis.__NEON_TEST_TARGET__ = target
}, 60_000)

process.on('unhandledRejection', (reason) => {
  if (reason instanceof NeonIntegrationEnvironmentError) {
    console.error(`\n[test:int:neon] ${reason.message}\n`)
  }
})
