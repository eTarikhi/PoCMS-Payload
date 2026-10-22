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
        <header className="journal-page-heading">
          <p className="studio-eyebrow">The workshop / Selected projects</p>
          <h1>
            Built with purpose.
            <br />
            <em>Made to work.</em>
          </h1>
          <p className="studio-lead">
            Selected work across interfaces, back-end systems, and content platforms.
          </p>
        </header>
        <ProjectsIndex projects={content.projects} />
      </main>
    </StudioChrome>
  )
}
