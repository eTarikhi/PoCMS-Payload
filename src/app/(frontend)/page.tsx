import { Footer } from '@/app/(frontend)/components/portfolio/layout/Footer'
import { Hero } from '@/app/(frontend)/components/portfolio/layout/Hero'
import { Navigation } from '@/app/(frontend)/components/portfolio/layout/Navigation'
import { BackToTop } from '@/app/(frontend)/components/portfolio/layout/BackToTop'
import { BootstrapClient } from '@/app/(frontend)/components/portfolio/layout/BootstrapClient'
import { AboutSection } from '@/app/(frontend)/components/portfolio/sections/AboutSection'
import { ServicesSection } from '@/app/(frontend)/components/portfolio/sections/ServicesSection'
import { SkillsSection } from '@/app/(frontend)/components/portfolio/sections/SkillsSection'
import { CertificatesSection } from '@/app/(frontend)/components/portfolio/sections/CertificatesSection'
import { ProjectsSection } from '@/app/(frontend)/components/portfolio/sections/ProjectsSection'
import { ArticlesSection } from '@/app/(frontend)/components/portfolio/sections/ArticlesSection'
import { JsonLd } from '@/app/(frontend)/components/portfolio/seo/JsonLd'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/portfolio/cache'
import { buildPersonJsonLd } from '@/app/(frontend)/lib/portfolio/seo'

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
