import { afterEach, describe, expect, it, vi } from 'vitest'

import { fieldData, rate, WEB_VITALS } from '@/integrations/google'
import { siteTraffic } from '@/integrations/vercel'

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
    mockFetch(() => ({
      status: 404,
      body: { error: { message: 'chrome ux report data not found' } },
    }))
    expect(await fieldData('https://example.com')).toEqual({ status: 'ok', data: null })
  })
})
