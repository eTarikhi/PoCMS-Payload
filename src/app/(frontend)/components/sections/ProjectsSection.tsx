import Link from 'next/link'
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
          <div className="text-end mt-4">
            <Link className="btn btn-primary py-3 px-4" href="/projects">
              Explore all projects ↗
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
