import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

vi.mock('@payloadcms/ui', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import config from '@/payload.config'
import { NO_PERMISSIONS, type EffectivePermissions } from '@/access/permissions'
import { NavExtraLinks } from '@/components/admin/nav/NavExtraLinks'
import { JobsClient } from '@/components/admin/views/Jobs/JobsClient'
import { SystemClient } from '@/components/admin/views/System/SystemClient'
import { TerminalClient } from '@/components/admin/views/Terminal/TerminalClient'
import { ScheduledJobsSummaryView } from '@/components/admin/widgets/ScheduledJobs'
import { SystemInfoSummaryView } from '@/components/admin/widgets/SystemInfo'
import { adminJobsEndpoints } from '@/endpoints/adminJobs'
import {
  devTerminalEndpoint,
  isTerminalAvailableInEnv,
  validateTerminalCommand,
} from '@/endpoints/devTerminal'
import { systemInfoEndpoint } from '@/endpoints/systemInfo'
import {
  classifyJobStatus,
  hasCronBearerToken,
  mapJobDocsToSnapshot,
} from '@/jobs/config'
import {
  inspectIntegrations,
  parseDatabaseConnectionInfo,
  type SystemInfoReport,
} from '@/lib/systemInfo'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const userWithCapabilities = (
  capabilities: EffectivePermissions['capabilities'],
  fullAccess = false,
) => ({
  id: 1,
  email: 'admin@vtarikhi.com',
  permissions: {
    ...NO_PERMISSIONS,
    fullAccess,
    roles: fullAccess ? ['Administrator'] : ['Custom'],
    capabilities,
  },
})

describe('RBAC Capability 1: viewSystem (System Information)', () => {
  it('parses Neon / Postgres connection strings without leaking credentials and inspects integration env vars', () => {
    const neonInfo = parseDatabaseConnectionInfo(
      'postgresql://neondb_owner:super_secret_pw_123@ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech/pocms?sslmode=require',
      'postgresql://neondb_owner:super_secret_pw_123@ep-cool-morning-a2bc.eu-central-1.aws.neon.tech/pocms?sslmode=require',
    )

    expect(neonInfo).toEqual({
      configured: true,
      provider: 'neon',
      providerLabel: 'Neon Serverless Postgres',
      host: 'ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech',
      database: 'pocms',
      pooled: true,
      hasUnpooledUrl: true,
      sslMode: 'require',
    })
    expect(JSON.stringify(neonInfo)).not.toContain('super_secret_pw_123')
    expect(JSON.stringify(neonInfo)).not.toContain('neondb_owner')

    const integrations = inspectIntegrations({
      NODE_ENV: 'development',
      POSTGRES_URL: 'postgres://localhost:5432/pocms',
      RESEND_API_KEY: 're_test_key',
      VERCEL_TOKEN: 'tok_only_partial',
    })

    const byKey = new Map(integrations.map((item) => [item.key, item]))
    expect(byKey.get('database')?.status).toBe('configured')
    expect(byKey.get('email')?.status).toBe('configured')
    expect(byKey.get('vercel')?.status).toBe('partial')
    expect(byKey.get('storage')?.status).toBe('not-configured')
    expect(JSON.stringify(integrations)).not.toContain('re_test_key')
  })

  it('registers /admin/system, system-info widget, and /api/system-info guarded by viewSystem', async () => {
    const sanitized = await config
    expect(sanitized.admin.components?.views?.system).toBeDefined()
    expect(
      sanitized.admin.dashboard?.widgets.some((w) => w.slug === 'system-info'),
    ).toBe(true)

    const forbiddenRes = await systemInfoEndpoint.handler({
      user: userWithCapabilities([]),
      payload: { config: sanitized, db: {} },
    } as unknown as PayloadRequest)
    expect(forbiddenRes.status).toBe(403)

    const allowedRes = await systemInfoEndpoint.handler({
      user: userWithCapabilities(['viewSystem']),
      payload: { config: sanitized, db: {} },
    } as unknown as PayloadRequest)
    expect(allowedRes.status).toBe(200)
    const report = (await allowedRes.json()) as SystemInfoReport
    expect(report.versions.payload).toBe('3.90.2')
    expect(report.versions.next).toBe('16.3.8')
    expect(report.schema.jobTasks).toBe(7)

    render(React.createElement(SystemInfoSummaryView, { report }))
    expect(screen.getByText('System information')).toBeDefined()

    cleanup()
    render(React.createElement(SystemClient, { initialReport: report, apiRoute: '/api' }))
    expect(screen.getByText('Stack versions')).toBeDefined()
    expect(screen.getByText('Configured integrations')).toBeDefined()
  })
})

describe('RBAC Capability 2: manageJobs (Payload Jobs Queue & Scheduled Jobs UI)', () => {
  it('keeps client-side JobsClient and shared job helpers completely free of next/cache server imports', () => {
    const sharedSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/jobs/shared.ts'),
      'utf8',
    )
    const jobsClientSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/admin/views/Jobs/JobsClient.tsx'),
      'utf8',
    )

    expect(sharedSrc).not.toMatch(/from\s+['"]next\/cache['"]/)
    expect(jobsClientSrc).not.toMatch(/from\s+['"]@\/jobs\/config['"]/)
    expect(jobsClientSrc).not.toMatch(
      /from\s+['"]@\/components\/admin\/widgets\/ScheduledJobs['"]/,
    )
    expect(jobsClientSrc).not.toMatch(/from\s+['"]next\/cache['"]/)
  })

  it('configures Payload jobs tasks & access control (manageJobs capability + CRON_SECRET Bearer)', async () => {
    const sanitized = await config
    expect(sanitized.admin.components?.views?.jobs).toBeDefined()
    expect(
      sanitized.admin.dashboard?.widgets.some((w) => w.slug === 'scheduled-jobs'),
    ).toBe(true)

    const taskSlugs = (sanitized.jobs?.tasks ?? []).map((t) => t.slug)
    expect(taskSlugs).toEqual([
      'refreshSiteCache',
      'verifyContentHealth',
      'consolidateLegacyMediaUrls',
      'purgeCompletedJobs',
      'pruneDocumentVersions',
      'createDatabaseBackup',
      'schedulePublish',
    ])

    vi.stubEnv('CRON_SECRET', 'cron_secret_xyz')
    expect(
      hasCronBearerToken({
        headers: new Headers({ authorization: 'Bearer cron_secret_xyz' }),
      }),
    ).toBe(true)
    expect(
      hasCronBearerToken({
        headers: new Headers({ authorization: 'Bearer wrong' }),
      }),
    ).toBe(false)

    const runAccess = sanitized.jobs?.access?.run
    expect(runAccess).toBeDefined()
    expect(
      await runAccess!({
        req: {
          user: userWithCapabilities([]),
          headers: new Headers(),
        } as unknown as PayloadRequest,
      }),
    ).toBe(false)
    expect(
      await runAccess!({
        req: {
          user: userWithCapabilities(['manageJobs']),
          headers: new Headers(),
        } as unknown as PayloadRequest,
      }),
    ).toBe(true)
    expect(
      await runAccess!({
        req: {
          user: null,
          headers: new Headers({ authorization: 'Bearer cron_secret_xyz' }),
        } as unknown as PayloadRequest,
      }),
    ).toBe(true)
  })

  it('classifies job states accurately and handles queue, run-one, and cancel actions via /api/admin-jobs', async () => {
    const now = Date.parse('2026-10-26T12:00:00.000Z')
    expect(classifyJobStatus({ processing: true }, now)).toBe('running')
    expect(
      classifyJobStatus({ hasError: true, error: { cancelled: true } }, now),
    ).toBe('canceled')
    expect(
      classifyJobStatus({ hasError: true, error: { message: 'Boom' } }, now),
    ).toBe('failed')
    expect(
      classifyJobStatus({ completedAt: '2026-10-26T11:55:00.000Z' }, now),
    ).toBe('completed')
    expect(
      classifyJobStatus({ waitUntil: '2026-10-26T15:00:00.000Z' }, now),
    ).toBe('scheduled')
    expect(classifyJobStatus({}, now)).toBe('queued')

    const snapshot = mapJobDocsToSnapshot(
      [
        {
          id: 101,
          taskSlug: 'refreshSiteCache',
          queue: 'default',
          createdAt: '2026-10-26T11:50:00.000Z',
          updatedAt: '2026-10-26T11:50:00.000Z',
        },
        {
          id: 102,
          taskSlug: 'verifyContentHealth',
          queue: 'default',
          hasError: true,
          error: { cancelled: true },
          createdAt: '2026-10-26T11:40:00.000Z',
          updatedAt: '2026-10-26T11:45:00.000Z',
        },
      ],
      2,
      now,
    )

    expect(snapshot.counts.queued).toBe(1)
    expect(snapshot.counts.canceled).toBe(1)

    render(React.createElement(ScheduledJobsSummaryView, { snapshot }))
    expect(screen.getByText('Refresh portfolio cache')).toBeDefined()

    cleanup()
    render(React.createElement(JobsClient, { initialSnapshot: snapshot, apiRoute: '/api' }))
    expect(screen.getByRole('button', { name: 'Run due jobs now' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Canceled (1)' }))
    expect(screen.getByText('#102')).toBeDefined()

    // Endpoint RBAC + queue/cancel dispatch
    const postEndpoint = adminJobsEndpoints.find((e) => e.method === 'post')!
    const denied = await postEndpoint.handler({
      user: userWithCapabilities([]),
    } as unknown as PayloadRequest)
    expect(denied.status).toBe(403)

    const queueSpy = vi.fn().mockResolvedValue({ id: 205 })
    const cancelByIDSpy = vi.fn().mockResolvedValue(undefined)
    const mockPayload = {
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      logger: { info: vi.fn() },
      jobs: {
        queue: queueSpy,
        cancelByID: cancelByIDSpy,
      },
    }

    const queuedRes = await postEndpoint.handler({
      user: userWithCapabilities(['manageJobs']),
      payload: mockPayload,
      json: async () => ({ action: 'queue', task: 'refreshSiteCache' }),
    } as unknown as PayloadRequest)
    expect(queuedRes.status).toBe(200)
    expect(queueSpy).toHaveBeenCalledTimes(1)

    const cancelRes = await postEndpoint.handler({
      user: userWithCapabilities(['manageJobs']),
      payload: mockPayload,
      json: async () => ({ action: 'cancel', id: 205 }),
    } as unknown as PayloadRequest)
    expect(cancelRes.status).toBe(200)
    expect(cancelByIDSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 205 }))
  })
})

describe('RBAC Capability 3: useTerminal (Dev Terminal — Strictly Disabled in Production)', () => {
  it('blocks dangerous commands, enforces RBAC, executes safe dev commands, and hard-disables in production', async () => {
    expect(isTerminalAvailableInEnv('development')).toBe(true)
    expect(isTerminalAvailableInEnv('test')).toBe(true)
    expect(isTerminalAvailableInEnv('production')).toBe(false)

    expect(validateTerminalCommand('rm -rf /').ok).toBe(false)
    expect(validateTerminalCommand('rm -rf .git').ok).toBe(false)
    expect(validateTerminalCommand('shutdown -h now').ok).toBe(false)
    expect(validateTerminalCommand('git status -sb')).toEqual({
      ok: true,
      command: 'git status -sb',
    })

    // Production hard lockout: even fullAccess Administrator receives 404
    vi.stubEnv('NODE_ENV', 'production')
    const prodRes = await devTerminalEndpoint.handler({
      user: userWithCapabilities(['useTerminal'], true),
      searchParams: new URLSearchParams(),
    } as unknown as PayloadRequest)
    expect(prodRes.status).toBe(404)

    // NavExtraLinks hides #nav-terminal in production even for Administrators
    const sanitized = await config
    const { container: prodNav } = render(
      React.createElement(NavExtraLinks, {
        payload: { config: sanitized },
        user: userWithCapabilities(['viewSystem', 'manageJobs', 'useTerminal'], true),
      } as never),
    )
    expect(prodNav.querySelector('#nav-system')).not.toBeNull()
    expect(prodNav.querySelector('#nav-jobs')).not.toBeNull()
    expect(prodNav.querySelector('#nav-terminal')).toBeNull()
    cleanup()

    // Development mode: enforces useTerminal capability (403 without, 200 with)
    vi.stubEnv('NODE_ENV', 'development')
    const { container: devNav } = render(
      React.createElement(NavExtraLinks, {
        payload: { config: sanitized },
        user: userWithCapabilities(['useTerminal']),
      } as never),
    )
    expect(devNav.querySelector('#nav-terminal')).not.toBeNull()
    cleanup()

    const noPermRes = await devTerminalEndpoint.handler({
      user: userWithCapabilities([]),
      searchParams: new URLSearchParams(),
    } as unknown as PayloadRequest)
    expect(noPermRes.status).toBe(403)

    const execRes = await devTerminalEndpoint.handler({
      user: userWithCapabilities(['useTerminal']),
      searchParams: new URLSearchParams(),
      json: async () => ({ command: 'node -e "process.stdout.write(\'pocms-dev-shell-ok\')"' }),
      payload: { logger: { info: vi.fn() } },
    } as unknown as PayloadRequest)
    expect(execRes.status).toBe(200)
    const execBody = (await execRes.json()) as {
      ok: boolean
      exitCode: number
      stdout: string
    }
    expect(execBody.ok).toBe(true)
    expect(execBody.exitCode).toBe(0)
    expect(execBody.stdout).toBe('pocms-dev-shell-ok')

    render(React.createElement(TerminalClient, { apiRoute: '/api', cwd: '/home/user/PoCMS-Payload' }))
    expect(screen.getByText('Development only')).toBeDefined()
    expect(screen.getByRole('button', { name: 'git status' })).toBeDefined()
  })
})
