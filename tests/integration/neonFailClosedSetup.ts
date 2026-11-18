// @vitest-environment node
/**
 * Fail-closed setup for `pnpm test:int:neon`.
 *
 * This setup executes before the integration spec imports `payload.config.ts`. It removes any
 * shell-provided PAYLOAD_DB_PUSH flag immediately, then requires explicit owner approval and
 * verifies the approved test branch/endpoint through read-only Neon control-plane metadata. The
 * schema-push flag is set only after all checks pass.
 */
import { randomBytes } from 'node:crypto'

import { beforeAll } from 'vitest'

import {
  activateVerifiedNeonSchemaPush,
  NeonIntegrationEnvironmentError,
  resolveNeonTestTarget,
  suppressExternalSchemaPush,
  type VerifiedNeonTestTarget,
  verifyNeonTestTargetMetadata,
} from './neonTestHarness'

declare global {
  var __NEON_TEST_TARGET__: VerifiedNeonTestTarget | undefined
}

// payload.config.ts is imported only after the preflight. Clearing this at module evaluation makes
// an externally supplied flag unavailable to any config import before approval is complete.
const schemaPushWasExternallyEnabled = suppressExternalSchemaPush(process.env)

beforeAll(async () => {
  if (schemaPushWasExternallyEnabled) {
    throw new NeonIntegrationEnvironmentError(
      'PAYLOAD_DB_PUSH=true was supplied before target verification. Remove it from the shell; the harness sets it only after all safety checks pass.',
    )
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new NeonIntegrationEnvironmentError(
      'The Neon integration suite must run with NODE_ENV=test. Refusing to initialize Payload.',
    )
  }

  const env = process.env as Record<string, string | undefined>

  // Local checks require both URLs, explicit endpoint/database/branch identities, and both owner
  // opt-ins. They perform no network access and do not expose URL contents.
  const target = resolveNeonTestTarget(env)

  // This read-only Neon API check proves that the URL endpoint belongs to the independently
  // supplied, non-default, unprotected branch ID and that the application's endpoint belongs to
  // another branch. Any API error fails closed without printing the response body.
  const verifiedTarget = await verifyNeonTestTargetMetadata(target, env)

  // Last local revalidation, then point the real Payload adapter at only the verified target and
  // enable schema push. Read replicas are removed so they cannot reach an app/production branch.
  activateVerifiedNeonSchemaPush(env, verifiedTarget)

  if (!process.env.PAYLOAD_SECRET || process.env.PAYLOAD_SECRET.length < 16) {
    process.env.PAYLOAD_SECRET = randomBytes(32).toString('hex')
  }

  // The form-builder hook recognizes this flag/header and will not send a live email during the
  // REST submission test, even if a developer has RESEND_API_KEY configured locally.
  process.env.PLAYWRIGHT_TEST = 'true'

  globalThis.__NEON_TEST_TARGET__ = verifiedTarget
}, 120_000)
