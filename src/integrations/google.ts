import { unstable_cache } from 'next/cache'

import {
  fetchJSON,
  IntegrationError,
  type IntegrationFailure,
  type IntegrationResult,
  missingEnv,
} from './result'

/**
 * Google APIs with one API key (GOOGLE_API_KEY) for which the "PageSpeed Insights API" and the
 * "Chrome UX Report API" are enabled in Google Cloud:
 * - PageSpeed Insights: a Lighthouse lab test of a page, the scores pagespeed.web.dev shows. Works
 *   for any public site. https://developers.google.com/speed/docs/insights/v5/get-started
 * - CrUX: Core Web Vitals of real Chrome users, 28-day p75 and weekly history. Only sites with
 *   enough Chrome traffic have a record. https://developer.chrome.com/docs/crux/api
 *
 * Both are called from the server. Requests name the site as their referrer, so a key restricted
 * to the site's own address (HTTP referrers) works as well as an unrestricted one.
 */
export const GOOGLE_ENV = ['GOOGLE_API_KEY'] as const

export const GOOGLE_APIS = {
  crux: { name: 'Chrome UX Report API', service: 'chromeuxreport.googleapis.com' },
  pagespeed: { name: 'PageSpeed Insights API', service: 'pagespeedonline.googleapis.com' },
} as const
export type GoogleAPI = keyof typeof GOOGLE_APIS

const CRUX = 'https://chromeuxreport.googleapis.com/v1/records'
const PSI = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const CREDENTIALS = 'https://console.cloud.google.com/apis/credentials'

/** Keys restricted to websites compare the referrer with their list; server requests have none. */
const headersFor = (site: string) => ({ Referer: `${new URL(site).origin}/` })

/* ------------------------------------------------------------------------------------------ */
/* Errors                                                                                      */
/* ------------------------------------------------------------------------------------------ */

type GoogleErrorBody = {
  error?: {
    message?: string
    status?: string
    details?: { reason?: string; metadata?: Record<string, string> }[]
  }
}

/**
 * Turns a failed Google call into a message that says what to change, with a link to change it.
 * Google names the cause in `error.details[].reason` (google.rpc.ErrorInfo).
 */
export function googleFailure(error: unknown, api: GoogleAPI, site: string): IntegrationFailure {
  if (!(error instanceof IntegrationError)) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
  const { name, service } = GOOGLE_APIS[api]
  const detail = (error.body as GoogleErrorBody | undefined)?.error
  const info = detail?.details?.find((item) => item.reason)
  const reason = info?.reason ?? ''
  const text = detail?.message ?? ''
  const host = new URL(site).host
  const editKey = { label: 'Edit the API key', href: CREDENTIALS }

  if (reason === 'SERVICE_DISABLED' || /has not been used in project|it is disabled/i.test(text)) {
    return {
      status: 'error',
      message: `the ${name} isn't enabled in the API key's Google Cloud project. After enabling it, allow a few minutes.`,
      action: {
        label: `Enable the ${name}`,
        href:
          info?.metadata?.activationUrl ??
          `https://console.cloud.google.com/apis/library/${service}`,
      },
    }
  }
  if (reason === 'API_KEY_INVALID' || /API key not valid/i.test(text)) {
    return {
      status: 'error',
      message: "GOOGLE_API_KEY isn't a valid API key. Copy the key again from Google Cloud.",
      action: { label: 'Open API keys', href: CREDENTIALS },
    }
  }
  if (reason === 'API_KEY_HTTP_REFERRER_BLOCKED') {
    return {
      status: 'error',
      message: `the API key only accepts requests from listed websites, and ${host} isn't one of them. Add ${host}/* to its website restrictions, or set its application restriction to None.`,
      action: editKey,
    }
  }
  if (reason === 'API_KEY_IP_ADDRESS_BLOCKED') {
    return {
      status: 'error',
      message:
        "the API key only accepts requests from listed IP addresses, and Vercel's servers have no fixed address. Set its application restriction to None (keep the API restrictions).",
      action: editKey,
    }
  }
  if (reason === 'API_KEY_SERVICE_BLOCKED') {
    return {
      status: 'error',
      message: `the API key's API restrictions don't include the ${name}. Add it to the list.`,
      action: editKey,
    }
  }
  if (
    error.status === 429 ||
    reason === 'RATE_LIMIT_EXCEEDED' ||
    reason === 'RESOURCE_QUOTA_EXCEEDED'
  ) {
    return {
      status: 'error',
      message: `Google's quota for the ${name} is used up for now. It tries again on a later visit.`,
    }
  }
  if (api === 'pagespeed' && error.status === undefined && /no answer within/.test(error.message)) {
    return {
      status: 'error',
      message: `the test of ${host} didn't finish within ${PAGESPEED_TIMEOUT_MS / 1000} s. The next visit tries again.`,
    }
  }
  // PageSpeed reached Google but Lighthouse couldn't load the page (offline, 4xx/5xx, a login).
  const lighthouse = /Lighthouse returned error: ([A-Z_]+)\.?\s*([\s\S]*)/.exec(text)
  if (lighthouse) {
    return {
      status: 'error',
      message: `Lighthouse couldn't test ${host} (${lighthouse[1]}). ${lighthouse[2]}`.trim(),
    }
  }
  return { status: 'error', message: error.message }
}

