// @vitest-environment node
/**
 * Guard-rail tests for the Neon integration harness.
 *
 * These tests use synthetic URLs and a mocked, read-only Neon metadata client. They never contact
 * Neon or a PostgreSQL database. They pin the independent branch/endpoint approval checks and the
 * ordering that keeps PAYLOAD_DB_PUSH disabled until approval is complete.
 */
import { describe, expect, it } from 'vitest'

import { detectNeonEndpointId, isNeonHost } from '../integration/neonTarget'
import {
  activateVerifiedNeonSchemaPush,
  assertDestructiveOptIn,
  assertProcessPointsAtTestDatabase,
  DESTRUCTIVE_OPT_IN_ENV,
  DISPOSABLE_BRANCH_OPT_IN_ENV,
  NeonIntegrationEnvironmentError,
  type NeonMetadataClient,
  resolveNeonTestTarget,
  suppressExternalSchemaPush,
  verifyNeonTestTargetMetadata,
  type VerifiedNeonTestTarget,
} from '../integration/neonTestHarness'

const TEST_ENDPOINT_ID = 'ep-test-branch-123456'
const APP_ENDPOINT_ID = 'ep-app-branch-654321'
const TEST_BRANCH_ID = 'br-test-branch-123'
const APP_BRANCH_ID = 'br-app-branch-321'
const REPORTED_ENDPOINT_ID = 'ep-red-scene-b1ju5v4y'
const REPORTED_POOLER_URL = `postgresql://u:p@${REPORTED_ENDPOINT_ID}-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require`
const TEST_URL = `postgresql://u:p@${TEST_ENDPOINT_ID}-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
const APP_URL = `postgresql://u:p@${APP_ENDPOINT_ID}-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`

const baseEnv = (): Record<string, string | undefined> => ({
  NODE_ENV: 'test',
  POSTGRES_TEST_URL: TEST_URL,
  POSTGRES_URL: APP_URL,
  NEON_API_KEY: 'synthetic-neon-api-key',
  NEON_TEST_PROJECT_ID: 'test-project-id',
  NEON_APP_PROJECT_ID: 'app-project-id',
  NEON_TEST_BRANCH_ID: TEST_BRANCH_ID,
  NEON_TEST_ENDPOINT_ID: TEST_ENDPOINT_ID,
  NEON_TEST_DATABASE: 'neondb',
  [DISPOSABLE_BRANCH_OPT_IN_ENV]: 'true',
  [DESTRUCTIVE_OPT_IN_ENV]: 'true',
})

const reportedPoolerEnv = (
  endpointId = REPORTED_ENDPOINT_ID,
): Record<string, string | undefined> => ({
  ...baseEnv(),
  POSTGRES_TEST_URL: REPORTED_POOLER_URL,
  NEON_TEST_ENDPOINT_ID: endpointId,
})

type MetadataOverrides = {
  branch?: Partial<{
    id: string
    project_id: string
    default: boolean
    protected: boolean
  }>
  branchError?: boolean
  testEndpoints?: Array<{
    id: string
    project_id: string
    branch_id: string
    host: string
    type: 'read_only' | 'read_write'
    disabled: boolean
  }>
  testEndpointsError?: boolean
  appEndpoint?: {
    id: string
    project_id: string
    branch_id: string
    host: string
    type: 'read_only' | 'read_write'
    disabled: boolean
  }
  appEndpointError?: boolean
}

const createMetadataClient = (overrides: MetadataOverrides = {}): NeonMetadataClient => {
  const branch = {
    id: TEST_BRANCH_ID,
    project_id: 'test-project-id',
    default: false,
    protected: false,
    ...overrides.branch,
  }
  const testEndpoints = overrides.testEndpoints ?? [
    {
      id: TEST_ENDPOINT_ID,
      project_id: 'test-project-id',
      branch_id: TEST_BRANCH_ID,
      host: `${TEST_ENDPOINT_ID}.eu-central-1.aws.neon.tech`,
      type: 'read_write' as const,
      disabled: false,
    },
  ]
  const appEndpoint = overrides.appEndpoint ?? {
    id: APP_ENDPOINT_ID,
    project_id: 'app-project-id',
    branch_id: APP_BRANCH_ID,
    host: `${APP_ENDPOINT_ID}.eu-central-1.aws.neon.tech`,
    type: 'read_write' as const,
    disabled: false,
  }

  return {
    branches: {
      get: async () =>
        overrides.branchError
          ? { data: undefined, error: new Error('synthetic API error') }
          : { data: branch },
    },
    postgres: {
      endpoints: {
        get: async () =>
          overrides.appEndpointError
            ? { data: undefined, error: new Error('synthetic API error') }
            : { data: appEndpoint },
        listByBranch: async () =>
          overrides.testEndpointsError
            ? { data: undefined, error: new Error('synthetic API error') }
            : { data: testEndpoints },
      },
    },
  }
}

