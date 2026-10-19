import { fetchJSON, IntegrationError, type IntegrationResult, missingEnv, settle } from './result'

/**
 * Google APIs with one API key (GOOGLE_API_KEY, with the "Chrome UX Report API" and the "PageSpeed
 * Insights API" enabled in Google Cloud):
 * - CrUX: Core Web Vitals of real Chrome users, 28-day p75 and weekly history.
 *   https://developer.chrome.com/docs/crux/api
 * - PageSpeed Insights: a Lighthouse lab run (used by the nightly job).
 *   https://developers.google.com/speed/docs/insights/v5/get-started
 */
export const GOOGLE_ENV = ['GOOGLE_API_KEY'] as const

const CRUX = 'https://chromeuxreport.googleapis.com/v1/records'
const PSI = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

/** Core Web Vitals and their "good" / "poor" thresholds (web.dev). */
export const WEB_VITALS = [
  {
    key: 'largest_contentful_paint',
    name: 'LCP',
    label: 'Largest Contentful Paint',
    unit: 'ms',
    good: 2500,
    poor: 4000,
  },
  {
    key: 'interaction_to_next_paint',
    name: 'INP',
    label: 'Interaction to Next Paint',
    unit: 'ms',
    good: 200,
    poor: 500,
  },
  {
    key: 'cumulative_layout_shift',
    name: 'CLS',
    label: 'Cumulative Layout Shift',
    unit: '',
    good: 0.1,
    poor: 0.25,
  },
  {
    key: 'first_contentful_paint',
    name: 'FCP',
    label: 'First Contentful Paint',
    unit: 'ms',
    good: 1800,
    poor: 3000,
  },
  {
    key: 'experimental_time_to_first_byte',
    name: 'TTFB',
    label: 'Time to First Byte',
    unit: 'ms',
    good: 800,
    poor: 1800,
  },
] as const

export type Rating = 'good' | 'average' | 'poor'
export type FormFactor = 'PHONE' | 'DESKTOP' | 'ALL'

export const rate = (value: number, metric: { good: number; poor: number }): Rating =>
  value <= metric.good ? 'good' : value <= metric.poor ? 'average' : 'poor'

export type FieldMetric = {
  key: string
  name: string
  label: string
  unit: string
  p75: number | null
  rating: Rating | null
  /** Share of page loads that were good / needs improvement / poor (0–1). */
  distribution: [number, number, number] | null
  /** Weekly p75 values, oldest first (null where CrUX had too little data). */
  trend: (number | null)[]
}

export type FieldReport = {
  origin: string
  formFactor: FormFactor
  /** The 28-day collection window of the latest values. */
  period: { first: string; last: string }
  metrics: FieldMetric[]
}

type CruxDate = { year: number; month: number; day: number }
type CruxRecordResponse = {
  record: {
    metrics: Record<
      string,
      {
        histogram?: { start: number | string; end?: number | string; density?: number }[]
        percentiles?: { p75?: number | string }
      }
    >
    collectionPeriod?: { firstDate: CruxDate; lastDate: CruxDate }
  }
}
type CruxHistoryResponse = {
  record: {
    metrics: Record<string, { percentilesTimeseries?: { p75s?: (number | string | null)[] } }>
  }
}

const toNumber = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === '' ? null : Number(value)
const isoDay = ({ year, month, day }: CruxDate) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/**
 * Field data for an origin. `data` is null when CrUX has no record (sites with little Chrome traffic,
 * or a local URL); that is a normal state, not an error.
 */
