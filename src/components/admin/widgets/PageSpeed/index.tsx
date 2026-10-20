import type { WidgetServerProps } from 'payload'
import { ExternalLinkIcon } from 'lucide-react'
import React, { Suspense } from 'react'

import { hasCapability, isAdmin } from '@/access/permissions'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { Sparkline } from '@/components/admin/elements/Sparkline'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { cn } from '@/components/admin/utilities/cn'
import { relativeTime } from '@/components/admin/utilities/dates'
import {
  fieldData,
  type FieldReport,
  type FormFactor,
  GOOGLE_ENV,
  labData,
  type LabMetric,
  type LabRun,
  type LabScore,
  LIGHTHOUSE_CATEGORIES,
  type Rating,
  type Strategy,
} from '@/integrations/google'
import { missingEnv } from '@/integrations/result'

import { StoredHistory } from './History'
import { publicSite } from '@/integrations/site'

export const FORM_FACTORS = [
  { label: 'Phones', value: 'PHONE' },
  { label: 'Desktops', value: 'DESKTOP' },
  { label: 'All devices', value: 'ALL' },
] as const satisfies readonly { label: string; value: FormFactor }[]

/** Lighthouse emulates a phone or a desktop; "All devices" tests the phone layout. */
export const strategyFor = (formFactor: FormFactor): Strategy =>
  formFactor === 'DESKTOP' ? 'desktop' : 'mobile'

const SETUP_URL = 'https://developers.google.com/speed/docs/insights/v5/get-started'

const RATING_LABEL: Record<Rating, string> = {
  good: 'Good',
  average: 'Needs improvement',
  poor: 'Poor',
}
const RATING_STYLE: Record<Rating, string> = {
  good: 'acn:bg-rating-good/6 acn:text-rating-good',
  average: 'acn:bg-rating-average/6 acn:text-rating-average',
  poor: 'acn:bg-rating-poor/6 acn:text-rating-poor',
}
const RATING_TEXT: Record<Rating, string> = {
  good: 'acn:text-rating-good',
  average: 'acn:text-rating-average',
  poor: 'acn:text-rating-poor',
}
const RATING_STROKE: Record<Rating, string> = {
  good: 'acn:stroke-rating-good',
  average: 'acn:stroke-rating-average',
  poor: 'acn:stroke-rating-poor',
}
const RATING_FILL: Record<Rating, string> = {
  good: 'acn:fill-rating-good',
  average: 'acn:fill-rating-average',
  poor: 'acn:fill-rating-poor',
}

export const formatMetric = (value: number | null, unit: string) => {
  if (value === null) return '–'
  if (unit !== 'ms') return value.toFixed(2)
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
}

const percent = (value: number) => `${Math.round(value * 100)}%`
const day = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const deviceLabel = (formFactor: FormFactor) =>
  FORM_FACTORS.find((option) => option.value === formFactor)?.label.toLowerCase() ?? ''

/* ------------------------------------------------------------------------------------------ */
/* Widget                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/**
 * Page speed of the public site, like pagespeed.web.dev shows it:
 * - Lab test: Lighthouse scores (performance, accessibility, best practices, SEO) and lab metrics
 *   from the PageSpeed Insights API. A run takes 10–40 s, so it streams in behind a placeholder
 *   and is kept for a day (`labData`).
 * - Real users: Core Web Vitals of Chrome users from the Chrome UX Report (p75 with the share of
 *   good / average / poor loads and the 25-week trend). Small sites have no record; the lab test
 *   works without one.
 * Needs the "Site traffic and page speed" capability, GOOGLE_API_KEY and a public site address.
 */