/* ------------------------------------------------------------------------------------------ */
/* Ratings                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type Rating = 'good' | 'average' | 'poor'
export type FormFactor = 'PHONE' | 'DESKTOP' | 'ALL'
export type Strategy = 'mobile' | 'desktop'

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

export const rate = (value: number, metric: { good: number; poor: number }): Rating =>
  value <= metric.good ? 'good' : value <= metric.poor ? 'average' : 'poor'

/** Lighthouse's colours for a 0–100 score: 90 and up good, 50–89 needs improvement, below poor. */
export const rateScore = (score: number): Rating =>
  score >= 90 ? 'good' : score >= 50 ? 'average' : 'poor'

/* ------------------------------------------------------------------------------------------ */
/* Chrome UX Report (field)                                                                    */
/* ------------------------------------------------------------------------------------------ */

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
  /** Set when the requested device type had too little data and all devices are shown instead. */
  fallbackFrom?: Exclude<FormFactor, 'ALL'>
  /** The 28-day collection window of the latest values (ISO days; empty when not reported). */
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

/** One CrUX record, or null when CrUX has none (404) for this origin and device type. */
async function queryField(origin: string, formFactor: FormFactor): Promise<FieldReport | null> {
  const key = encodeURIComponent(process.env.GOOGLE_API_KEY ?? '')
  const body = {
    origin,
    ...(formFactor === 'ALL' ? {} : { formFactor }),
    metrics: WEB_VITALS.map((metric) => metric.key),
  }
  const headers = headersFor(origin)
  let record: CruxRecordResponse
  let history: CruxHistoryResponse | null
  try {
    ;[record, history] = await Promise.all([
      fetchJSON<CruxRecordResponse>(`${CRUX}:queryRecord?key=${key}`, {
        body,
        headers,
        method: 'POST',
        revalidate: 0,
      }),
      fetchJSON<CruxHistoryResponse>(`${CRUX}:queryHistoryRecord?key=${key}`, {
        body: { ...body, collectionPeriodCount: 25 },
        headers,
        method: 'POST',
        revalidate: 0,
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
}

/** The requested device type, or all devices when that one alone has too little data. */
async function fieldReport(origin: string, formFactor: FormFactor): Promise<FieldReport | null> {
  const report = await queryField(origin, formFactor)
  if (report || formFactor === 'ALL') return report
  const all = await queryField(origin, 'ALL')
  return all ? { ...all, fallbackFrom: formFactor } : null
}

/** CrUX publishes once a day; "no record" is kept too, so small sites don't ask on every visit. */
export const FIELD_CACHE_SECONDS = 43_200

const cachedFieldReport = unstable_cache(fieldReport, ['crux-field-v1'], {
  revalidate: FIELD_CACHE_SECONDS,
  tags: ['pagespeed'],
})

/**
 * Field data for an origin (CrUX API, cached 12 hours). When phones or desktops alone have too
 * little data, all devices together are tried. `data` is null when CrUX has no record at all
 * (sites with little Chrome traffic); that is a normal state, not an error.
 */
export async function fieldData(
  origin: string,
  formFactor: FormFactor = 'PHONE',
): Promise<IntegrationResult<FieldReport | null>> {
  const missing = missingEnv(...GOOGLE_ENV)
  if (missing.length > 0) return { status: 'not-configured', missing }
  try {
    return { status: 'ok', data: await cachedFieldReport(origin, formFactor) }
  } catch (error) {
    return googleFailure(error, 'crux', origin)
  }
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

/** The lab metrics PageSpeed Insights lists, in its order. */
export const LAB_METRICS = [
  { audit: 'first-contentful-paint', name: 'FCP', label: 'First Contentful Paint' },
  { audit: 'largest-contentful-paint', name: 'LCP', label: 'Largest Contentful Paint' },
  { audit: 'total-blocking-time', name: 'TBT', label: 'Total Blocking Time' },
  { audit: 'cumulative-layout-shift', name: 'CLS', label: 'Cumulative Layout Shift' },
  { audit: 'speed-index', name: 'SI', label: 'Speed Index' },
] as const

export type LabScore = { key: string; label: string; score: number | null; rating: Rating | null }
export type LabMetric = {
  key: string
  name: string
  label: string
  /** Lighthouse's own formatting ("1.2 s", "30 ms", "0.002"). */
  display: string
  /** Milliseconds (CLS unitless). */
  value: number | null
  rating: Rating | null
}
export type LabRun = {
  /** The page Lighthouse ended up on (after redirects). */
  url: string
  strategy: Strategy
  /** When Lighthouse ran (ISO). */
  fetchedAt: string
  scores: LabScore[]
  metrics: LabMetric[]
  lighthouseVersion: string | null
}

type PSIResponse = {
  analysisUTCTimestamp?: string
  lighthouseResult?: {
    lighthouseVersion?: string
    fetchTime?: string
    finalDisplayedUrl?: string
    finalUrl?: string
    requestedUrl?: string
    runtimeError?: { code?: string; message?: string }
    categories?: Record<string, { score?: number | null }>
    audits?: Record<string, { score?: number | null; numericValue?: number; displayValue?: string }>
  }
}

/**
 * One run takes 10–40 s. The wait ends before the admin route's 60 s limit (`maxDuration` in
 * app/(payload)/admin/[[...segments]]/layout.tsx), so a slow run ends in a readable error.
 */
export const PAGESPEED_TIMEOUT_MS = 55_000

const formatLabValue = (audit: string, value: number) =>
  audit === 'cumulative-layout-shift'
    ? String(Math.round(value * 1000) / 1000)
    : value >= 1000
      ? `${(value / 1000).toFixed(1)} s`
      : `${Math.round(value)} ms`

/** One PageSpeed Insights run (uncached). Throws IntegrationError. */
export async function runPageSpeed(url: string, strategy: Strategy): Promise<LabRun> {
  const query = new URLSearchParams({
    url,
    strategy: strategy.toUpperCase(),
    key: process.env.GOOGLE_API_KEY ?? '',
  })
  for (const { key } of LIGHTHOUSE_CATEGORIES)
    query.append('category', key.toUpperCase().replace('-', '_'))
  const json = await fetchJSON<PSIResponse>(`${PSI}?${query}`, {
    headers: headersFor(url),
    revalidate: 0,
    timeoutMs: PAGESPEED_TIMEOUT_MS,
  })
  const result = json.lighthouseResult
  if (!result) throw new IntegrationError('PageSpeed Insights sent no Lighthouse result')
  const failure = result.runtimeError
  if (failure?.code && failure.code !== 'NO_ERROR') {
    throw new IntegrationError(
      `Lighthouse couldn't test ${new URL(url).host} (${failure.code}). ${failure.message ?? ''}`.trim(),
    )
  }
  return {
    url: result.finalDisplayedUrl ?? result.finalUrl ?? result.requestedUrl ?? url,
    strategy,
    fetchedAt: result.fetchTime ?? json.analysisUTCTimestamp ?? new Date().toISOString(),
    scores: LIGHTHOUSE_CATEGORIES.map(({ key, label }) => {
      const value = result.categories?.[key]?.score
      const score = typeof value === 'number' ? Math.round(value * 100) : null
      return { key, label, score, rating: score === null ? null : rateScore(score) }
    }),
    metrics: LAB_METRICS.map(({ audit, label, name }) => {
      const data = result.audits?.[audit]
      const value = typeof data?.numericValue === 'number' ? data.numericValue : null
      const score = typeof data?.score === 'number' ? Math.round(data.score * 100) : null
      return {
        key: audit,
        name,
        label,
        display: data?.displayValue ?? (value === null ? '–' : formatLabValue(audit, value)),
        value,
        rating: score === null ? null : rateScore(score),
      }
    }),
    lighthouseVersion: result.lighthouseVersion ?? null,
  }
}

/** Lab results are kept for a day: the next visit after that shows them and runs a fresh test. */
export const LAB_CACHE_SECONDS = 86_400

// Visits while a test runs (a reload, a second tab) wait for that run instead of starting another.
const running = new Map<string, Promise<LabRun>>()
function runPageSpeedOnce(url: string, strategy: Strategy): Promise<LabRun> {
  const key = `${strategy} ${url}`
  let run = running.get(key)
  if (!run) {
    run = runPageSpeed(url, strategy).finally(() => running.delete(key))
    running.set(key, run)
  }
  return run
}

// Cached in Next.js's data cache (on Vercel, shared by all instances). Only the small LabRun is
// stored: the raw answer is several hundred kB, too big for the fetch cache. Failures throw, so
// they are never cached and the next visit tries again.
const cachedPageSpeed = unstable_cache(runPageSpeedOnce, ['pagespeed-lab-v1'], {
  revalidate: LAB_CACHE_SECONDS,
  tags: ['pagespeed'],
})

/** Lighthouse lab test of a public page through PageSpeed Insights, cached for a day. */
export async function labData(url: string, strategy: Strategy): Promise<IntegrationResult<LabRun>> {
  const missing = missingEnv(...GOOGLE_ENV)
  if (missing.length > 0) return { status: 'not-configured', missing }
  try {
    return { status: 'ok', data: await cachedPageSpeed(url, strategy) }
  } catch (error) {
    return googleFailure(error, 'pagespeed', url)
  }
}
