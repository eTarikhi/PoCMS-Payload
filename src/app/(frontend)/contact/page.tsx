import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'

import { CmsFormSection } from '@/app/(frontend)/components/contact/CmsFormSection'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedSiteChrome } from '@/app/(frontend)/lib/cache'
import { getCachedPublicForms } from '@/app/(frontend)/lib/forms-cache'
import { buildContactPageJsonLd, buildContactPageMetadata } from '@/app/(frontend)/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const { siteSettings } = await getCachedSiteChrome()
  return buildContactPageMetadata(siteSettings)
}

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>

const pickFirst = (val: string | string[] | undefined): string | undefined =>
  Array.isArray(val) ? val[0] : val

export default async function ContactPage(props?: { searchParams?: SearchParamsInput }) {
  const [chrome, forms, resolvedParams] = await Promise.all([
    getCachedSiteChrome(),
    getCachedPublicForms(),
    props?.searchParams
      ? props.searchParams
      : Promise.resolve({} as Record<string, string | string[] | undefined>),
  ])

  const { siteSettings, headerStudio } = chrome
  const requestedFormSlug = pickFirst(resolvedParams.form)

  return (
    <>
      <SiteChrome
        navigation={chrome.navigation}
        footer={chrome.footer}
        footerLabels={siteSettings.footerLabels}
        customCode={chrome.customCode}
      >
        <main id="main-content" className="article-page p-0">
          <CmsFormSection
            forms={forms}
            initialFormSlug={requestedFormSlug}
            ownerName={siteSettings.ownerName}
            footer={chrome.footer}
            backgroundPreset={headerStudio.articlesArchive.backgroundPreset}
            accentTone={headerStudio.articlesArchive.accentTone}
          />
        </main>
      </SiteChrome>
      <JsonLd data={buildContactPageJsonLd(siteSettings)} />
    </>
  )
}
