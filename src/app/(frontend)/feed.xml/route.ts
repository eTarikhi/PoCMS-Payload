import { getCachedPortfolioContent } from '../lib/cache'
import { buildWritingFeed } from '../lib/rss'
import { siteUrl } from '../lib/seo'

// Render each request from Payload's tag-aware cache, not an independently stale CDN response.
export const dynamic = 'force-dynamic'
export async function GET() {
  const content = await getCachedPortfolioContent()
  return new Response(
    buildWritingFeed(siteUrl(), content.header?.sureName || 'Portfolio', content.articles),
    {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}
