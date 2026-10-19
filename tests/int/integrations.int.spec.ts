import { afterEach, describe, expect, it, vi } from 'vitest'

import { latestWorkflowRuns } from '@/integrations/github'
import { fieldData, labData, rate, rateScore, WEB_VITALS } from '@/integrations/google'
import { isPublicHost, publicSite } from '@/integrations/site'
import { latestDeployments, siteTraffic } from '@/integrations/vercel'

// Next's data cache needs a running Next.js server; here the cached function runs directly.
vi.mock('next/cache', () => ({ unstable_cache: <T>(fn: T) => fn }))

/**
 * External services are mocked: the sandbox and CI can't reach them, and tests must not need
 * tokens. These check the request shape and how answers become widget data.
 */
const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
  vi.unstubAllGlobals()
})

function mockFetch(handler: (url: URL, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: URL; init: RequestInit }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      calls.push({ url, init })
      const { status = 200, body } = handler(url, init)
      return new Response(JSON.stringify(body), { status })
    }),
  )
  return calls
}

describe('Vercel Web Analytics', () => {
  it('asks for the missing environment variables', async () => {
    delete process.env.VERCEL_TOKEN
    delete process.env.VERCEL_PROJECT_ID
    expect(await siteTraffic(7)).toEqual({
      status: 'not-configured',
      missing: ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'],
    })
  })

  it('combines totals, the daily series, top pages and referrers', async () => {
    process.env.VERCEL_TOKEN = 'token-1'
    process.env.VERCEL_PROJECT_ID = 'prj_1'
    process.env.VERCEL_TEAM_ID = 'team_1'
    const today = new Date().toISOString().slice(0, 10)
    const calls = mockFetch((url) => {
      if (url.pathname.endsWith('/visits/count')) {
        return { body: { data: { pageviews: 120, visitors: 80 } } }
      }
      const by = url.searchParams.get('by')
      if (by === 'day') {
        return {
          body: { data: [{ timestamp: `${today}T00:00:00.000Z`, pageviews: 30, visitors: 20 }] },
        }
      }
      if (by === 'requestPath') {
        return {
          body: {
            data: [
              { requestPath: '/articles/hello', pageviews: 50, visitors: 40 },
              { requestPath: 'Others', pageviews: 10, visitors: 9 },
            ],
          },
        }
      }
      return { body: { data: [{ referrerHostname: 'github.com', pageviews: 7, visitors: 5 }] } }
    })

    const result = await siteTraffic(7)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.totals).toEqual({ pageviews: 120, visitors: 80 })
    expect(result.data.daily).toHaveLength(7)
    expect(result.data.daily.at(-1)).toEqual({ date: today, pageviews: 30, visitors: 20 })
    expect(result.data.topPages).toEqual([{ path: '/articles/hello', pageviews: 50, visitors: 40 }])
    expect(result.data.topReferrers).toEqual([{ host: 'github.com', pageviews: 7, visitors: 5 }])

    expect(calls).toHaveLength(4)
    for (const { url, init } of calls) {
      expect(url.origin).toBe('https://api.vercel.com')
      expect(url.searchParams.get('projectId')).toBe('prj_1')
      expect(url.searchParams.get('teamId')).toBe('team_1')
      expect(url.toString()).not.toContain('token-1')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1')
    }
  })

  it('reports an API error with the service message', async () => {
    process.env.VERCEL_TOKEN = 'token-1'
    process.env.VERCEL_PROJECT_ID = 'prj_1'
    mockFetch(() => ({ status: 403, body: { error: { message: 'Not authorized' } } }))
    const result = await siteTraffic(7)
    expect(result).toEqual({
      status: 'error',
      message: 'api.vercel.com answered 403: Not authorized',
    })
  })
})

