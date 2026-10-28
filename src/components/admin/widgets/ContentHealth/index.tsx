import type { CollectionSlug, WidgetServerProps, Where } from 'payload'
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react'
import Link from 'next/link'
import { stringify } from 'qs-esm'
import React from 'react'

import { can } from '@/access/permissions'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { adminURL } from '@/components/admin/utilities/collections'
import { auditContentHealth } from '@/lib/contentHealth'

/** One check: the label to show when it passes, and the to-do text (with a link) when it does not. */
type Check = { done: string; todo: string; href: string; ok: boolean }

const empty = (field: string): Where => ({
  or: [{ [field]: { exists: false } }, { [field]: { equals: '' } }],
})

/** Content, SEO, asset, draft-backlog, and redirect-integrity health checks on the Admin Dashboard. */
export async function ContentHealthWidget({ req }: WidgetServerProps) {
  const count = (collection: CollectionSlug, where?: Where) =>
    req.payload.count({ collection, req, overrideAccess: false, where }).then((r) => r.totalDocs)
  const listWith = (collection: CollectionSlug, where: Where) =>
    `${adminURL(req, collection)}${stringify({ where }, { addQueryPrefix: true })}`

  const noArticleImage: Where = { and: [{ image: { exists: false } }, empty('imageUrl')] }
  const noProjectImage: Where = { and: [{ image: { exists: false } }, empty('src')] }
  const missingSeoWhere: Where = { and: [empty('meta.description'), empty('excerpt')] }
  const draftWhere: Where = { _status: { equals: 'draft' } }

  const [header, about, siteSettings, navigation, footer, health] = await Promise.all([
    count('header'),
    count('about'),
    req.payload.findGlobal({ slug: 'site-settings', req, overrideAccess: false, depth: 0 }),
    req.payload.findGlobal({ slug: 'navigation', req, overrideAccess: false, depth: 0 }),
    req.payload.findGlobal({ slug: 'footer', req, overrideAccess: false, depth: 0 }),
    auditContentHealth(req.payload, req),
  ])

  const hasSiteIdentity =
    Boolean(siteSettings?.siteTitle?.trim()) && Boolean(siteSettings?.ownerName?.trim())
  const navLinks = (navigation?.items ?? []).filter((item) => item.enabled !== false).length
  const socialLinks = footer?.socialLinks?.length ?? 0

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const missingSeoTotal =
    health.missingArticleSeoDescriptions + health.missingProjectSeoDescriptions
  const redirectIssuesTotal = health.redirectChainCount + health.redirectLoopCount

  const checks: Check[] = [
    {
      ok: header > 0,
      done: 'Hero section (Header) is set up',
      todo: 'Set up the hero section (Header)',
      href: adminURL(req, 'header'),
    },
    {
      ok: about > 0,
      done: 'About section is set up',
      todo: 'Set up the About section',
      href: adminURL(req, 'about'),
    },
    {
      ok: hasSiteIdentity,
      done: 'Site settings (title & owner) are configured',
      todo: 'Configure site title and owner in Site settings',
      href: `${req.payload.config.routes.admin}/globals/site-settings`,
    },
    {
      ok: navLinks > 0,
      done: 'Navigation has menu links',
      todo: 'Add visible menu links to Navigation',
      href: `${req.payload.config.routes.admin}/globals/navigation`,
    },
    {
      ok: health.missingArticleImages === 0,
      done: 'Every article has a cover image',
      todo: `${plural(health.missingArticleImages, 'article has', 'articles have')} no cover image`,
      href: listWith('articles', noArticleImage),
    },
    {
      ok: health.missingProjectImages === 0,
      done: 'Every project has a cover image',
      todo: `${plural(health.missingProjectImages, 'project has', 'projects have')} no cover image`,
      href: listWith('projects', noProjectImage),
    },
    {
      ok: missingSeoTotal === 0,
      done: 'All articles & projects have SEO descriptions',
      todo: `${plural(missingSeoTotal, 'item is', 'items are')} missing an SEO description / excerpt`,
      href:
        health.missingArticleSeoDescriptions > 0
          ? listWith('articles', missingSeoWhere)
          : listWith('projects', missingSeoWhere),
    },
    {
      ok: health.draftBacklogCount === 0,
      done: 'No unpublished drafts waiting in backlog',
      todo: `${plural(health.draftBacklogCount, 'unpublished draft', 'unpublished drafts')} (${health.draftArticlesCount} articles, ${health.draftProjectsCount} projects)`,
      href:
        health.draftArticlesCount > 0
          ? listWith('articles', draftWhere)
          : listWith('projects', draftWhere),
    },
  ]

  if (can(req.user, 'media', 'read')) {
    checks.push({
      ok: health.orphanedMediaCount === 0,
      done: 'No orphaned media uploads detected',
      todo: `${plural(health.orphanedMediaCount, 'media upload is', 'media uploads are')} unreferenced`,
      href:
        health.orphanedMediaIds.length > 0
          ? listWith('media', { id: { in: health.orphanedMediaIds.slice(0, 50) } })
          : adminURL(req, 'media'),
    })
  }

  if (can(req.user, 'redirects', 'read')) {
    checks.push({
      ok: redirectIssuesTotal === 0,
      done: 'Redirects have no chains or loops',
      todo: `${plural(redirectIssuesTotal, 'redirect has', 'redirects have')} chains (${health.redirectChainCount}) or loops (${health.redirectLoopCount})`,
      href:
        health.redirectProblematicIds.length > 0
          ? listWith('redirects', { id: { in: health.redirectProblematicIds.slice(0, 50) } })
          : adminURL(req, 'redirects'),
    })
  }

  checks.push({
    ok: socialLinks > 0,
    done: 'Footer has social links',
    todo: 'Add social links to the footer',
    href: `${req.payload.config.routes.admin}/globals/footer`,
  })

  const open = checks.filter((c) => !c.ok).length

  return (
    <WidgetCard
      title="Content & SEO health"
      description={
        open === 0
          ? 'All content, SEO, media, and redirect checks pass.'
          : `${open} of ${checks.length} checks need attention.`
      }
    >
      <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:gap-2 acn:p-0">
        {checks.map((check) => {
          const Icon = check.ok ? CircleCheckIcon : CircleAlertIcon
          return (
            <li key={check.done} className="acn:flex acn:items-start acn:gap-2 acn:text-sm">
              <Icon
                aria-hidden
                className={`acn:mt-0.5 acn:size-4 acn:shrink-0 ${check.ok ? 'acn:text-success' : 'acn:text-warning'}`}
              />
              {check.ok ? (
                <span className="acn:text-muted-foreground">{check.done}</span>
              ) : (
                <Link
                  href={check.href}
                  className="acn:text-foreground acn:underline-offset-2 acn:hover:underline"
                >
                  {check.todo}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </WidgetCard>
  )
}

export default ContentHealthWidget
