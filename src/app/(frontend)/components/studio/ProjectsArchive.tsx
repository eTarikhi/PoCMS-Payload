import type { PortfolioContent } from '../../lib/types'
import { StudioChrome } from './StudioChrome'
import { ProjectsIndex } from './ProjectsIndex'

export function ProjectsArchive({ content }: { content: PortfolioContent }) {
  return (
    <StudioChrome active="work" footer={content.footer} name={content.header?.sureName}>
      <main tabIndex={-1} id="main-content" className="studio-container studio-writing-page">
        <p className="studio-eyebrow">The portfolio / Work</p>
        <h1>
          Built for
          <br />
          the real world<span className="studio-accent">.</span>
        </h1>
        <p className="studio-lead">
          Explore projects across interfaces, back-end systems, and content platforms.
        </p>
        <ProjectsIndex projects={content.projects} />
      </main>
    </StudioChrome>
  )
}