describe('Chrome UX Report', () => {
  it('rates values with the web.dev thresholds', () => {
    const [lcp, , cls] = WEB_VITALS
    expect(rate(2500, lcp)).toBe('good')
    expect(rate(2501, lcp)).toBe('average')
    expect(rate(4001, lcp)).toBe('poor')
    expect(rate(0.1, cls)).toBe('good')
    expect(rate(0.3, cls)).toBe('poor')
  })

  it('reads p75, distribution and the weekly trend (CLS arrives as a string)', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    const calls = mockFetch((url) => {
      if (url.pathname.endsWith(':queryHistoryRecord')) {
        return {
          body: {
            record: {
              metrics: {
                largest_contentful_paint: { percentilesTimeseries: { p75s: [2400, null, 2100] } },
              },
            },
          },
        }
      }
      return {
        body: {
          record: {
            metrics: {
              largest_contentful_paint: {
                histogram: [
                  { start: 0, end: 2500, density: 0.8 },
                  { start: 2500, end: 4000, density: 0.15 },
                  { start: 4000, density: 0.05 },
                ],
                percentiles: { p75: 2100 },
              },
              cumulative_layout_shift: { percentiles: { p75: '0.12' } },
            },
            collectionPeriod: {
              firstDate: { year: 2026, month: 9, day: 20 },
              lastDate: { year: 2026, month: 10, day: 17 },
            },
          },
        },
      }
    })
    const result = await fieldData('https://example.com', 'PHONE')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok' || !result.data) return
    const [lcp, inp, cls] = result.data.metrics
    expect(lcp).toMatchObject({
      p75: 2100,
      rating: 'good',
      distribution: [0.8, 0.15, 0.05],
      trend: [2400, null, 2100],
    })
    expect(inp).toMatchObject({ p75: null, rating: null })
    expect(cls).toMatchObject({ p75: 0.12, rating: 'average' })
    expect(result.data.period).toEqual({ first: '2026-09-20', last: '2026-10-17' })
    expect(calls[0].url.searchParams.get('key')).toBe('key-1')
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      origin: 'https://example.com',
      formFactor: 'PHONE',
    })
  })

  it('treats a missing record (404) as "no field data yet"', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    const calls = mockFetch(() => ({
      status: 404,
      body: { error: { message: 'chrome ux report data not found' } },
    }))
    expect(await fieldData('https://example.com')).toEqual({ status: 'ok', data: null })
    // Phones first, then all devices together (no formFactor).
    const records = calls.filter(({ url }) => url.pathname.endsWith(':queryRecord'))
    expect(records.map(({ init }) => JSON.parse(String(init.body)).formFactor)).toEqual([
      'PHONE',
      undefined,
    ])
  })

  it('falls back to all devices when phones alone have too little data', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    mockFetch((url, init) => {
      const body = JSON.parse(String(init.body))
      if (body.formFactor === 'PHONE') {
        return { status: 404, body: { error: { message: 'chrome ux report data not found' } } }
      }
      if (url.pathname.endsWith(':queryHistoryRecord')) return { body: { record: { metrics: {} } } }
      return {
        body: {
          record: {
            metrics: { largest_contentful_paint: { percentiles: { p75: 1800 } } },
            collectionPeriod: {
              firstDate: { year: 2026, month: 9, day: 20 },
              lastDate: { year: 2026, month: 10, day: 17 },
            },
          },
        },
      }
    })
    const result = await fieldData('https://example.com', 'PHONE')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data).toMatchObject({ formFactor: 'ALL', fallbackFrom: 'PHONE' })
    expect(result.data?.metrics[0]).toMatchObject({ p75: 1800, rating: 'good' })
  })

  it('names the site as referrer, for keys restricted to websites', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    const calls = mockFetch(() => ({ status: 404, body: {} }))
    await fieldData('https://example.com', 'ALL')
    expect((calls[0].init.headers as Record<string, string>).Referer).toBe('https://example.com/')
  })

  it('explains a disabled API with a link to enable it', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    const activationUrl =
      'https://console.developers.google.com/apis/api/chromeuxreport.googleapis.com/overview?project=123'
    mockFetch(() => ({
      status: 403,
      body: {
        error: {
          code: 403,
          message: `Chrome UX Report API has not been used in project 123 before or it is disabled. Enable it by visiting ${activationUrl} then retry.`,
          status: 'PERMISSION_DENIED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'SERVICE_DISABLED',
              domain: 'googleapis.com',
              metadata: { service: 'chromeuxreport.googleapis.com', activationUrl },
            },
          ],
        },
      },
    }))
    const result = await fieldData('https://example.com')
    expect(result).toMatchObject({
      status: 'error',
      message: expect.stringContaining("Chrome UX Report API isn't enabled"),
      action: { label: 'Enable the Chrome UX Report API', href: activationUrl },
    })
  })

  it.each([
    ['API_KEY_INVALID', 400, "GOOGLE_API_KEY isn't a valid API key"],
    ['API_KEY_HTTP_REFERRER_BLOCKED', 403, "example.com isn't one of them"],
    ['API_KEY_SERVICE_BLOCKED', 403, "don't include the Chrome UX Report API"],
    ['API_KEY_IP_ADDRESS_BLOCKED', 403, 'listed IP addresses'],
    ['RATE_LIMIT_EXCEEDED', 429, 'quota'],
  ])('explains %s', async (reason, status, text) => {
    process.env.GOOGLE_API_KEY = 'key-1'
    mockFetch(() => ({
      status,
      body: { error: { code: status, message: 'Denied', details: [{ reason }] } },
    }))
    const result = await fieldData('https://example.com', 'ALL')
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain(text)
  })
})

