import type { Metadata } from 'next'
import { ProjectsArchive } from '@/app/(frontend)/components/studio/ProjectsArchive'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { siteUrl } from '@/app/(frontend)/lib/seo'

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Selected projects across interfaces, back-end systems, and content platforms.',
  alternates: { canonical: `${siteUrl()}/projects` },
  openGraph: {
    type: 'website',
    title: 'Projects',
    description: 'Explore the portfolio.',
    url: `${siteUrl()}/projects`,
  },
}

export default async function ProjectsPage() {
  const content = await getCachedPortfolioContent()
  return <ProjectsArchive content={content} />
}
