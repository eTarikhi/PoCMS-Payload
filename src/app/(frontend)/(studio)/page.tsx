import { PortfolioHome } from '@/app/(frontend)/components/layout/PortfolioHome'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { buildPersonJsonLd } from '@/app/(frontend)/lib/seo'

export default async function HomePage() {
  const content = await getCachedPortfolioContent()
  return (
    <>
      <PortfolioHome content={content} />
      <JsonLd data={buildPersonJsonLd(content.header, content.footer)} />
    </>
  )
}