/** A trimmed PageSpeed Insights answer (the real one also carries every audit's details). */
const psiAnswer = (overrides: Record<string, unknown> = {}) => ({
  analysisUTCTimestamp: '2026-10-19T10:00:05.000Z',
  lighthouseResult: {
    lighthouseVersion: '13.0.1',
    fetchTime: '2026-10-19T10:00:00.000Z',
    requestedUrl: 'https://example.com/',
    finalDisplayedUrl: 'https://www.example.com/',
    categories: {
      performance: { score: 0.84 },
      accessibility: { score: 0.98 },
      'best-practices': { score: 1 },
      seo: { score: 0.42 },
    },
    audits: {
      'first-contentful-paint': { score: 0.95, numericValue: 1420.5, displayValue: '1.4\u00a0s' },
      'largest-contentful-paint': { score: 0.6, numericValue: 3080, displayValue: '3.1\u00a0s' },
      'total-blocking-time': { score: 0.99, numericValue: 120, displayValue: '120\u00a0ms' },
      'cumulative-layout-shift': { score: 0.2, numericValue: 0.3123 },
      'speed-index': { score: 0.9, numericValue: 2900, displayValue: '2.9\u00a0s' },
    },
    ...overrides,
  },
})

describe('PageSpeed Insights', () => {
  it('rates scores like Lighthouse', () => {
    expect([100, 90, 89, 50, 49, 0].map(rateScore)).toEqual([
      'good',
      'good',
      'average',
      'average',
      'poor',
      'poor',
    ])
  })

  it('asks for the API key', async () => {
    delete process.env.GOOGLE_API_KEY
    expect(await labData('https://example.com/', 'mobile')).toEqual({
      status: 'not-configured',
      missing: ['GOOGLE_API_KEY'],
    })
  })

  it('runs every category for the strategy and reads scores and lab metrics', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    const calls = mockFetch(() => ({ body: psiAnswer() }))
    const result = await labData('https://example.com/', 'mobile')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    const { searchParams } = calls[0].url
    expect(calls[0].url.pathname).toBe('/pagespeedonline/v5/runPagespeed')
    expect(searchParams.get('url')).toBe('https://example.com/')
    expect(searchParams.get('strategy')).toBe('MOBILE')
    expect(searchParams.getAll('category')).toEqual([
      'PERFORMANCE',
      'ACCESSIBILITY',
      'BEST_PRACTICES',
      'SEO',
    ])
    expect(searchParams.get('key')).toBe('key-1')
    expect((calls[0].init.headers as Record<string, string>).Referer).toBe('https://example.com/')

    expect(result.data).toMatchObject({
      url: 'https://www.example.com/',
      strategy: 'mobile',
      fetchedAt: '2026-10-19T10:00:00.000Z',
      lighthouseVersion: '13.0.1',
    })
    expect(result.data.scores.map(({ score, rating }) => [score, rating])).toEqual([
      [84, 'average'],
      [98, 'good'],
      [100, 'good'],
      [42, 'poor'],
    ])
    expect(result.data.metrics.map(({ name, display, rating }) => [name, display, rating])).toEqual(
      [
        ['FCP', '1.4\u00a0s', 'good'],
        ['LCP', '3.1\u00a0s', 'average'],
        ['TBT', '120\u00a0ms', 'good'],
        // No displayValue: formatted from numericValue.
        ['CLS', '0.312', 'poor'],
        ['SI', '2.9\u00a0s', 'good'],
      ],
    )
  })

  it('runs one test at a time for a page and strategy', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    const calls = mockFetch(() => ({ body: psiAnswer() }))
    const [first, second] = await Promise.all([
      labData('https://example.com/', 'mobile'),
      labData('https://example.com/', 'mobile'),
    ])
    expect(calls).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it('reports a page Lighthouse could not load', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    mockFetch(() => ({
      status: 500,
      body: {
        error: {
          code: 500,
          message:
            'Lighthouse returned error: ERRORED_DOCUMENT_REQUEST. Lighthouse was unable to reliably load the page you requested. (Status code: 401)',
        },
      },
    }))
    expect(await labData('https://example.com/', 'desktop')).toEqual({
      status: 'error',
      message:
        "Lighthouse couldn't test example.com (ERRORED_DOCUMENT_REQUEST). Lighthouse was unable to reliably load the page you requested. (Status code: 401)",
    })
  })

  it('reports a test that took too long', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        })
      }),
    )
    expect(await labData('https://example.com/', 'mobile')).toEqual({
      status: 'error',
      message: "the test of example.com didn't finish within 55 s. The next visit tries again.",
    })
  })

  it('reports a Lighthouse runtime error in a successful answer', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    mockFetch(() => ({
      body: psiAnswer({ runtimeError: { code: 'NO_FCP', message: 'The page did not paint.' } }),
    }))
    expect(await labData('https://example.com/', 'mobile')).toEqual({
      status: 'error',
      message: "Lighthouse couldn't test example.com (NO_FCP). The page did not paint.",
    })
  })

  it('explains a disabled PageSpeed Insights API', async () => {
    process.env.GOOGLE_API_KEY = 'key-1'
    mockFetch(() => ({
      status: 403,
      body: {
        error: { code: 403, message: 'Disabled', details: [{ reason: 'SERVICE_DISABLED' }] },
      },
    }))
    expect(await labData('https://example.com/', 'mobile')).toMatchObject({
      status: 'error',
      action: {
        label: 'Enable the PageSpeed Insights API',
        href: 'https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com',
      },
    })
  })
})