const verify = async (
  env: Record<string, string | undefined>,
  overrides: MetadataOverrides = {},
): Promise<VerifiedNeonTestTarget> => {
  const target = resolveNeonTestTarget(env)
  return verifyNeonTestTargetMetadata(target, env, () => createMetadataClient(overrides))
}

describe('Neon target parsing', () => {
  it('extracts endpoint IDs from pooled and direct Neon hosts', () => {
    expect(detectNeonEndpointId(`${TEST_ENDPOINT_ID}-pooler.eu-central-1.aws.neon.tech`)).toBe(
      TEST_ENDPOINT_ID,
    )
    expect(detectNeonEndpointId(`${TEST_ENDPOINT_ID}.eu-central-1.aws.neon.tech`)).toBe(
      TEST_ENDPOINT_ID,
    )
    expect(detectNeonEndpointId('db.example.com')).toBeNull()
    expect(detectNeonEndpointId('')).toBeNull()
  })

  it('recognises Neon hosts only', () => {
    expect(isNeonHost(`${TEST_ENDPOINT_ID}.eu-central-1.aws.neon.tech`)).toBe(true)
    expect(isNeonHost('127.0.0.1')).toBe(false)
    expect(isNeonHost('localhost')).toBe(false)
    expect(isNeonHost('postgres')).toBe(false)
    expect(isNeonHost('db.example.com')).toBe(false)
  })
})

describe('Neon integration harness local guards', () => {
  it('accepts a Neon URL only when explicit target and disposable opt-ins are present', () => {
    const target = resolveNeonTestTarget(baseEnv())

    expect(target.endpointId).toBe(TEST_ENDPOINT_ID)
    expect(target.branchId).toBe(TEST_BRANCH_ID)
    expect(target.projectId).toBe('test-project-id')
    expect(target.database).toBe('neondb')
    expect(target.appEndpointId).toBe(APP_ENDPOINT_ID)
  })

  it('does not treat a test-looking database name or hostname pattern as approval', () => {
    const env = baseEnv()
    env.NEON_TEST_BRANCH_DISPOSABLE = undefined

    expect(() => resolveNeonTestTarget(env)).toThrow(/NEON_TEST_BRANCH_DISPOSABLE/)

    env.NEON_TEST_BRANCH_DISPOSABLE = 'true'
    env.POSTGRES_TEST_URL = `postgresql://u:p@${TEST_ENDPOINT_ID}-pooler.eu-central-1.aws.neon.tech/test?sslmode=require`

    // The database name is bound to explicit configuration, but it is not used as evidence of
    // disposability; only the explicit opt-in and independent Neon metadata can approve the branch.
    expect(() => resolveNeonTestTarget(env)).toThrow(/NEON_TEST_DATABASE/)
    env.NEON_TEST_DATABASE = 'test'
    expect(resolveNeonTestTarget(env).database).toBe('test')
  })

  it('refuses when POSTGRES_TEST_URL is unset and never falls back to POSTGRES_URL', () => {
    expect(() => resolveNeonTestTarget({ ...baseEnv(), POSTGRES_TEST_URL: undefined })).toThrow(
      /POSTGRES_TEST_URL is required/,
    )
  })

  it('requires the normal application POSTGRES_URL for branch comparison', () => {
    expect(() => resolveNeonTestTarget({ ...baseEnv(), POSTGRES_URL: undefined })).toThrow(
      /POSTGRES_URL is required/,
    )
  })

  it('refuses the same Neon endpoint even when the database name differs', () => {
    const env = baseEnv()
    env.POSTGRES_TEST_URL = `postgresql://u:p@${APP_ENDPOINT_ID}-pooler.eu-central-1.aws.neon.tech/test?sslmode=require`
    env.NEON_TEST_ENDPOINT_ID = APP_ENDPOINT_ID
    env.NEON_TEST_DATABASE = 'test'

    expect(() => resolveNeonTestTarget(env)).toThrow(/same Neon endpoint/)
  })

  it('refuses non-Neon test hosts, including loopback and Docker aliases', () => {
    for (const host of ['127.0.0.1', 'localhost', 'postgres', 'db.example.com']) {
      const env = baseEnv()
      env.POSTGRES_TEST_URL = `postgresql://u:p@${host}:5432/neondb`
      expect(() => resolveNeonTestTarget(env)).toThrow(/must point to a Neon host/)
    }
  })

  it('refuses a non-Neon application URL rather than skipping endpoint comparison', () => {
    const env = baseEnv()
    env.POSTGRES_URL = 'postgresql://u:p@localhost:5432/neondb'

    expect(() => resolveNeonTestTarget(env)).toThrow(/POSTGRES_URL must point to a Neon host/)
  })

  it('requires independent project, branch, endpoint, database, and API-key configuration', () => {
    for (const name of [
      'NEON_TEST_PROJECT_ID',
      'NEON_APP_PROJECT_ID',
      'NEON_TEST_BRANCH_ID',
      'NEON_TEST_ENDPOINT_ID',
      'NEON_TEST_DATABASE',
      'NEON_API_KEY',
    ]) {
      const env = baseEnv()
      env[name] = undefined
      expect(() => resolveNeonTestTarget(env)).toThrow(new RegExp(`${name} is required`))
    }
  })

  it('requires the explicit approved endpoint and database to match the URL', () => {
    const wrongEndpoint = baseEnv()
    wrongEndpoint.NEON_TEST_ENDPOINT_ID = APP_ENDPOINT_ID
    expect(() => resolveNeonTestTarget(wrongEndpoint)).toThrow(/canonical endpoint ID/)

    const wrongDatabase = baseEnv()
    wrongDatabase.NEON_TEST_DATABASE = 'another-db'
    expect(() => resolveNeonTestTarget(wrongDatabase)).toThrow(/does not match the database/)
  })

  it('requires the explicit disposable and schema-change opt-ins', () => {
    const notDisposable = baseEnv()
    notDisposable[DISPOSABLE_BRANCH_OPT_IN_ENV] = 'yes'
    expect(() => resolveNeonTestTarget(notDisposable)).toThrow(/NEON_TEST_BRANCH_DISPOSABLE/)

    const notDestructive = baseEnv()
    notDestructive[DESTRUCTIVE_OPT_IN_ENV] = 'yes'
    expect(() => resolveNeonTestTarget(notDestructive)).toThrow(/PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE/)
  })

  it('refuses PAYLOAD_DROP_DATABASE=true before metadata lookup or connection setup', () => {
    const env = { ...baseEnv(), PAYLOAD_DROP_DATABASE: 'true' }
    expect(() => resolveNeonTestTarget(env)).toThrow(/PAYLOAD_DROP_DATABASE=true is prohibited/)
  })
})

