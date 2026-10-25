import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import type { Plugin } from 'payload'

import { contentAccess, hiddenWithout } from '@/access/roles'
import { articlePagePath } from '@/app/(frontend)/lib/article-page'
import { portfolioAfterChange, portfolioAfterDelete } from '@/app/(frontend)/lib/hooks'
import { extractLexicalText } from '@/app/(frontend)/lib/lexical'
import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import { projectPagePath } from '@/app/(frontend)/lib/project-page'
import { normalizeRedirectPath } from '@/app/(frontend)/lib/redirects-utils'
import { siteUrl } from '@/app/(frontend)/lib/seo'
import { slugify } from '@/app/(frontend)/lib/slug'

export const REDIRECTS_COLLECTION = 'redirects'

const truncateMetaDescription = (text: string, maxLength = 155): string => {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`
}

/**
 * Per-document SEO overrides (`meta.title`, `meta.description`, `meta.image`) and live Google SERP
 * preview for `articles` and `projects`.
 */
export const portfolioSeoPlugin = (): Plugin =>
  seoPlugin({
    collections: ['articles', 'projects'],
    uploadsCollection: 'media',
    generateTitle: async ({ doc, req }) => {
      const rawTitle = typeof doc?.title === 'string' ? doc.title.trim() : ''
      let siteName = DEFAULT_SITE_SETTINGS.siteName
      try {
        const settings = await req.payload.findGlobal({
          slug: 'site-settings',
          depth: 0,
          req,
        })
        if (typeof settings?.siteName === 'string' && settings.siteName.trim().length > 0) {
          siteName = settings.siteName.trim()
        }
      } catch {
        // Fall back to default site name when unsaved or in schema-only contexts.
      }
      return rawTitle ? `${rawTitle} | ${siteName}` : siteName
    },
    generateDescription: ({ doc }) => {
      const excerpt = typeof doc?.excerpt === 'string' ? doc.excerpt.trim() : ''
      if (excerpt) return truncateMetaDescription(excerpt)

      const lexicalBody = extractLexicalText(doc?.content)
      if (lexicalBody) return truncateMetaDescription(lexicalBody)

      const legacyDescription = typeof doc?.description === 'string' ? doc.description.trim() : ''
      if (legacyDescription) return truncateMetaDescription(legacyDescription)

      return DEFAULT_SITE_SETTINGS.metaDescription
    },
    generateImage: ({ doc }) => doc?.image ?? '',
    generateURL: ({ collectionSlug, doc }) => {
      const base = siteUrl()
      const explicitSlug = typeof doc?.slug === 'string' ? doc.slug.trim() : ''
      const derivedSlug =
        explicitSlug || (typeof doc?.title === 'string' ? slugify(doc.title) : '')

      if (collectionSlug === 'articles') {
        return derivedSlug ? `${base}${articlePagePath(derivedSlug)}` : `${base}/articles`
      }
      if (collectionSlug === 'projects') {
        return derivedSlug ? `${base}${projectPagePath(derivedSlug)}` : `${base}/projects`
      }
      return base
    },
  })

/**
 * CMS-managed `301` (Permanent) and `302` (Temporary) URL redirects to articles, projects, or
 * arbitrary custom URLs, governed by RBAC under the `Site settings` admin group.
 */
export const portfolioRedirectsPlugin = (): Plugin =>
  redirectsPlugin({
    collections: ['articles', 'projects'],
    redirectTypes: ['301', '302'],
    redirectTypeFieldOverride: {
      label: 'Status Code',
      defaultValue: '301',
      required: true,
      admin: {
        position: 'sidebar',
        description: '301 (Permanent) or 302 (Temporary) HTTP redirect.',
      },
    },
    overrides: {
      labels: {
        singular: 'Redirect',
        plural: 'Redirects',
      },
      access: contentAccess(REDIRECTS_COLLECTION),
      admin: {
        group: 'Site settings',
        hidden: hiddenWithout(REDIRECTS_COLLECTION),
        useAsTitle: 'from',
        defaultColumns: ['from', 'to', 'type', 'updatedAt'],
        description: '301 and 302 URL redirects to articles, projects, or custom URLs.',
      },
      hooks: {
        beforeValidate: [
          ({ data }) => {
            if (data && typeof data.from === 'string' && data.from.trim().length > 0) {
              return {
                ...data,
                from: normalizeRedirectPath(data.from),
              }
            }
            return data
          },
        ],
        afterChange: [portfolioAfterChange],
        afterDelete: [portfolioAfterDelete],
      },
    },
  })
