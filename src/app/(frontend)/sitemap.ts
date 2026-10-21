import type { MetadataRoute } from 'next'
import { getCachedArticleSlugs } from './lib/articles'
import { publicSitemapEntries } from './lib/discovery'
import { siteUrl } from './lib/seo'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Database failures propagate rather than silently publishing an incomplete sitemap.
  return publicSitemapEntries(siteUrl(), await getCachedArticleSlugs())
}
