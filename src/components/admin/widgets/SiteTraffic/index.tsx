import type { WidgetServerProps } from 'payload'
import { ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { hasCapability, isAdmin } from '@/access/permissions'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { Sparkline } from '@/components/admin/elements/Sparkline'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { adminURL } from '@/components/admin/utilities/collections'
import { siteTraffic, type TrafficReport } from '@/integrations/vercel'

export const TRAFFIC_PERIODS = ['7', '30', '90'] as const

const DOCS = 'https://vercel.com/docs/analytics/web-analytics-api'
const number = new Intl.NumberFormat('en')
const shortDate = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * Visitors, page views, top pages and referrers from Vercel Web Analytics (the Web Analytics API,
 * cached for ten minutes). Article pages link to their edit view. Needs the "Site traffic and page
 * speed" capability; shows a setup hint until VERCEL_TOKEN and VERCEL_PROJECT_ID are set.
 */
export async function SiteTrafficWidget({ req, user, widgetData }: WidgetServerProps) {
  const period = TRAFFIC_PERIODS.find((value) => value === String(widgetData?.period)) ?? '7'
  const days = Number(period)
  const title = 'Site traffic'
  const description = `Vercel Web Analytics, last ${days} days.`

  if (!hasCapability(user, 'viewAnalytics')) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice service="Vercel Web Analytics" state="forbidden" />
      </WidgetCard>
    )
  }

  const result = await siteTraffic(days)
  if (result.status !== 'ok') {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice
          service="Vercel Web Analytics"
          state={result.status}
          missing={result.status === 'not-configured' ? result.missing : undefined}
          message={result.status === 'error' ? result.message : undefined}
          isAdmin={isAdmin(user)}
          docsURL={DOCS}
        />
      </WidgetCard>
    )
  }

  const report = result.data
  // Article pages (/articles/<slug>) link to the article in the admin.
  const slugs = report.topPages
    .map((page) => /^\/articles\/([^/?#]+)\/?$/.exec(page.path)?.[1])
    .filter((slug): slug is string => Boolean(slug))
  const articles = slugs.length
    ? (
        await req.payload.find({
          collection: 'articles',
          where: { slug: { in: slugs } },
          depth: 0,
          limit: slugs.length,
          overrideAccess: false,
          req,
          select: { slug: true, title: true },
        })
      ).docs
    : []
  const articleFor = (path: string) =>
    articles.find((article) => path.replace(/\/$/, '') === `/articles/${article.slug}`)
  const siteURL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

  const links = Object.fromEntries(
    report.topPages.flatMap((page) => {
      const article = articleFor(page.path)
      return article
        ? [[page.path, { href: adminURL(req, 'articles', article.id), title: article.title }]]
        : []
    }),
  )
  return <TrafficReportView report={report} links={links} siteURL={siteURL} />
}

/**
 * The traffic report itself (no data fetching), so the component gallery can show it with sample
 * data. `links` maps page paths to their document in the admin.
 */
export function TrafficReportView({
  links,
  report,
  siteURL,
}: {
  links: Record<string, { href: string; title: string }>
  report: TrafficReport
  siteURL: string
}) {
  return (
    <WidgetCard
      title="Site traffic"
      description={`Vercel Web Analytics, ${shortDate.format(new Date(report.since))} – ${shortDate.format(new Date(report.until))}.`}
    >
      <div className="acn:flex acn:flex-col acn:gap-5">
        <div className="acn:flex acn:flex-wrap acn:items-end acn:gap-x-8 acn:gap-y-3">
          <dl className="acn:m-0 acn:flex acn:gap-8">
            <div>
              <dt className="acn:text-sm acn:text-muted-foreground">Visitors</dt>
              <dd className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight acn:tabular-nums">
                {number.format(report.totals.visitors)}
              </dd>
            </div>
            <div>
              <dt className="acn:text-sm acn:text-muted-foreground">Page views</dt>
              <dd className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight acn:tabular-nums">
                {number.format(report.totals.pageviews)}
              </dd>
            </div>
          </dl>
          <Sparkline
            values={report.daily.map((day) => day.pageviews)}
            className="acn:h-10 acn:w-40 acn:sm:w-48"
          />
        </div>

        <div className="acn:grid acn:gap-5 acn:sm:grid-cols-2">
          <section aria-labelledby="traffic-pages">
            <h3 id="traffic-pages" className="acn:m-0 acn:mb-2 acn:text-sm acn:font-semibold">
              Top pages
            </h3>
            {report.topPages.length === 0 ? (
              <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">No visits yet.</p>
            ) : (
              <ol className="acn:m-0 acn:list-none acn:space-y-1.5 acn:p-0 acn:text-sm">
                {report.topPages.map((page) => {
                  const article = links[page.path]
                  return (
                    <li
                      key={page.path}
                      className="acn:flex acn:items-center acn:justify-between acn:gap-3"
                    >
                      <span className="acn:flex acn:min-w-0 acn:items-center acn:gap-1.5">
                        {article ? (
                          <Link
                            href={article.href}
                            className="acn:truncate acn:text-foreground acn:underline-offset-4 acn:hover:underline"
                            title={page.path}
                          >
                            {article.title}
                          </Link>
                        ) : (
                          <span
                            className="acn:truncate acn:font-mono acn:text-xs"
                            title={page.path}
                          >
                            {page.path}
                          </span>
                        )}
                        {siteURL ? (
                          <a
                            href={`${siteURL}${page.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="acn:shrink-0 acn:text-muted-foreground acn:hover:text-foreground"
                          >
                            <ExternalLinkIcon aria-hidden className="acn:size-3.5" />
                            <span className="acn:sr-only">
                              Open {page.path} on the site (new tab)
                            </span>
                          </a>
                        ) : null}
                      </span>
                      <span className="acn:shrink-0 acn:text-muted-foreground acn:tabular-nums">
                        {number.format(page.pageviews)}
                        <span className="acn:sr-only"> page views</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
          <section aria-labelledby="traffic-referrers">
            <h3 id="traffic-referrers" className="acn:m-0 acn:mb-2 acn:text-sm acn:font-semibold">
              Top referrers
            </h3>
            {report.topReferrers.length === 0 ? (
              <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
                No referrers: visits came direct or from search engines that hide it.
              </p>
            ) : (
              <ol className="acn:m-0 acn:list-none acn:space-y-1.5 acn:p-0 acn:text-sm">
                {report.topReferrers.map((referrer) => (
                  <li
                    key={referrer.host}
                    className="acn:flex acn:items-center acn:justify-between acn:gap-3"
                  >
                    <span className="acn:truncate">{referrer.host}</span>
                    <span className="acn:shrink-0 acn:text-muted-foreground acn:tabular-nums">
                      {number.format(referrer.pageviews)}
                      <span className="acn:sr-only"> page views</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </WidgetCard>
  )
}

export default SiteTrafficWidget
