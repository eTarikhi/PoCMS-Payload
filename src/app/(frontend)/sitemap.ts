import type { MetadataRoute } from 'next'

import { getCachedSitemapArticles } from './lib/cache'
import { buildSitemap } from './lib/sitemap-entries'

/**
 * `/sitemap.xml` (Next's metadata route).
 *
 * The article list is cached under the `portfolio` tag, so saving content in the admin refreshes it
 * together with the pages. `buildSitemap` holds the rules (home page plus every article that has a
 * page); this file only supplies the data.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(await getCachedSitemapArticles())
}
