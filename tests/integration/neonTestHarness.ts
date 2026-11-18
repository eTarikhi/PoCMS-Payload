/**
 * Fail-closed harness for Neon integration testing.
 *
 * The supported runtime is Vercel/Neon PostgreSQL in every environment, including local
 * development. This harness never uses a local PostgreSQL service or a plain `pg.Pool`.
 *
 * The normal application `POSTGRES_URL` is often the owner's production/development branch. Before
 * Payload is imported or booted, this harness requires an explicitly approved disposable Neon
 * branch, verifies that approval against Neon control-plane metadata, confirms the app and test
 * URLs resolve to different branches, and only then enables schema push in the test process.
 *
 * Never include a URL, password, API key, query parameter, database name, or connection error in an
 * error message. Connection strings are held only in memory so the real adapter can use the
 * verified test target.
 */
import { createNeonClient } from '@neon/sdk'

import { detectNeonEndpointId, isNeonHost } from './neonTarget'

type Environment = Record<string, string | undefined>

type MetadataOutcome<T> = {
  data?: T
  error?: unknown
}

type NeonBranchMetadata = {
  id: string
  project_id: string
  default: boolean
  protected: boolean
}

type NeonEndpointMetadata = {
  id: string
  project_id: string
  branch_id: string
  host: string
  type: 'read_only' | 'read_write'
  disabled: boolean
}

/** Small read-only subset of the Neon SDK used for branch/endpoint identity verification. */
export type NeonMetadataClient = {
  branches: {
    get: (params: {
      projectId: string
      branchId: string
    }) => Promise<MetadataOutcome<NeonBranchMetadata>>
  }
  postgres: {
    endpoints: {
      get: (params: {
        projectId: string
        endpointId: string
      }) => Promise<MetadataOutcome<NeonEndpointMetadata>>
      listByBranch: (params: {
        projectId: string
        branchId: string
      }) => Promise<MetadataOutcome<NeonEndpointMetadata[]>>
    }
  }
}

export type NeonMetadataClientFactory = (apiKey: string) => NeonMetadataClient

export class NeonIntegrationEnvironmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NeonIntegrationEnvironmentError'
  }
}

/** Required operator assertion that the approved test branch may be discarded. */
export const DISPOSABLE_BRANCH_OPT_IN_ENV = 'NEON_TEST_BRANCH_DISPOSABLE'

/** Required opt-in before schema-changing operations are enabled. */
export const DESTRUCTIVE_OPT_IN_ENV = 'PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE'

/**
 * A target is not returned until the independent Neon API check verifies its branch and endpoint.
 * The private symbol makes activation reject a merely parsed/unverified target at runtime.
 */
const VERIFIED_TARGET = Symbol('verifiedNeonTestTarget')

export type NeonTestTarget = {
  endpointId: string
  branchId: string
  projectId: string
  database: string
  appEndpointId: string
  appProjectId: string
  /** The normal application URL, retained only in memory for a last pre-push comparison. */
  applicationConnectionString: string
  /** The validated test URL, never printed. */
  connectionString: string
}

export type VerifiedNeonTestTarget = NeonTestTarget & {
  readonly [VERIFIED_TARGET]: true
}

const defaultMetadataClientFactory: NeonMetadataClientFactory = (apiKey) =>
  createNeonClient({ apiKey, retries: 0, requestTimeoutMs: 15_000 })

const fail = (message: string): never => {
  throw new NeonIntegrationEnvironmentError(message)
}

const requiredEnv = (env: Environment, name: string, explanation: string): string => {
  const value = env[name]?.trim()
  if (!value) return fail(`${name} is required. ${explanation}`)
  return value
}

type ParsedPostgresTarget = {
  endpointId: string
  database: string
  hostname: string
}

/** Normalizes only Neon's official pooler hostname variant; the rest of the hostname must match. */
const normalizeNeonEndpointHostname = (hostname: string): string => {
  const normalized = hostname.trim().toLowerCase()
  const separator = normalized.indexOf('.')
  if (separator < 0) return normalized

  const endpointLabel = normalized.slice(0, separator)
  const directEndpointLabel = endpointLabel.endsWith('-pooler')
    ? endpointLabel.slice(0, -'-pooler'.length)
    : endpointLabel

  return `${directEndpointLabel}${normalized.slice(separator)}`
}