describe('Pooled Neon endpoint identity regression', () => {
  it('binds the reported pooled hostname to the canonical endpoint ID in mocked API metadata', async () => {
    const env = reportedPoolerEnv()
    const hostname = new URL(env.POSTGRES_TEST_URL!).hostname

    expect(hostname).toBe('ep-red-scene-b1ju5v4y-pooler.c-5.eu-central-1.aws.neon.tech')
    expect(hostname.split('.')[0]).toBe(`${REPORTED_ENDPOINT_ID}-pooler`)
    expect(detectNeonEndpointId(hostname)).toBe(REPORTED_ENDPOINT_ID)
    expect(env.NEON_TEST_ENDPOINT_ID).toBe(REPORTED_ENDPOINT_ID)

    const target = resolveNeonTestTarget(env)
    const verified = await verifyNeonTestTargetMetadata(target, env, () =>
      createMetadataClient({
        testEndpoints: [
          {
            id: REPORTED_ENDPOINT_ID,
            project_id: 'test-project-id',
            branch_id: TEST_BRANCH_ID,
            host: `${REPORTED_ENDPOINT_ID}.c-5.eu-central-1.aws.neon.tech`,
            type: 'read_write',
            disabled: false,
          },
        ],
      }),
    )

    expect(target.endpointId).toBe(REPORTED_ENDPOINT_ID)
    expect(verified.endpointId).toBe(REPORTED_ENDPOINT_ID)
  })

  it('rejects the pooled DNS label when supplied as the canonical endpoint ID', () => {
    const env = reportedPoolerEnv(`${REPORTED_ENDPOINT_ID}-pooler`)

    expect(() => resolveNeonTestTarget(env)).toThrow(
      /canonical endpoint ID.*pooled hostname suffix "-pooler" is not part of the endpoint ID/,
    )
  })

  it('continues rejecting a genuinely different canonical endpoint ID', () => {
    const env = reportedPoolerEnv('ep-different-endpoint-987654')

    expect(() => resolveNeonTestTarget(env)).toThrow(/canonical endpoint ID/)
  })
})

