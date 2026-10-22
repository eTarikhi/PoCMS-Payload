import type { Metadata } from 'next'
import { BlogArchive } from '../../components/studio/BlogArchive'
import { getCachedPortfolioContent } from '../../lib/cache'
import { siteUrl, writingFeedTypes } from '../../lib/seo'

export const metadata: Metadata = {
  title: 'Blog',
  openGraph: {
    type: 'website',
    title: 'Blog',
    url: `${siteUrl()}/blog`,
    description: 'A journal of software, systems, and lessons from practice.',
  },
  description: 'A journal of software, systems, and lessons from practice.',
  alternates: { canonical: `${siteUrl()}/blog`, types: writingFeedTypes },
}

export default async function BlogPage() {
  return <BlogArchive content={await getCachedPortfolioContent()} />
}