const parsePostgresTarget = (raw: string, variable: string): ParsedPostgresTarget => {
  if (!/^postgres(?:ql)?:\/\//i.test(raw)) {
    fail(`${variable} must be a PostgreSQL connection URL. Refusing to guess.`)
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return fail(`${variable} is not a valid PostgreSQL connection URL.`)
  }

  const host = parsed.hostname.toLowerCase()
  if (!isNeonHost(host)) {
    fail(
      `${variable} must point to a Neon host. Local PostgreSQL and other providers are unsupported.`,
    )
  }

  const endpointId = detectNeonEndpointId(host)
  if (!endpointId) {
    return fail(`${variable} does not contain a recognizable Neon endpoint ID.`)
  }

  let database: string
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  } catch {
    return fail(`${variable} contains an invalid database path.`)
  }
  if (!database) {
    return fail(`${variable} must name its database explicitly.`)
  }

  return { endpointId, database, hostname: host }
}

const assertIdentifier = (value: string, pattern: RegExp, variable: string): void => {
  if (!pattern.test(value)) {
    fail(`${variable} is not a valid Neon resource identifier.`)
  }
}

/**
 * Performs local, non-network safety checks and returns the exact target that must be verified
 * against Neon metadata before any database connection is made.
 */
export function resolveNeonTestTarget(env: Environment): NeonTestTarget {
  const testUrl = requiredEnv(
    env,
    'POSTGRES_TEST_URL',
    'Set it to the connection URL for the approved disposable Neon branch; it never falls back.',
  )
  const appUrl = requiredEnv(
    env,
    'POSTGRES_URL',
    'The normal application URL is required so the harness can identify and reject its branch.',
  )
  const test = parsePostgresTarget(testUrl, 'POSTGRES_TEST_URL')
  const app = parsePostgresTarget(appUrl, 'POSTGRES_URL')

  if (test.endpointId === app.endpointId) {
    fail(
      'POSTGRES_TEST_URL and POSTGRES_URL use the same Neon endpoint. A different database name or URL is not sufficient.',
    )
  }

  const projectId = requiredEnv(
    env,
    'NEON_TEST_PROJECT_ID',
    'Set the Neon project that owns the approved test branch.',
  )
  const appProjectId = requiredEnv(
    env,
    'NEON_APP_PROJECT_ID',
    'Set the Neon project that owns the normal application endpoint.',
  )
  const branchId = requiredEnv(
    env,
    'NEON_TEST_BRANCH_ID',
    'Copy the approved branch ID independently from Neon; the URL hostname alone is not approval.',
  )
  const expectedEndpointId = requiredEnv(
    env,
    'NEON_TEST_ENDPOINT_ID',
    'Copy the approved read-write endpoint ID independently from Neon metadata.',
  )
  const expectedDatabase = requiredEnv(
    env,
    'NEON_TEST_DATABASE',
    'Set the exact database name approved for this test branch.',
  )

  assertIdentifier(branchId, /^br-[a-z0-9-]+$/i, 'NEON_TEST_BRANCH_ID')
  assertIdentifier(expectedEndpointId, /^ep-[a-z0-9-]+$/i, 'NEON_TEST_ENDPOINT_ID')

  if (expectedEndpointId.toLowerCase() !== test.endpointId.toLowerCase()) {
    fail('NEON_TEST_ENDPOINT_ID does not match the endpoint in POSTGRES_TEST_URL.')
  }
  if (expectedDatabase !== test.database) {
    fail('NEON_TEST_DATABASE does not match the database in POSTGRES_TEST_URL.')
  }
  if (env[DISPOSABLE_BRANCH_OPT_IN_ENV] !== 'true') {
    fail(
      `${DISPOSABLE_BRANCH_OPT_IN_ENV} must be "true" to explicitly designate this approved Neon branch as disposable.`,
    )
  }
  if (env[DESTRUCTIVE_OPT_IN_ENV] !== 'true') {
    fail(
      `${DESTRUCTIVE_OPT_IN_ENV} must be "true" to authorize schema-changing test setup on the approved disposable branch.`,
    )
  }
  if (!env.NEON_API_KEY?.trim()) {
    fail(
      'NEON_API_KEY is required so the harness can independently verify branch and endpoint metadata.',
    )
  }
  if (env.PAYLOAD_DROP_DATABASE === 'true') {
    fail('PAYLOAD_DROP_DATABASE=true is prohibited by the Neon integration harness.')
  }

  return {
    endpointId: test.endpointId,
    branchId,
    projectId,
    database: test.database,
    appEndpointId: app.endpointId,
    appProjectId,
    applicationConnectionString: appUrl,
    connectionString: testUrl,
  }
}