describe('Independent Neon metadata verification', () => {
  it('binds the connection URL to the approved non-default branch and its read-write endpoint', async () => {
    const target = await verify(baseEnv())

    expect(target.branchId).toBe(TEST_BRANCH_ID)
    expect(target.endpointId).toBe(TEST_ENDPOINT_ID)
  })

  it('refuses branch metadata that does not match the independently supplied branch ID', async () => {
    await expect(verify(baseEnv(), { branch: { id: 'br-different-branch' } })).rejects.toThrow(
      /Neon metadata could not independently confirm/,
    )
  })

  it('refuses the default or protected branch', async () => {
    await expect(verify(baseEnv(), { branch: { default: true } })).rejects.toThrow(
      /Neon metadata could not independently confirm/,
    )
    await expect(verify(baseEnv(), { branch: { protected: true } })).rejects.toThrow(
      /Neon metadata could not independently confirm/,
    )
  })

  it('refuses if the test endpoint is missing, belongs elsewhere, disabled, read-only, or has a different hostname', async () => {
    await expect(verify(baseEnv(), { testEndpoints: [] })).rejects.toThrow(
      /Neon metadata could not independently confirm/,
    )

    await expect(
      verify(baseEnv(), {
        testEndpoints: [
          {
            id: TEST_ENDPOINT_ID,
            project_id: 'test-project-id',
            branch_id: TEST_BRANCH_ID,
            host: `${TEST_ENDPOINT_ID}.wrong-region.neon.tech`,
            type: 'read_write',
            disabled: false,
          },
        ],
      }),
    ).rejects.toThrow(/Neon metadata could not independently confirm/)

    await expect(
      verify(baseEnv(), {
        testEndpoints: [
          {
            id: TEST_ENDPOINT_ID,
            project_id: 'another-project',
            branch_id: TEST_BRANCH_ID,
            host: `${TEST_ENDPOINT_ID}.eu-central-1.aws.neon.tech`,
            type: 'read_write',
            disabled: false,
          },
        ],
      }),
    ).rejects.toThrow(/Neon metadata could not independently confirm/)

    await expect(
      verify(baseEnv(), {
        testEndpoints: [
          {
            id: TEST_ENDPOINT_ID,
            project_id: 'test-project-id',
            branch_id: TEST_BRANCH_ID,
            host: `${TEST_ENDPOINT_ID}.eu-central-1.aws.neon.tech`,
            type: 'read_only',
            disabled: false,
          },
        ],
      }),
    ).rejects.toThrow(/Neon metadata could not independently confirm/)

    await expect(
      verify(baseEnv(), {
        testEndpoints: [
          {
            id: TEST_ENDPOINT_ID,
            project_id: 'test-project-id',
            branch_id: TEST_BRANCH_ID,
            host: `${TEST_ENDPOINT_ID}.eu-central-1.aws.neon.tech`,
            type: 'read_write',
            disabled: true,
          },
        ],
      }),
    ).rejects.toThrow(/Neon metadata could not independently confirm/)
  })

  it('refuses an app endpoint on the test branch or a URL hostname that disagrees with metadata', async () => {
    await expect(
      verify(baseEnv(), {
        appEndpoint: {
          id: APP_ENDPOINT_ID,
          project_id: 'app-project-id',
          branch_id: TEST_BRANCH_ID,
          host: `${APP_ENDPOINT_ID}.eu-central-1.aws.neon.tech`,
          type: 'read_write',
          disabled: false,
        },
      }),
    ).rejects.toThrow(/Neon metadata could not independently confirm/)

    await expect(
      verify(baseEnv(), {
        appEndpoint: {
          id: APP_ENDPOINT_ID,
          project_id: 'app-project-id',
          branch_id: APP_BRANCH_ID,
          host: `${APP_ENDPOINT_ID}.wrong-region.neon.tech`,
          type: 'read_write',
          disabled: false,
        },
      }),
    ).rejects.toThrow(/Neon metadata could not independently confirm/)
  })

  it('hides Neon API error details rather than printing connection credentials or response bodies', async () => {
    const privateLookingValue =
      'postgresql://user:secret@example.neon.tech/neondb?sslmode=require&token=private'
    const client = createMetadataClient({ branchError: true })
    const target = resolveNeonTestTarget(baseEnv())

    let errorMessage = ''
    try {
      await verifyNeonTestTargetMetadata(target, baseEnv(), () => ({
        ...client,
        branches: {
          get: async () => ({ data: undefined, error: new Error(privateLookingValue) }),
        },
      }))
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error)
    }

    expect(errorMessage).toMatch(/Neon metadata could not independently confirm/)
    expect(errorMessage).not.toContain('secret')
    expect(errorMessage).not.toContain('postgresql://')
    expect(errorMessage).not.toContain('token=')
  })
})

