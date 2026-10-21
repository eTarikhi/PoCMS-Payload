import { StudioHome } from './components/studio/StudioHome'
import { JsonLd } from './components/seo/JsonLd'
import { getCachedPortfolioContent } from './lib/cache'
import { buildPersonJsonLd } from './lib/seo'

export default async function HomePage() {
  const content = await getCachedPortfolioContent()
  return (
    <>
      <StudioHome content={content} />
      <JsonLd data={buildPersonJsonLd(content.header, content.footer)} />
    </>
  )
}
