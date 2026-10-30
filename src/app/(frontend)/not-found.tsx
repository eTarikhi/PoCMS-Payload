import '@/app/(frontend)/styles/article.css'

import Link from 'next/link'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedSiteChrome } from '@/app/(frontend)/lib/cache'

export default async function FrontendNotFound() {
  const content = await getCachedSiteChrome()
  const { footerLabels } = content.siteSettings

  return (
    <SiteChrome
      navigation={content.navigation}
      footer={content.footer}
      footerLabels={footerLabels}
      customCode={content.customCode}
    >
      <main id="main-content" className="article-page article-not-found">
        <h1 className="article-title">Page not found</h1>
        <p className="article-excerpt">
          The page you are looking for does not exist or may have moved.
        </p>
        <Link href="/" className="article-cta">
          Back to home
        </Link>
      </main>
    </SiteChrome>
  )
}
