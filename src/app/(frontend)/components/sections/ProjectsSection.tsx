import type { ProjectsContent } from '@/app/(frontend)/lib/types'
import type { Locale } from '@/i18n/locales'

import { ProjectsGrid } from './ProjectsGrid'

export type ProjectsSectionProps = {
  locale: Locale
  projects: ProjectsContent
}

export function ProjectsSection({ locale, projects }: ProjectsSectionProps) {
  return (
    <section id="project" className="section-gray">
      <div className="container-fluid py-5">
        <div className="container">
          <ProjectsGrid filters={projects.filters} items={projects.items} locale={locale} />
        </div>
      </div>
    </section>
  )
}