const metadataFailed = (): never =>
  fail(
    'Neon metadata could not independently confirm the approved test branch and endpoint. Check the Neon API key and project/branch/endpoint IDs; no database connection was attempted.',
  )

/**
 * Uses read-only Neon control-plane metadata to bind the supplied connection URL to the explicitly
 * approved branch ID, verifies the app endpoint belongs to a different branch, and returns a
 * branded target. No database URL is sent to the Neon API and API error bodies are never surfaced.
 */
export async function verifyNeonTestTargetMetadata(
  target: NeonTestTarget,
  env: Environment,
  clientFactory: NeonMetadataClientFactory = defaultMetadataClientFactory,
): Promise<VerifiedNeonTestTarget> {
  const apiKey = env.NEON_API_KEY?.trim()
  if (!apiKey) {
    return fail('NEON_API_KEY is required to independently verify the approved Neon target.')
  }

  try {
    const testUrlTarget = parsePostgresTarget(target.connectionString, 'POSTGRES_TEST_URL')
    const appUrlTarget = parsePostgresTarget(target.applicationConnectionString, 'POSTGRES_URL')
    if (
      testUrlTarget.endpointId !== target.endpointId ||
      testUrlTarget.database !== target.database ||
      appUrlTarget.endpointId !== target.appEndpointId
    ) {
      return metadataFailed()
    }

    const neon = clientFactory(apiKey)
    const branchResult = await neon.branches.get({
      projectId: target.projectId,
      branchId: target.branchId,
    })
    const branch = branchResult.error ? undefined : branchResult.data

    if (!branch) return metadataFailed()
    if (
      branch.id !== target.branchId ||
      branch.project_id !== target.projectId ||
      branch.default !== false ||
      branch.protected !== false
    ) {
      return metadataFailed()
    }

    const testEndpointsResult = await neon.postgres.endpoints.listByBranch({
      projectId: target.projectId,
      branchId: target.branchId,
    })
    const testEndpoints = testEndpointsResult.error ? undefined : testEndpointsResult.data
    const testEndpoint = testEndpoints?.find((endpoint) => endpoint.id === target.endpointId)

    if (!testEndpoint) return metadataFailed()
    if (
      testEndpoint.id !== target.endpointId ||
      testEndpoint.project_id !== target.projectId ||
      testEndpoint.branch_id !== target.branchId ||
      detectNeonEndpointId(testEndpoint.host) !== target.endpointId ||
      normalizeNeonEndpointHostname(testEndpoint.host) !==
        normalizeNeonEndpointHostname(testUrlTarget.hostname) ||
      testEndpoint.type !== 'read_write' ||
      testEndpoint.disabled !== false
    ) {
      return metadataFailed()
    }

    const appEndpointResult = await neon.postgres.endpoints.get({
      projectId: target.appProjectId,
      endpointId: target.appEndpointId,
    })
    const appEndpoint = appEndpointResult.error ? undefined : appEndpointResult.data

    if (!appEndpoint) return metadataFailed()
    if (
      appEndpoint.id !== target.appEndpointId ||
      appEndpoint.project_id !== target.appProjectId ||
      appEndpoint.branch_id === target.branchId ||
      detectNeonEndpointId(appEndpoint.host) !== target.appEndpointId ||
      normalizeNeonEndpointHostname(appEndpoint.host) !==
        normalizeNeonEndpointHostname(appUrlTarget.hostname) ||
      appEndpoint.id === testEndpoint.id
    ) {
      return metadataFailed()
    }

    return { ...target, [VERIFIED_TARGET]: true }
  } catch (error) {
    if (error instanceof NeonIntegrationEnvironmentError) throw error
    return metadataFailed()
  }
}