describe('Public site address', () => {
  it('uses NEXT_PUBLIC_SITE_URL when Google can reach it', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com/some/path'
    expect(publicSite()).toEqual({
      status: 'ok',
      origin: 'https://example.com',
      host: 'example.com',
    })
  })

  it("falls back to Vercel's production domain", () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'site.vercel.app'
    expect(publicSite()).toMatchObject({ status: 'ok', origin: 'https://site.vercel.app' })
  })

  it('reports a local address, or none', () => {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
    expect(publicSite()).toEqual({ status: 'local', configured: 'http://localhost:3000' })
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(publicSite()).toEqual({ status: 'missing' })
  })

  it('tells public hosts from local and private ones', () => {
    expect(
      ['example.com', 'www.vtarikhi.com', '8.8.8.8', '[2001:db8::1]'].map(isPublicHost),
    ).toEqual([true, true, true, true])
    expect(
      [
        'localhost',
        'app.localhost',
        'pc.local',
        '127.0.0.1',
        '10.0.0.2',
        '192.168.1.5',
        '172.20.0.1',
        '[::1]',
        'db',
      ].map(isPublicHost),
    ).toEqual([false, false, false, false, false, false, false, false, false])
  })
})

describe('Vercel deployments', () => {
  it('maps state, target, git metadata and build time', async () => {
    process.env.VERCEL_TOKEN = 'token-1'
    process.env.VERCEL_PROJECT_ID = 'prj_1'
    const calls = mockFetch(() => ({
      body: {
        deployments: [
          {
            uid: 'dpl_1',
            url: 'site-abc.vercel.app',
            readyState: 'READY',
            target: 'production',
            createdAt: 1_760_000_000_000,
            ready: 1_760_000_094_000,
            inspectorUrl: 'https://vercel.com/x/y/dpl_1',
            meta: {
              githubCommitRef: 'main',
              githubCommitMessage: 'fix: links',
              githubCommitSha: 'abcdef1234',
              githubCommitAuthorLogin: 'me',
            },
          },
          { uid: 'dpl_2', state: 'BUILDING', target: null, created: 1_760_000_100_000 },
        ],
      },
    }))
    const result = await latestDeployments(2)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data[0]).toMatchObject({
      id: 'dpl_1',
      url: 'https://site-abc.vercel.app',
      state: 'READY',
      target: 'production',
      buildSeconds: 94,
      branch: 'main',
      commitMessage: 'fix: links',
      author: 'me',
    })
    expect(result.data[1]).toMatchObject({
      state: 'BUILDING',
      target: 'preview',
      buildSeconds: null,
    })
    expect(calls[0].url.pathname).toBe('/v6/deployments')
    expect(calls[0].url.searchParams.get('limit')).toBe('2')
  })
})

