import { StudioHome } from '@/app/(frontend)/components/studio/StudioHome'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildPersonJsonLd } from '@/app/(frontend)/lib/seo'

export default async function HomePage() {
  const content = await getCachedPortfolioContent()
  return (
    <>
      <StudioHome content={content} />
      <JsonLd data={buildPersonJsonLd(content.header, content.footer)} />
    </>
  )
}
