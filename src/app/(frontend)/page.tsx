import { Footer } from '@/components/portfolio/layout/Footer'
import { Hero } from '@/components/portfolio/layout/Hero'
import { Navigation } from '@/components/portfolio/layout/Navigation'
import { BackToTop } from '@/components/portfolio/layout/BackToTop'
import { BootstrapClient } from '@/components/portfolio/layout/BootstrapClient'
import { AboutSection } from '@/components/portfolio/sections/AboutSection'
import { ServicesSection } from '@/components/portfolio/sections/ServicesSection'
import { SkillsSection } from '@/components/portfolio/sections/SkillsSection'
import { CertificatesSection } from '@/components/portfolio/sections/CertificatesSection'
import { ProjectsSection } from '@/components/portfolio/sections/ProjectsSection'
import { ArticlesSection } from '@/components/portfolio/sections/ArticlesSection'
import { JsonLd } from '@/components/portfolio/seo/JsonLd'
import { getCachedPortfolioContent } from '@/lib/portfolio/cache'
import { buildPersonJsonLd } from '@/lib/portfolio/seo'

// Composition only, in the order of vTarikhi/pages/index.js.
// The page reads cached content and never calls headers(), cookies(), or payload.auth(), so Next can
// prerender it as static (roadmap §3.3). Editors refresh it by saving in /admin (hooks.ts).
export default async function HomePage() {
  const content = await getCachedPortfolioContent()

  return (
    <>
      <Navigation />
      {content.header ? <Hero header={content.header} /> : null}
      <main data-bs-spy="scroll" data-bs-target=".navbar" data-bs-offset="51">
        <AboutSection about={content.about} />
        <ServicesSection services={content.services} />
        <SkillsSection
          skills={content.skills}
          experiences={content.experiences}
          educations={content.educations}
        />
        <CertificatesSection certificates={content.certificates} />
        <ProjectsSection projects={content.projects} />
        <ArticlesSection articles={content.articles} />
      </main>
      {content.footer ? <Footer footer={content.footer} /> : null}
      <BackToTop />
      <BootstrapClient />
      <JsonLd data={buildPersonJsonLd(content.header, content.footer)} />
    </>
  )
}
