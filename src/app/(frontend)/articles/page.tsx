import type { Metadata } from 'next'
import { WritingArchive } from '../components/studio/WritingArchive'
import { getCachedPortfolioContent } from '../lib/cache'
import { siteUrl } from '../lib/seo'

export const metadata: Metadata = {
  title: 'Writing',
  alternates: { canonical: `${siteUrl()}/articles` },
  openGraph: {
    type: 'website',
    title: 'Writing',
    description: 'Field notes on interfaces, systems, and software development.',
    url: `${siteUrl()}/articles`,
  },
  description: 'Field notes on interfaces, systems, and software development.',
}

export default async function WritingPage() {
  const content = await getCachedPortfolioContent()
  return <WritingArchive content={content} />
}