const targetMatches = (left: NeonTestTarget, right: NeonTestTarget): boolean =>
  left.endpointId === right.endpointId &&
  left.branchId === right.branchId &&
  left.projectId === right.projectId &&
  left.database === right.database &&
  left.appEndpointId === right.appEndpointId &&
  left.appProjectId === right.appProjectId &&
  left.applicationConnectionString === right.applicationConnectionString &&
  left.connectionString === right.connectionString

/** Revalidates operator opt-ins and the parsed URLs immediately before enabling schema push. */
export function assertDestructiveOptIn(env: Environment, target: NeonTestTarget): void {
  if (env[DISPOSABLE_BRANCH_OPT_IN_ENV] !== 'true') {
    fail(`${DISPOSABLE_BRANCH_OPT_IN_ENV} is not "true". Refusing schema-changing setup.`)
  }
  if (env[DESTRUCTIVE_OPT_IN_ENV] !== 'true') {
    fail(`${DESTRUCTIVE_OPT_IN_ENV} is not "true". Refusing schema-changing setup.`)
  }

  const revalidated = resolveNeonTestTarget(env)
  if (!targetMatches(revalidated, target)) {
    fail(
      'The approved Neon test target or application endpoint changed during setup. Refusing schema push.',
    )
  }
}

/** Clears an externally supplied schema-push flag before any test module can import payload.config. */
export function suppressExternalSchemaPush(env: Environment): boolean {
  const wasEnabledBeforeValidation = env.PAYLOAD_DB_PUSH === 'true'
  delete env.PAYLOAD_DB_PUSH
  return wasEnabledBeforeValidation
}

/**
 * Points the test process at the verified target and sets PAYLOAD_DB_PUSH only after all local and
 * Neon metadata checks have passed. Read replicas are disabled so they cannot reach another branch.
 */
export function activateVerifiedNeonSchemaPush(
  env: Environment,
  target: VerifiedNeonTestTarget,
): void {
  if (target[VERIFIED_TARGET] !== true) {
    fail('The Neon target was not independently verified. Refusing to enable schema push.')
  }
  if (env.NODE_ENV !== 'test') {
    fail('NODE_ENV must be "test" before the Neon harness can enable schema push.')
  }
  if (env.PAYLOAD_DB_PUSH === 'true') {
    fail('PAYLOAD_DB_PUSH was enabled before the target checks. Do not set it in the shell.')
  }

  assertDestructiveOptIn(env, target)
  env.POSTGRES_URL = target.connectionString
  delete env.POSTGRES_READ_REPLICA_URL
  delete env.POSTGRES_READ_REPLICA_URLS
  assertProcessPointsAtTestDatabase(target, env)

  // This is intentionally the final step. payload.config.ts reads this flag when it is imported.
  env.PAYLOAD_DB_PUSH = 'true'
}

/**
 * Must pass immediately before Payload config is imported/initialized. The installed adapter takes
 * its primary connection from POSTGRES_URL; this verifies that value is the independently checked
 * test URL, never the normal application URL.
 */
export function assertProcessPointsAtTestDatabase(
  target: NeonTestTarget,
  env: Environment = process.env,
): void {
  if (
    env.POSTGRES_URL !== target.connectionString ||
    env.POSTGRES_TEST_URL?.trim() !== target.connectionString
  ) {
    fail(
      'The Payload config would not use the independently verified disposable Neon target. Refusing to boot Payload.',
    )
  }
}
