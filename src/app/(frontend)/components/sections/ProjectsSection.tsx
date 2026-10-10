import type { ProjectsContent } from '@/app/(frontend)/lib/types'
import { ProjectsGrid } from './ProjectsGrid'

// Section shell from vTarikhi/components/sections/projects.tsx. The title row and grid are in ProjectsGrid (D-13).

export type ProjectsSectionProps = {
  projects: ProjectsContent
}

export function ProjectsSection({ projects }: ProjectsSectionProps) {
  return (
    <section id="project" className="section-gray">
      <div className="container-fluid py-5">
        <div className="container">
          <ProjectsGrid filters={projects.filters} items={projects.items} />
        </div>
      </div>
    </section>
  )
}