export async function PageSpeedWidget({ req, user, widgetData }: WidgetServerProps) {
  const formFactor =
    FORM_FACTORS.find((option) => option.value === widgetData?.formFactor)?.value ?? 'PHONE'
  const strategy = strategyFor(formFactor)
  const admin = isAdmin(user)

  if (!hasCapability(user, 'viewAnalytics')) {
    return (
      <PageSpeedCard>
        <IntegrationNotice service="Page speed" state="forbidden" />
      </PageSpeedCard>
    )
  }
  const site = publicSite()
  if (site.status !== 'ok') {
    return (
      <PageSpeedCard>
        <IntegrationNotice
          service="Page speed"
          state="not-configured"
          missing={['NEXT_PUBLIC_SITE_URL']}
          isAdmin={admin}
          hint={
            site.status === 'local'
              ? `It is set to ${site.configured}, which Google's servers can't reach: Page speed tests the public site.`
              : 'The public address of the site, such as https://example.com.'
          }
        />
      </PageSpeedCard>
    )
  }
  const missing = missingEnv(...GOOGLE_ENV)
  if (missing.length > 0) {
    return (
      <PageSpeedCard host={site.host} origin={site.origin} strategy={strategy}>
        <IntegrationNotice
          service="Page speed"
          state="not-configured"
          missing={missing}
          isAdmin={admin}
          docsURL={SETUP_URL}
          hint="Create an API key in Google Cloud and enable the PageSpeed Insights API and the Chrome UX Report API for its project."
        />
      </PageSpeedCard>
    )
  }
  return (
    <PageSpeedCard host={site.host} origin={site.origin} strategy={strategy}>
      <div className="acn:flex acn:flex-col acn:gap-6">
        <Suspense fallback={<LabPending host={site.host} strategy={strategy} />}>
          <LabSection
            url={`${site.origin}/`}
            strategy={strategy}
            isAdmin={admin}
            language={req.i18n.language}
          />
        </Suspense>
        <StoredHistory
          url={`${site.origin}/`}
          strategy={strategy}
          language={req.i18n.language}
          req={req}
        />
        <Suspense fallback={<FieldPending />}>
          <FieldSection
            origin={site.origin}
            host={site.host}
            formFactor={formFactor}
            isAdmin={admin}
          />
        </Suspense>
      </div>
    </PageSpeedCard>
  )
}

async function LabSection({
  isAdmin,
  language,
  strategy,
  url,
}: {
  isAdmin: boolean
  language: string
  strategy: Strategy
  url: string
}) {
  const result = await labData(url, strategy)
  if (result.status === 'ok') return <LabReport run={result.data} language={language} />
  return (
    <Section title="Lab test" meta={`Lighthouse on ${strategy}`}>
      <IntegrationNotice
        service="PageSpeed Insights"
        state={result.status}
        missing={result.status === 'not-configured' ? result.missing : undefined}
        message={result.status === 'error' ? result.message : undefined}
        action={result.status === 'error' ? result.action : undefined}
        isAdmin={isAdmin}
      />
    </Section>
  )
}

