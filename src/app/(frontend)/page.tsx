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
import { buildPersonJsonLd } from '@/app/(frontend)/lib/seo'

// Composition only, in the order of vTarikhi/pages/index.js.
// The page reads cached content and never calls headers(), cookies(), or payload.auth(), so Next can
// prerender it as static (roadmap §3.3). Editors refresh it by saving in /admin (hooks.ts).
export default async function HomePage() {
  const content = await getCachedPortfolioContent()
  const { siteSettings } = content

  return (
    <>
      <SiteChrome
        navigation={content.navigation}
        footer={content.footer}
        footerLabels={siteSettings.footerLabels}
        customCode={content.customCode}
      >
        {content.header ? <Hero header={content.header} labels={siteSettings.hero} /> : null}
        <main id="main-content" data-bs-spy="scroll" data-bs-target=".navbar" data-bs-offset="51">
          <AboutSection about={content.about} ownerName={siteSettings.ownerName} />
          <ServicesSection services={content.services} labels={siteSettings.servicesSection} />
          <SkillsSection
            skills={content.skills}
            experiences={content.experiences}
            educations={content.educations}
            labels={siteSettings.skillsSection}
          />
          <CertificatesSection
            certificates={content.certificates}
            labels={siteSettings.certificatesSection}
          />
          <ProjectsSection projects={content.projects} />
          <ArticlesSection articles={content.articles} labels={siteSettings.articlesSection} />
        </main>
      </SiteChrome>
      <JsonLd data={buildPersonJsonLd(content.header, content.footer, siteSettings)} />
    </>
  )
}
