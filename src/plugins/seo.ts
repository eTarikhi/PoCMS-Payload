import { seoPlugin } from '@payloadcms/plugin-seo'
import type { Plugin } from 'payload'

import { articlePagePath } from '@/app/(frontend)/lib/article-page'
import { siteUrl } from '@/app/(frontend)/lib/seo'

/**
 * Per-document SEO metadata (Payload's SEO plugin).
 *
 * Articles and the Site settings global get a `meta` group with a title, a description and an image,
 * plus a search-result preview and character counters in the admin. The *Auto-generate* buttons in
 * that group call the functions below, which return the values the public site would use with no
 * override: the article title, the excerpt and the cover image. So the plugin is an escape hatch,
 * not a required step — an article with an empty `meta` renders exactly as it did before.
 *
 * - **Articles** use `meta.title` / `meta.description` / `meta.image` in
 *   `buildArticleMetadata` (`src/app/(frontend)/lib/seo.ts`). That module also keeps the fallbacks.
 * - **Site settings** (`meta`) is the site-wide default: the root layout's `generateMetadata`
 *   merges it over the constants in `seo.ts`, so the site title and description are editable
 *   without a deploy.
 *
 * `tabbedUI` is deliberately off. With it on, the plugin moves every existing field into a new
 * "Content" tab, which would pull the sidebar fields (slug, category, publish date) into the main
 * column of the article form. Without it, the `meta` group is appended below the body.
 *
 * `uploadsCollection: 'media'` gives the group an upload field with a preview; Media already has
 * the `og` size the page metadata uses.
 */

/** The name the site signs its pages with. Kept short so generated titles fit a search result. */
export const SITE_NAME = 'Amir v.Tarikhi'

type ArticleDoc = {
  title?: string | null
  excerpt?: string | null
  image?: number | { id: number } | null
  slug?: string | null
}

type SiteSettingsDoc = {
  siteName?: string | null
}

/** The upload id behind a relationship value: a number, a document, or nothing. */
export const seoImageId = (image: ArticleDoc['image']): number | null => {
  if (!image) return null
  return typeof image === 'object' ? image.id : image
}

/** Values the SEO group's *Auto-generate* buttons fill in, also used by the seed and the tests. */
export const seoGenerate = {
  title: ({ doc }: { doc: Record<string, unknown> }) => {
    const article = doc as ArticleDoc
    const title = article.title?.trim()
    return title ? `${title} | ${SITE_NAME}` : SITE_NAME
  },
  description: ({ doc }: { doc: Record<string, unknown> }) => {
    const article = doc as ArticleDoc
    return article.excerpt?.trim() ?? ''
  },
  // The plugin's GenerateImage type has no `null`: an article without a cover keeps the field empty
  // by returning an empty string, which the image field treats as "no value".
  image: ({ doc }: { doc: Record<string, unknown> }) => {
    const article = doc as ArticleDoc
    // No cover: an empty value clears the field (the plugin's type has no `null`).
    return seoImageId(article.image) ?? ''
  },
  url: ({ doc }: { doc: Record<string, unknown> }) => {
    const article = doc as ArticleDoc
    return article.slug ? `${siteUrl()}${articlePagePath(article.slug)}` : siteUrl()
  },
}

export const seo: Plugin = seoPlugin({
  collections: ['articles'],
  globals: ['site-settings'],
  uploadsCollection: 'media',
  tabbedUI: false,
  generateTitle: seoGenerate.title,
  generateDescription: seoGenerate.description,
  generateImage: seoGenerate.image,
  generateURL: seoGenerate.url,
})

/** The site-wide defaults for the Site settings global, filled by the seed. */
export const siteSeoDefaults = (doc: SiteSettingsDoc = {}) => ({
  title: `${doc.siteName?.trim() || SITE_NAME} Live Resume | Full-Stack Senior Web Developer`,
  description:
    'Senior PHP, JavaScript & MySQL, Mid. React & Next.js, Jr. Node.js & Laravel, E-Commerce CMS, WordPress, WooCommerce & Shopify Developer ..',
})
