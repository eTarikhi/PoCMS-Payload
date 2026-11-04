// @vitest-environment node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { jwtSign, type Payload, type PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import {
  computePermissions,
  invalidateRolesCache,
  invalidateRolesOnChange,
} from '@/access/roles'
import {
  authenticateResilientJwt,
  clearRecentLoginSession,
  extractCandidateJwts,
  recordRecentLoginSession,
  verifyPayloadHs256Jwt,
} from '@/auth/resilientJwtStrategy'
import {
  installEarlyStreamCloseFilter,
  isEarlyDestinationStreamCloseError,
} from '@/lib/fixCompressionDrainListeners'
import { inspectSequences } from '@/plugins/databaseManager/core/monitor'

type SequenceExecutor = Parameters<typeof inspectSequences>[0]

function walkAdminTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      out.push(...walkAdminTsFiles(full))
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      out.push(full)
    }
  }
  return out
}

describe('Production (`pnpm build && pnpm start`) Admin login & stream stability', () => {
  it('externalizes `ws` in `next.config.ts` and registers runtime patches in `src/instrumentation.ts`', () => {
    const nextConfigSrc = fs.readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8')
    expect(nextConfigSrc).toContain('serverExternalPackages')
    expect(nextConfigSrc).toContain("'ws'")
    expect(nextConfigSrc).toContain('installEarlyStreamCloseFilter()')

    const instrumentationSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'instrumentation.ts'),
      'utf8',
    )
    expect(instrumentationSrc).toContain('export async function register()')
    expect(instrumentationSrc).toContain('installNodeDnsFallback()')
    expect(instrumentationSrc).toContain('installCompressionDrainFix()')
    expect(instrumentationSrc).toContain('installEarlyStreamCloseFilter()')
  })

  it('suppresses false-positive `The destination stream closed early.` errors while preserving genuine errors', () => {
    const earlyErr = Object.assign(new Error('The destination stream closed early.'), {
      digest: '3636560056',
    })
    expect(isEarlyDestinationStreamCloseError(earlyErr)).toBe(true)
    expect(
      isEarlyDestinationStreamCloseError('⨯ Error: The destination stream closed early.'),
    ).toBe(true)
    expect(isEarlyDestinationStreamCloseError(new Error('Database connection failed'))).toBe(false)

    const recorded: string[] = []
    const customConsole = {
      error: (...args: unknown[]) => {
        recorded.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '))
      },
    }
    expect(installEarlyStreamCloseFilter(customConsole)).toBe(true)
    expect(installEarlyStreamCloseFilter(customConsole)).toBe(false)

    customConsole.error(earlyErr)
    customConsole.error('⨯ Error: The destination stream closed early.', { digest: '3636560056' })
    expect(recorded).toHaveLength(0)

    customConsole.error(new Error('Genuine unexpected server failure'))
    expect(recorded).toEqual(['Genuine unexpected server failure'])

    // Also installs idempotently on global `console`
    installEarlyStreamCloseFilter()
    expect(installEarlyStreamCloseFilter()).toBe(false)
  })

  it('batches `inspectSequences` MAX(column) lookups into a single `UNION ALL` query with per-table fallback', async () => {
    const candidateRows = Array.from({ length: 50 }, (_, i) => ({
      table_name: `table_${i}`,
      column_name: 'id',
      seq_name: `table_${i}_id_seq`,
      last_value: String(100 + i),
    }))

    const queries: string[] = []
    const executor: SequenceExecutor = {
      query: async <T>(sqlText: string) => {
        queries.push(sqlText)
        if (queries.length === 1) {
          return { rows: candidateRows as unknown as T[] }
        }
        expect(sqlText).toContain('UNION ALL')
        return {
          rows: candidateRows.map((_, idx) => ({
            idx,
            max_id: String(50 + idx),
          })) as unknown as T[],
        }
      },
    }

    const rows = await inspectSequences(executor)
    expect(queries).toHaveLength(2)
    expect(rows).toHaveLength(50)
    expect(rows[0]).toMatchObject({
      tableName: 'table_0',
      sequenceName: 'table_0_id_seq',
      lastValue: 100,
      maxId: 50,
      inSync: true,
    })
    expect(rows[49]).toMatchObject({
      tableName: 'table_49',
      lastValue: 149,
      maxId: 99,
      inSync: true,
    })

    // Verify per-table fallback if a table changes concurrently during the batched query
    let fallbackQueries = 0
    const fallbackExecutor: SequenceExecutor = {
      query: async <T>(sqlText: string) => {
        fallbackQueries += 1
        if (fallbackQueries === 1) {
          return { rows: candidateRows.slice(0, 2) as unknown as T[] }
        }
        if (sqlText.includes('UNION ALL')) {
          throw new Error('relation dropped mid-snapshot')
        }
        return { rows: [{ max_id: '150' }] as unknown as T[] }
      },
    }

    const fallbackRows = await inspectSequences(fallbackExecutor)
    expect(fallbackQueries).toBe(4) // 1 candidates + 1 failed batch + 2 fallback queries
    expect(fallbackRows).toHaveLength(2)
    expect(fallbackRows[0]?.inSync).toBe(false)
  })

  it('sets `prefetch={false}` on every custom Admin `next/link` `<Link>` to prevent production RSC prefetch storms', () => {
    const adminDir = path.join(process.cwd(), 'src', 'components', 'admin')
    const filesWithNextLink = walkAdminTsFiles(adminDir).filter((file) =>
      fs.readFileSync(file, 'utf8').includes('next/link'),
    )
    expect(filesWithNextLink.length).toBeGreaterThanOrEqual(15)

    for (const file of filesWithNextLink) {
      const src = fs.readFileSync(file, 'utf8')
      const linkTags = src.match(/<Link\b[\s\S]*?>/g) ?? []
      expect(linkTags.length).toBeGreaterThan(0)
      for (const tag of linkTags) {
        expect(
          tag.includes('prefetch={false}'),
          `Expected prefetch={false} on <Link> in ${path.relative(process.cwd(), file)}: ${tag}`,
        ).toBe(true)
      }
    }
  })

  it('authenticates across duplicate `payload-token` cookies, recent-login replica lag, and transient DB errors', async () => {
    const secret = crypto.createHash('sha256').update('test-payload-secret').digest('hex').slice(0, 32)
    const activeSid = 'sid-fresh-valid'
    const staleSid = 'sid-old-revoked'

    const { token: freshToken } = await jwtSign({
      fieldsToSign: {
        id: 1,
        collection: 'users',
        email: 'admin@example.com',
        sid: activeSid,
      },
      secret,
      tokenExpiration: 7200,
    })

    const { token: staleToken } = await jwtSign({
      fieldsToSign: {
        id: 1,
        collection: 'users',
        email: 'admin@example.com',
        sid: staleSid,
      },
      secret,
      tokenExpiration: 7200,
    })

    expect(verifyPayloadHs256Jwt(freshToken, secret)).toMatchObject({
      id: 1,
      collection: 'users',
      sid: activeSid,
    })
    expect(verifyPayloadHs256Jwt(freshToken, 'wrong-secret')).toBeNull()

    let findAttempts = 0
    let failFirstAttempt = false
    let simulatedSessions: Array<{ id: string; expiresAt: string }> = [
      { id: activeSid, expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    ]

    const mockPayload = {
      secret,
      config: {
        cookiePrefix: 'payload',
        csrf: [],
        auth: { jwtOrder: ['Bearer', 'JWT', 'cookie'] },
      },
      collections: {
        users: {
          config: {
            slug: 'users',
            auth: {
              depth: 0,
              disableLocalStrategy: false,
              useSessions: true,
              verify: false,
            },
          },
        },
      },
      findByID: vi.fn(async () => {
        findAttempts += 1
        if (failFirstAttempt && findAttempts === 1) {
          throw new Error('Connection terminated unexpectedly')
        }
        return {
          id: 1,
          email: 'admin@example.com',
          sessions: simulatedSessions,
        }
      }),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    // 1. Browser sends valid cookie FIRST and a stale/corrupt duplicate cookie LAST
    const dupHeaders = new Headers({
      Cookie: `payload-token=${freshToken}; other=1; payload-token=${staleToken}; payload-token=corrupt.jwt.value`,
    })
    expect(extractCandidateJwts(dupHeaders, mockPayload)).toHaveLength(3)

    const dupResult = await authenticateResilientJwt({
      headers: dupHeaders,
      payload: mockPayload,
      req: { query: {} } as unknown as PayloadRequest,
    })
    expect(dupResult.user).toMatchObject({
      id: 1,
      collection: 'users',
      _strategy: 'local-jwt',
      _sid: activeSid,
    })

    // 2. Transient pool error on first `findByID` attempt retries and succeeds
    findAttempts = 0
    failFirstAttempt = true
    const retryResult = await authenticateResilientJwt({
      headers: new Headers({ Cookie: `payload-token=${freshToken}` }),
      payload: mockPayload,
      req: { query: {} } as unknown as PayloadRequest,
    })
    expect(findAttempts).toBe(2)
    expect(retryResult.user).toMatchObject({
      id: 1,
      _strategy: 'local-jwt',
      _sid: activeSid,
    })
    failFirstAttempt = false

    // 3. Replica lag grace right after login (`sessions` empty on read replica), revoked on logout
    simulatedSessions = []
    const beforeGrace = await authenticateResilientJwt({
      headers: new Headers({ Cookie: `payload-token=${freshToken}` }),
      payload: mockPayload,
      req: { query: {} } as unknown as PayloadRequest,
    })
    expect(beforeGrace.user).toBeNull()

    recordRecentLoginSession(mockPayload, 'users', 1, activeSid)
    const duringGrace = await authenticateResilientJwt({
      headers: new Headers({ Cookie: `payload-token=${freshToken}` }),
      payload: mockPayload,
      req: { query: {} } as unknown as PayloadRequest,
    })
    expect(duringGrace.user).toMatchObject({
      id: 1,
      _strategy: 'local-jwt',
      _sid: activeSid,
    })

    clearRecentLoginSession(mockPayload, 'users', 1, activeSid)
    const afterLogout = await authenticateResilientJwt({
      headers: new Headers({ Cookie: `payload-token=${freshToken}` }),
      payload: mockPayload,
      req: { query: {} } as unknown as PayloadRequest,
    })
    expect(afterLogout.user).toBeNull()
  })

  it('caches role lookups across requests, invalidates on role updates, and falls back on transient errors', async () => {
    let findCalls = 0
    let throwOnFind = false
    let manageDatabase = true

    const mockPayload = {
      config: {
        collections: [{ slug: 'articles' }],
        globals: [{ slug: 'header' }],
      },
      find: vi.fn(async () => {
        findCalls += 1
        if (throwOnFind) {
          throw new Error('Transient Neon pool timeout')
        }
        return {
          docs: [
            {
              id: 7,
              name: 'Ops',
              slug: 'ops',
              capabilities: { manageDatabase },
              collections: {},
              globals: {},
            },
          ],
        }
      }),
    } as unknown as Payload

    invalidateRolesCache(mockPayload)

    const makeReq = () =>
      ({
        payload: mockPayload,
        context: {},
      }) as unknown as PayloadRequest

    const first = (await computePermissions({
      req: makeReq(),
      siblingData: { roles: [7] },
    } as never)) as { capabilities: string[] }
    expect(first.capabilities.includes('manageDatabase')).toBe(true)
    expect(findCalls).toBe(1)

    // Second independent request reuses cached role without querying DB
    const second = (await computePermissions({
      req: makeReq(),
      siblingData: { roles: [7] },
    } as never)) as { capabilities: string[] }
    expect(second.capabilities.includes('manageDatabase')).toBe(true)
    expect(findCalls).toBe(1)

    // Role change invalidates cache immediately
    manageDatabase = false
    invalidateRolesOnChange({
      doc: { id: 7 },
      req: makeReq(),
    } as never)

    const updated = (await computePermissions({
      req: makeReq(),
      siblingData: { roles: [7] },
    } as never)) as { capabilities: string[] }
    expect(updated.capabilities.includes('manageDatabase')).toBe(false)
    expect(findCalls).toBe(2)

    // Even if `transactionID` forces a fresh DB read that throws transiently, stale fallback protects auth
    throwOnFind = true
    const txReq = {
      payload: mockPayload,
      context: {},
      transactionID: 'tx-1',
    } as unknown as PayloadRequest
    const recovered = (await computePermissions({
      req: txReq,
      siblingData: { roles: [7] },
    } as never)) as { capabilities: string[] }
    expect(recovered.capabilities.includes('manageDatabase')).toBe(false)
    expect(findCalls).toBe(3)
  })
})
