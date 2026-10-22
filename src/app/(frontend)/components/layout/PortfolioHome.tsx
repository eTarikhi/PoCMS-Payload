import { Hero } from '@/app/(frontend)/components/layout/Hero'
import { PortfolioChrome } from '@/app/(frontend)/components/layout/PortfolioChrome'
import { AboutSection } from '@/app/(frontend)/components/sections/AboutSection'
import { ServicesSection } from '@/app/(frontend)/components/sections/ServicesSection'
import { SkillsSection } from '@/app/(frontend)/components/sections/SkillsSection'
import { CertificatesSection } from '@/app/(frontend)/components/sections/CertificatesSection'
import { ProjectsSection } from '@/app/(frontend)/components/sections/ProjectsSection'
import { ArticlesSection } from '@/app/(frontend)/components/sections/ArticlesSection'

import type { PortfolioContent } from '../../lib/types'

export function PortfolioHome({ content }: { content: PortfolioContent }) {
  return (
    <>
      <PortfolioChrome footer={content.footer}>
        {content.header ? <Hero header={content.header} /> : null}
        <main
          tabIndex={-1}
          id="main-content"
          data-bs-spy="scroll"
          data-bs-target=".navbar"
          data-bs-offset="51"
        >
          {!content.header ? <h1 className="visually-hidden">Portfolio</h1> : null}
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
      </PortfolioChrome>
    </>
  )
}
