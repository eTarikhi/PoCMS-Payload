import type { CollectionSlug, WidgetServerProps, Where } from 'payload'
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react'
import Link from 'next/link'
import { stringify } from 'qs-esm'
import React from 'react'

import { adminURL } from './lib'
import { WidgetCard } from './WidgetCard'

/** One check: the label to show when it passes, and the to-do text (with a link) when it does not. */
type Check = { done: string; todo: string; href: string; ok: boolean }

const empty = (field: string): Where => ({
  or: [{ [field]: { exists: false } }, { [field]: { equals: '' } }],
})

/** Content gaps that show up on the public site, each linking to the documents that need work. */
export async function ContentHealthWidget({ req }: WidgetServerProps) {
  const count = (collection: CollectionSlug, where?: Where) =>
    req.payload.count({ collection, req, overrideAccess: false, where }).then((r) => r.totalDocs)
  const listWith = (collection: CollectionSlug, where: Where) =>
    `${adminURL(req, collection)}${stringify({ where }, { addQueryPrefix: true })}`

  const noArticleImage: Where = { and: [{ image: { exists: false } }, empty('imageUrl')] }
  const noProjectImage: Where = { and: [{ image: { exists: false } }, empty('src')] }
  const noDescription: Where = empty('description')

  const [header, about, articlesNoImage, projectsNoImage, articlesNoDescription, footer] =
    await Promise.all([
      count('header'),
      count('about'),
      count('articles', noArticleImage),
      count('projects', noProjectImage),
      count('articles', noDescription),
      req.payload.findGlobal({ slug: 'footer', req, overrideAccess: false, depth: 0 }),
    ])
  const socialLinks = footer?.socialLinks?.length ?? 0

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
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
      ok: articlesNoImage === 0,
      done: 'Every article has an image',
      todo: `${plural(articlesNoImage, 'article has', 'articles have')} no image`,
      href: listWith('articles', noArticleImage),
    },
    {
      ok: articlesNoDescription === 0,
      done: 'Every article has a meta description',
      todo: `${plural(articlesNoDescription, 'article has', 'articles have')} no meta description`,
      href: listWith('articles', noDescription),
    },
    {
      ok: projectsNoImage === 0,
      done: 'Every project has an image',
      todo: `${plural(projectsNoImage, 'project has', 'projects have')} no image`,
      href: listWith('projects', noProjectImage),
    },
    {
      ok: socialLinks > 0,
      done: 'Footer has social links',
      todo: 'Add social links to the footer',
      href: `${req.payload.config.routes.admin}/globals/footer`,
    },
  ]
  const open = checks.filter((c) => !c.ok).length

  return (
    <WidgetCard
      title="Needs attention"
      description={
        open === 0
          ? 'Everything the site needs is in place.'
          : `${open} of ${checks.length} checks need work.`
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