async function FieldSection({
  formFactor,
  host,
  isAdmin,
  origin,
}: {
  formFactor: FormFactor
  host: string
  isAdmin: boolean
  origin: string
}) {
  const result = await fieldData(origin, formFactor)
  if (result.status === 'ok') {
    return <FieldReportSection report={result.data} host={host} />
  }
  return (
    <Section title="Real users" meta="Chrome UX Report">
      <IntegrationNotice
        service="the Chrome UX Report"
        state={result.status}
        missing={result.status === 'not-configured' ? result.missing : undefined}
        message={result.status === 'error' ? result.message : undefined}
        action={result.status === 'error' ? result.action : undefined}
        isAdmin={isAdmin}
      />
    </Section>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Views (no data fetching; the gallery renders them with sample data)                         */
/* ------------------------------------------------------------------------------------------ */

function PageSpeedCard({
  children,
  host,
  origin,
  strategy = 'mobile',
}: {
  children: React.ReactNode
  host?: string
  origin?: string
  strategy?: Strategy
}) {
  return (
    <WidgetCard
      title="Page speed"
      description={
        host
          ? `Lighthouse lab test and real-user Core Web Vitals for ${host}.`
          : 'Lighthouse lab test and real-user Core Web Vitals.'
      }
      action={
        origin ? (
          <a
            href={`https://pagespeed.web.dev/report?url=${encodeURIComponent(`${origin}/`)}&form_factor=${strategy}`}
            target="_blank"
            rel="noopener noreferrer"
            className="acn:relative acn:inline-flex acn:items-center acn:gap-1 acn:text-xs acn:text-muted-foreground acn:hover:text-foreground"
          >
            PageSpeed Insights <ExternalLinkIcon aria-hidden className="acn:size-3.5" />
            <span className="acn:sr-only"> (opens in a new tab)</span>
          </a>
        ) : undefined
      }
    >
      {children}
    </WidgetCard>
  )
}

/**
 * A titled part of the widget. It is a size container (`@container`), so its layout follows the
 * widget's width, which users change per widget, rather than the viewport's.
 */
function Section({
  children,
  meta,
  title,
}: {
  children: React.ReactNode
  meta?: string
  title: string
}) {
  return (
    <section className="acn:@container acn:flex acn:flex-col acn:gap-3">
      <div className="acn:flex acn:flex-wrap acn:items-baseline acn:justify-between acn:gap-x-3 acn:gap-y-0.5">
        <h3 className="acn:m-0 acn:text-sm acn:font-semibold">{title}</h3>
        {meta ? <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">{meta}</p> : null}
      </div>
      {children}
    </section>
  )
}

const RING = 2 * Math.PI * 22

/** A Lighthouse score as PageSpeed Insights draws it: a ring filled to the score. */
function ScoreGauge({ label, rating, score }: Omit<LabScore, 'key'>) {
  return (
    <li className="acn:relative acn:flex acn:min-w-0 acn:flex-col acn:items-center acn:gap-1.5 acn:text-center">
      <span className="acn:sr-only">
        {label}: {score === null ? 'no score' : `${score} of 100`}
        {rating ? `, ${RATING_LABEL[rating].toLowerCase()}` : ''}
      </span>
      <span aria-hidden className="acn:relative acn:grid acn:size-14 acn:place-items-center">
        <svg viewBox="0 0 52 52" className="acn:absolute acn:inset-0 acn:size-full acn:-rotate-90">
          <circle cx="26" cy="26" r="22" fill="none" strokeWidth="4" className="acn:stroke-muted" />
          {score !== null && rating ? (
            <circle
              cx="26"
              cy="26"
              r="22"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * RING} ${RING}`}
              className={RATING_STROKE[rating]}
            />
          ) : null}
        </svg>
        <span
          className={cn(
            'acn:text-base acn:font-semibold acn:tabular-nums',
            rating ? RATING_TEXT[rating] : 'acn:text-muted-foreground',
          )}
        >
          {score ?? '–'}
        </span>
      </span>
      <span aria-hidden className="acn:text-xs acn:leading-tight acn:text-muted-foreground">
        {label}
      </span>
    </li>
  )
}

/** PageSpeed Insights' shapes, so the rating doesn't rely on colour: ● good, ■ average, ▲ poor. */
function RatingMark({ rating }: { rating: Rating }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={cn('acn:size-2.5 acn:shrink-0', RATING_FILL[rating])}
    >
      {rating === 'good' ? (
        <circle cx="5" cy="5" r="5" />
      ) : rating === 'average' ? (
        <rect width="10" height="10" rx="1" />
      ) : (
        <path d="M5 0.5 10 9.5H0Z" />
      )}
    </svg>
  )
}

function LabMetricItem({ metric }: { metric: LabMetric }) {
  return (
    <div className="acn:flex acn:items-center acn:justify-between acn:gap-2 acn:border-b acn:border-border acn:py-1.5">
      <dt className="acn:text-muted-foreground">
        <abbr title={metric.label} className="acn:no-underline">
          {metric.name}
        </abbr>
      </dt>
      <dd className="acn:relative acn:m-0 acn:flex acn:items-center acn:gap-1.5 acn:font-medium acn:whitespace-nowrap acn:tabular-nums">
        {metric.rating ? <RatingMark rating={metric.rating} /> : null}
        {metric.display}
        {metric.rating ? (
          <span className="acn:sr-only">, {RATING_LABEL[metric.rating].toLowerCase()}</span>
        ) : null}
      </dd>
    </div>
  )
}

const pageName = (url: string) => {
  try {
    const { host, pathname } = new URL(url)
    return pathname === '/' ? host : `${host}${pathname}`
  } catch {
    return url
  }
}

/** Lighthouse scores and lab metrics of one PageSpeed Insights run. */
export function LabReport({ language, run }: { language: string; run: LabRun }) {
  return (
    <Section
      title="Lab test"
      meta={`Lighthouse on ${run.strategy}, ${relativeTime(run.fetchedAt, language)}`}
    >
      <ul
        aria-label={`Lighthouse scores for ${pageName(run.url)}`}
        className="acn:m-0 acn:grid acn:list-none acn:grid-cols-2 acn:gap-x-2 acn:gap-y-4 acn:p-0 acn:@min-[330px]:grid-cols-4"
      >
        {run.scores.map(({ key, ...score }) => (
          <ScoreGauge key={key} {...score} />
        ))}
      </ul>
      <dl className="acn:m-0 acn:grid acn:grid-cols-2 acn:gap-x-5 acn:text-sm acn:@min-[330px]:grid-cols-3">
        {run.metrics.map((metric) => (
          <LabMetricItem key={metric.key} metric={metric} />
        ))}
      </dl>
    </Section>
  )
}

function LabPending({ host, strategy }: { host: string; strategy: Strategy }) {
  return (
    <Section title="Lab test" meta={`Lighthouse on ${strategy}`}>
      <div
        aria-hidden
        className="acn:grid acn:grid-cols-2 acn:gap-x-2 acn:gap-y-4 acn:@min-[330px]:grid-cols-4"
      >
        {LIGHTHOUSE_CATEGORIES.map(({ key, label }) => (
          <div key={key} className="acn:flex acn:flex-col acn:items-center acn:gap-1.5">
            <span className="acn:size-14 acn:rounded-full acn:border-4 acn:border-muted acn:motion-safe:animate-pulse" />
            <span className="acn:text-xs acn:leading-tight acn:text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <p role="status" className="acn:m-0 acn:text-xs acn:text-muted-foreground">
        Testing {host} with Lighthouse. A test takes 10–40 seconds; the result is then kept for a
        day.
      </p>
    </Section>
  )
}

function FieldPending() {
  return (
    <Section title="Real users" meta="Chrome UX Report">
      <p role="status" className="acn:m-0 acn:text-sm acn:text-muted-foreground">
        Loading field data…
      </p>
    </Section>
  )
}

/** Chrome UX Report field data: the p75 table, or why there is none. */
export function FieldReportSection({ host, report }: { host: string; report: FieldReport | null }) {
  const meta =
    report && report.period.last
      ? `Chrome UX Report, ${deviceLabel(report.formFactor)}, 28 days to ${day.format(new Date(report.period.last))}`
      : 'Chrome UX Report'
  return (
    <Section title="Real users" meta={meta}>
      {!report ? (
        <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
          No field data for {host} yet: the Chrome UX Report only covers sites with a steady flow of
          Chrome visits. The lab test above doesn&apos;t need any.
        </p>
      ) : (
        <>
          {report.fallbackFrom ? (
            <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
              Too few visits from {deviceLabel(report.fallbackFrom)} alone, so these are all devices
              together.
            </p>
          ) : null}
          <table className="acn:w-full acn:border-collapse acn:text-sm">
            <caption className="acn:sr-only">Core Web Vitals, 75th percentile</caption>
            <thead className="acn:sr-only">
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">75th percentile</th>
                <th scope="col">Rating</th>
                <th scope="col">Page loads by rating</th>
                <th scope="col">Trend, 25 weeks</th>
              </tr>
            </thead>
            <tbody>
              {report.metrics.map((metric) => (
                <tr key={metric.key} className="acn:border-b acn:border-border acn:last:border-0">
                  <th scope="row" className="acn:py-2 acn:pr-3 acn:text-left acn:font-medium">
                    <abbr title={metric.label} className="acn:no-underline">
                      {metric.name}
                    </abbr>
                  </th>
                  <td className="acn:py-2 acn:pr-3 acn:tabular-nums">
                    {formatMetric(metric.p75, metric.unit)}
                  </td>
                  <td className="acn:py-2 acn:pr-3">
                    {metric.rating ? (
                      <span
                        className={cn(
                          'acn:inline-flex acn:rounded-sm acn:px-1.5 acn:py-0.5 acn:text-xs acn:font-medium acn:whitespace-nowrap',
                          RATING_STYLE[metric.rating],
                        )}
                      >
                        {RATING_LABEL[metric.rating]}
                      </span>
                    ) : (
                      <span className="acn:text-muted-foreground">No data</span>
                    )}
                  </td>
                  <td className="acn:hidden acn:py-2 acn:pr-3 acn:@min-[360px]:table-cell">
                    {metric.distribution ? (
                      <span
                        role="img"
                        aria-label={`Good ${percent(metric.distribution[0])}, needs improvement ${percent(metric.distribution[1])}, poor ${percent(metric.distribution[2])}`}
                        className="acn:flex acn:h-2 acn:w-24 acn:overflow-hidden acn:rounded-full"
                      >
                        <span
                          className="acn:bg-rating-good"
                          style={{ width: percent(metric.distribution[0]) }}
                        />
                        <span
                          className="acn:bg-rating-average"
                          style={{ width: percent(metric.distribution[1]) }}
                        />
                        <span
                          className="acn:bg-rating-poor"
                          style={{ width: percent(metric.distribution[2]) }}
                        />
                      </span>
                    ) : null}
                  </td>
                  <td className="acn:hidden acn:py-2 acn:@min-[440px]:table-cell">
                    {metric.trend.filter((value) => value !== null).length > 1 ? (
                      <Sparkline
                        values={metric.trend.filter((value): value is number => value !== null)}
                        className="acn:h-6 acn:w-20"
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Section>
  )
}

/** The whole widget from data, for the gallery. */
export function PageSpeedReportView({
  field,
  formFactor,
  lab,
  language,
  origin,
}: {
  field: FieldReport | null
  formFactor: FormFactor
  lab: LabRun
  language: string
  origin: string
}) {
  const host = new URL(origin).host
  return (
    <PageSpeedCard host={host} origin={origin} strategy={strategyFor(formFactor)}>
      <div className="acn:flex acn:flex-col acn:gap-6">
        <LabReport run={lab} language={language} />
        <FieldReportSection report={field} host={host} />
      </div>
    </PageSpeedCard>
  )
}

export default PageSpeedWidget
