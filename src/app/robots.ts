import type { MetadataRoute } from 'next'

import { buildRobots } from './(frontend)/lib/sitemap-entries'

/**
 * `/robots.txt`. Next's file convention only recognises this file at the app root (route groups are
 * not matched for `robots`), so it lives here rather than beside `sitemap.ts`.
 *
 * Crawl the site, skip the admin, the API and the draft preview, and point at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return buildRobots()
}