describe('Schema-push ordering and process targeting', () => {
  it('clears a shell-provided PAYLOAD_DB_PUSH=true before validation and records that it must fail closed', () => {
    const env = { PAYLOAD_DB_PUSH: 'true' }

    expect(suppressExternalSchemaPush(env)).toBe(true)
    expect(env.PAYLOAD_DB_PUSH).toBeUndefined()
  })

  it('does not enable schema push for an unverified target', () => {
    const env = baseEnv()
    const parsed = resolveNeonTestTarget(env)

    expect(() =>
      activateVerifiedNeonSchemaPush(env, parsed as unknown as VerifiedNeonTestTarget),
    ).toThrow(/not independently verified/)
    expect(env.PAYLOAD_DB_PUSH).toBeUndefined()
    expect(env.POSTGRES_URL).toBe(APP_URL)
  })

  it('sets PAYLOAD_DB_PUSH only after independent verification and disables read replicas', async () => {
    const env = baseEnv()
    env.POSTGRES_READ_REPLICA_URL = APP_URL
    env.POSTGRES_READ_REPLICA_URLS = APP_URL
    const target = await verify(env)

    expect(env.PAYLOAD_DB_PUSH).toBeUndefined()
    activateVerifiedNeonSchemaPush(env, target)

    expect(env.POSTGRES_URL).toBe(TEST_URL)
    expect(env.POSTGRES_READ_REPLICA_URL).toBeUndefined()
    expect(env.POSTGRES_READ_REPLICA_URLS).toBeUndefined()
    expect(env.PAYLOAD_DB_PUSH).toBe('true')
    expect(() => assertProcessPointsAtTestDatabase(target, env)).not.toThrow()
  })

  it('refuses to activate if PAYLOAD_DB_PUSH was set before verification', async () => {
    const env = baseEnv()
    const target = await verify(env)
    env.PAYLOAD_DB_PUSH = 'true'

    expect(() => activateVerifiedNeonSchemaPush(env, target)).toThrow(
      /PAYLOAD_DB_PUSH was enabled before the target checks/,
    )
  })

  it('refuses schema-push activation outside NODE_ENV=test', async () => {
    const env = baseEnv()
    const target = await verify(env)
    env.NODE_ENV = 'development'

    expect(() => activateVerifiedNeonSchemaPush(env, target)).toThrow(/NODE_ENV must be "test"/)
    expect(env.PAYLOAD_DB_PUSH).toBeUndefined()
  })

  it('revalidates destructive opt-in and refuses changed approved endpoints', () => {
    const env = baseEnv()
    const target = resolveNeonTestTarget(env)

    expect(() => assertDestructiveOptIn(env, target)).not.toThrow()
    expect(() =>
      assertDestructiveOptIn({ ...env, [DESTRUCTIVE_OPT_IN_ENV]: 'false' }, target),
    ).toThrow(/PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE/)

    const switched = {
      ...env,
      POSTGRES_TEST_URL:
        'postgresql://u:p@ep-switched-987654-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require',
      NEON_TEST_ENDPOINT_ID: 'ep-switched-987654',
    }
    expect(() => assertDestructiveOptIn(switched, target)).toThrow(
      /target or application endpoint changed/,
    )
  })

  it('refuses to boot Payload unless POSTGRES_URL and POSTGRES_TEST_URL both match the approved target', async () => {
    const target = await verify(baseEnv())

    expect(() => assertProcessPointsAtTestDatabase(target, { POSTGRES_URL: APP_URL })).toThrow(
      /would not use the independently verified disposable Neon target/,
    )
    expect(() =>
      assertProcessPointsAtTestDatabase(target, {
        POSTGRES_URL: TEST_URL,
        POSTGRES_TEST_URL: APP_URL,
      }),
    ).toThrow(/would not use the independently verified disposable Neon target/)
    expect(() =>
      assertProcessPointsAtTestDatabase(target, {
        POSTGRES_URL: TEST_URL,
        POSTGRES_TEST_URL: TEST_URL,
      }),
    ).not.toThrow()
  })
})

it('uses NeonIntegrationEnvironmentError for local refusals', () => {
  expect(() => resolveNeonTestTarget({})).toThrow(NeonIntegrationEnvironmentError)
})
