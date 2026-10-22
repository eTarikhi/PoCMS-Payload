import type { PortfolioContent } from '../../lib/types'
import { StudioChrome } from './StudioChrome'
import { ProjectsIndex } from './ProjectsIndex'

export function ProjectsArchive({ content }: { content: PortfolioContent }) {
  return (
    <StudioChrome
      active="work"
      footer={content.footer}
      name={content.header?.sureName}
      profile={content.header}
    >
      <main tabIndex={-1} id="main-content" className="studio-container studio-writing-page">
        <p className="studio-eyebrow">Portfolio</p>
        <h1>Project archive</h1>
        <p className="studio-lead">
          Selected work across interfaces, back-end systems, and content platforms.
        </p>
        <ProjectsIndex projects={content.projects} />
      </main>
    </StudioChrome>
  )
}
