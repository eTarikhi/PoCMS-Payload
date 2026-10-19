import type { WidgetServerProps } from 'payload'
import { ExternalLinkIcon } from 'lucide-react'
import React from 'react'

import { hasCapability, isAdmin } from '@/access/permissions'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { Sparkline } from '@/components/admin/elements/Sparkline'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { cn } from '@/components/admin/utilities/cn'
import { type FieldReport, type FormFactor, fieldData, type Rating } from '@/integrations/google'

export const FORM_FACTORS = [
  { label: 'Phones', value: 'PHONE' },
  { label: 'Desktops', value: 'DESKTOP' },
  { label: 'All devices', value: 'ALL' },
] as const satisfies readonly { label: string; value: FormFactor }[]

const DOCS = 'https://developer.chrome.com/docs/crux/api#APIKey'

const RATING_LABEL: Record<Rating, string> = {
  good: 'Good',
  average: 'Needs improvement',
  poor: 'Poor',
}
const RATING_STYLE: Record<Rating, string> = {
  good: 'acn:bg-rating-good/10 acn:text-rating-good',
  average: 'acn:bg-rating-average/10 acn:text-rating-average',
  poor: 'acn:bg-rating-poor/10 acn:text-rating-poor',
}

export const formatMetric = (value: number | null, unit: string) => {
  if (value === null) return '–'
  if (unit !== 'ms') return value.toFixed(2)
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
}

const percent = (value: number) => `${Math.round(value * 100)}%`
const day = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function siteOrigin(): string | null {
  try {
    return process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
      : null
  } catch {
    return null
  }
}

/**
 * Core Web Vitals of real Chrome users from the Chrome UX Report (CrUX API): the 28-day p75 of each
 * metric with its rating, the share of good / average / poor page loads and the trend over the
 * last 25 weeks. Needs the "Site traffic and page speed" capability and GOOGLE_API_KEY.
 */
export async function PageSpeedWidget({ user, widgetData }: WidgetServerProps) {
  const formFactor =
    FORM_FACTORS.find((option) => option.value === widgetData?.formFactor)?.value ?? 'PHONE'
  const title = 'Page speed'
  const description = 'Core Web Vitals of real Chrome users (CrUX).'

  if (!hasCapability(user, 'viewAnalytics')) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice service="Chrome UX Report" state="forbidden" />
      </WidgetCard>
    )
  }
  const origin = siteOrigin()
  if (!origin) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice
          service="Page speed"
          state="not-configured"
          missing={['NEXT_PUBLIC_SITE_URL']}
          isAdmin={isAdmin(user)}
        />
      </WidgetCard>
    )
  }
  const result = await fieldData(origin, formFactor)
  if (result.status !== 'ok') {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice
          service="Chrome UX Report"
          state={result.status}
          missing={result.status === 'not-configured' ? result.missing : undefined}
          message={result.status === 'error' ? result.message : undefined}
          isAdmin={isAdmin(user)}
          docsURL={DOCS}
        />
      </WidgetCard>
    )
  }
  return <FieldReportView report={result.data} origin={origin} formFactor={formFactor} />
}

/** The report itself (no data fetching), also shown with sample data in the gallery. */
export function FieldReportView({
  formFactor,
  origin,
  report,
}: {
  formFactor: FormFactor
  origin: string
  report: FieldReport | null
}) {
  const device = FORM_FACTORS.find((option) => option.value === formFactor)?.label.toLowerCase()
  const psi = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(origin)}`
  return (
    <WidgetCard
      title="Page speed"
      description={
        report
          ? `Real Chrome users on ${device}, 28 days to ${day.format(new Date(report.period.last))} (p75).`
          : 'Core Web Vitals of real Chrome users (CrUX).'
      }
      action={
        <a
          href={psi}
          target="_blank"
          rel="noopener noreferrer"
          className="acn:inline-flex acn:items-center acn:gap-1 acn:text-xs acn:text-muted-foreground acn:hover:text-foreground"
        >
          PageSpeed Insights <ExternalLinkIcon aria-hidden className="acn:size-3.5" />
          <span className="acn:sr-only"> (opens in a new tab)</span>
        </a>
      }
    >
      {!report ? (
        <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
          No field data for {new URL(origin).host} yet: the Chrome UX Report needs a steady flow of
          Chrome visits. The site is measured once it has enough traffic.
        </p>
      ) : (
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
                <td className="acn:hidden acn:py-2 acn:pr-3 acn:sm:table-cell">
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
                <td className="acn:hidden acn:py-2 acn:md:table-cell">
                  {metric.trend.filter((value) => value !== null).length > 1 ? (
                    <Sparkline
                      values={metric.trend.filter((value): value is number => value !== null)}
                      className="acn:h-6 acn:w-20 acn:sm:w-20"
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WidgetCard>
  )
}

export default PageSpeedWidget
