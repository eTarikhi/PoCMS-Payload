import type { MetadataRoute } from 'next'

import { getCachedSiteChrome } from '@/app/(frontend)/lib/cache'
import { buildRobotsRules } from '@/app/(frontend)/lib/feeds'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const chrome = await getCachedSiteChrome().catch(() => null)
  return buildRobotsRules(undefined, {
    allowIndexing: chrome?.siteSettings.allowIndexing ?? true,
  })
}
