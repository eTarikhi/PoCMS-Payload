import type { Metadata } from 'next'

import { Hero } from '@/app/(frontend)/components/layout/Hero'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { AboutSection } from '@/app/(frontend)/components/sections/AboutSection'
import { ServicesSection } from '@/app/(frontend)/components/sections/ServicesSection'
import { SkillsSection } from '@/app/(frontend)/components/sections/SkillsSection'
import { CertificatesSection } from '@/app/(frontend)/components/sections/CertificatesSection'
import { ProjectsSection } from '@/app/(frontend)/components/sections/ProjectsSection'
import { ArticlesSection } from '@/app/(frontend)/components/sections/ArticlesSection'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildPersonJsonLd, homeMetadata } from '@/app/(frontend)/lib/seo'
import { DEFAULT_LOCALE } from '@/i18n/locales'

export const generateMetadata = (): Metadata => homeMetadata(DEFAULT_LOCALE)

export default async function HomePage() {
  const locale = DEFAULT_LOCALE
  const content = await getCachedPortfolioContent(locale)

  return (
    <>
      <SiteChrome currentPath="/" footer={content.footer} locale={locale}>
        {content.header ? <Hero header={content.header} locale={locale} /> : null}
        <main id="main-content" data-bs-spy="scroll" data-bs-target=".navbar" data-bs-offset="51">
          <AboutSection about={content.about} locale={locale} />
          <ServicesSection services={content.services} locale={locale} />
          <SkillsSection
            skills={content.skills}
            experiences={content.experiences}
            educations={content.educations}
            locale={locale}
          />
          <CertificatesSection certificates={content.certificates} locale={locale} />
          <ProjectsSection projects={content.projects} locale={locale} />
          <ArticlesSection articles={content.articles} locale={locale} />
        </main>
      </SiteChrome>
      <JsonLd data={buildPersonJsonLd(content.header, content.footer, locale)} />
    </>
  )
}
