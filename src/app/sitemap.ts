import type { MetadataRoute } from 'next'

import { getCachedFeedSourceDocs } from '@/app/(frontend)/lib/feed-cache'
import { buildSitemapEntries } from '@/app/(frontend)/lib/feeds'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const { articles, projects } = await getCachedFeedSourceDocs()
    return buildSitemapEntries({ articles, projects })
  } catch {
    return buildSitemapEntries({ articles: [], projects: [] })
  }
}
