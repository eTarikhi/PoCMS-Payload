import type { Metadata } from 'next'
import { WritingArchive } from '@/app/(frontend)/components/studio/WritingArchive'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { siteUrl } from '@/app/(frontend)/lib/seo'

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
