import type { ProjectsContent } from '@/app/(frontend)/lib/types'
import { ProjectsGrid } from './ProjectsGrid'

export type ProjectsSectionProps = {
  projects: ProjectsContent
}

export function ProjectsSection({ projects }: ProjectsSectionProps) {
  return (
    <section id="project" className="section-gray">
      <div className="container-fluid py-5">
        <div className="container">
          <ProjectsGrid
            heading={projects.heading}
            caseStudyLabel={projects.caseStudyLabel}
            filters={projects.filters}
            items={projects.items}
          />
        </div>
      </div>
    </section>
  )
}