export async function fieldData(
  origin: string,
  formFactor: FormFactor = 'PHONE',
): Promise<IntegrationResult<FieldReport | null>> {
  const missing = missingEnv(...GOOGLE_ENV)
  if (missing.length > 0) return { status: 'not-configured', missing }
  const key = encodeURIComponent(process.env.GOOGLE_API_KEY ?? '')
  const body = {
    origin,
    ...(formFactor === 'ALL' ? {} : { formFactor }),
    metrics: WEB_VITALS.map((metric) => metric.key),
  }
  return settle(async () => {
    let record: CruxRecordResponse
    let history: CruxHistoryResponse | null
    try {
      ;[record, history] = await Promise.all([
        fetchJSON<CruxRecordResponse>(`${CRUX}:queryRecord?key=${key}`, {
          body,
          method: 'POST',
          revalidate: 43_200,
        }),
        fetchJSON<CruxHistoryResponse>(`${CRUX}:queryHistoryRecord?key=${key}`, {
          body: { ...body, collectionPeriodCount: 25 },
          method: 'POST',
          revalidate: 43_200,
        }).catch(() => null),
      ])
    } catch (error) {
      if (error instanceof IntegrationError && error.status === 404) return null
      throw error
    }
    const period = record.record.collectionPeriod
    return {
      origin,
      formFactor,
      period: period
        ? { first: isoDay(period.firstDate), last: isoDay(period.lastDate) }
        : { first: '', last: '' },
      metrics: WEB_VITALS.map((metric) => {
        const data = record.record.metrics[metric.key]
        const p75 = toNumber(data?.percentiles?.p75)
        const bins = data?.histogram?.map((bin) => bin.density ?? 0)
        return {
          key: metric.key,
          name: metric.name,
          label: metric.label,
          unit: metric.unit,
          p75,
          rating: p75 === null ? null : rate(p75, metric),
          distribution: bins && bins.length === 3 ? [bins[0], bins[1], bins[2]] : null,
          trend: (history?.record.metrics[metric.key]?.percentilesTimeseries?.p75s ?? []).map(
            toNumber,
          ),
        }
      }),
    }
  })
}

/* ------------------------------------------------------------------------------------------ */
/* PageSpeed Insights (lab)                                                                    */
/* ------------------------------------------------------------------------------------------ */

export const LIGHTHOUSE_CATEGORIES = [
  { key: 'performance', label: 'Performance' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'best-practices', label: 'Best practices' },
  { key: 'seo', label: 'SEO' },
] as const

export type LabRun = {
  url: string
  strategy: 'mobile' | 'desktop'
  /** Lighthouse category scores, 0–100. */
  scores: Record<(typeof LIGHTHOUSE_CATEGORIES)[number]['key'], number | null>
  /** Lab metrics in milliseconds (CLS unitless). */
  metrics: {
    lcp: number | null
    cls: number | null
    tbt: number | null
    fcp: number | null
    si: number | null
  }
  lighthouseVersion: string | null
}

type PSIResponse = {
  lighthouseResult?: {
    lighthouseVersion?: string
    categories?: Record<string, { score?: number | null }>
    audits?: Record<string, { numericValue?: number }>
  }
}

/** One PageSpeed Insights run (takes 10–40 s; not cached). */
export async function pageSpeedRun(url: string, strategy: 'mobile' | 'desktop'): Promise<LabRun> {
  const missing = missingEnv(...GOOGLE_ENV)
  if (missing.length > 0) throw new IntegrationError(`Set ${missing.join(', ')} to run PageSpeed`)
  const query = new URLSearchParams({ url, strategy, key: process.env.GOOGLE_API_KEY ?? '' })
  for (const { key } of LIGHTHOUSE_CATEGORIES)
    query.append('category', key.toUpperCase().replace('-', '_'))
  const json = await fetchJSON<PSIResponse>(`${PSI}?${query}`, { revalidate: 0, timeoutMs: 90_000 })
  const result = json.lighthouseResult
  const score = (key: string) => {
    const value = result?.categories?.[key]?.score
    return typeof value === 'number' ? Math.round(value * 100) : null
  }
  const audit = (key: string) => {
    const value = result?.audits?.[key]?.numericValue
    return typeof value === 'number'
      ? Math.round(value * (key === 'cumulative-layout-shift' ? 1000 : 1)) /
          (key === 'cumulative-layout-shift' ? 1000 : 1)
      : null
  }
  return {
    url,
    strategy,
    scores: {
      performance: score('performance'),
      accessibility: score('accessibility'),
      'best-practices': score('best-practices'),
      seo: score('seo'),
    },
    metrics: {
      lcp: audit('largest-contentful-paint'),
      cls: audit('cumulative-layout-shift'),
      tbt: audit('total-blocking-time'),
      fcp: audit('first-contentful-paint'),
      si: audit('speed-index'),
    },
    lighthouseVersion: result?.lighthouseVersion ?? null,
  }
}