describe('GitHub Actions', () => {
  it('needs a repository', async () => {
    delete process.env.GITHUB_REPOSITORY
    delete process.env.VERCEL_GIT_REPO_OWNER
    delete process.env.VERCEL_GIT_REPO_SLUG
    expect(await latestWorkflowRuns()).toEqual({
      status: 'not-configured',
      missing: ['GITHUB_REPOSITORY'],
    })
  })

  it('reads the repository from Vercel git variables and maps runs', async () => {
    delete process.env.GITHUB_REPOSITORY
    process.env.VERCEL_GIT_REPO_OWNER = 'owner'
    process.env.VERCEL_GIT_REPO_SLUG = 'repo'
    process.env.GITHUB_TOKEN = 'gh-token'
    const calls = mockFetch(() => ({
      body: {
        workflow_runs: [
          {
            id: 7,
            name: 'CI',
            display_title: 'feat: x',
            head_branch: 'main',
            head_sha: '1234567890',
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://github.com/owner/repo/actions/runs/7',
            event: 'push',
            created_at: '2026-10-19T00:00:00Z',
            run_started_at: '2026-10-19T00:00:00Z',
            updated_at: '2026-10-19T00:05:12Z',
            actor: { login: 'me' },
          },
        ],
      },
    }))
    const result = await latestWorkflowRuns(1)
    expect(result).toMatchObject({
      status: 'ok',
      data: {
        repository: 'owner/repo',
        runs: [{ id: 7, conclusion: 'success', durationSeconds: 312, actor: 'me' }],
      },
    })
    expect(calls[0].url.pathname).toBe('/repos/owner/repo/actions/runs')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer gh-token')
  })
})
