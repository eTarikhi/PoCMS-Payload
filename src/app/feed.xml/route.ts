import { getCachedFeedSourceDocs } from '@/app/(frontend)/lib/feed-cache'
import { buildRssFeedXml } from '@/app/(frontend)/lib/feeds'
import { DEFAULT_SITE_SETTINGS, mapSiteSettings } from '@/app/(frontend)/lib/mappers'

export async function GET(): Promise<Response> {
  try {
    const { articles, projects, siteSettings } = await getCachedFeedSourceDocs()
    const settings = mapSiteSettings(siteSettings)
    const xml = buildRssFeedXml({ articles, projects, settings })

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch {
    const xml = buildRssFeedXml({
      articles: [],
      projects: [],
      settings: DEFAULT_SITE_SETTINGS,
    })

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    })
  }
}
