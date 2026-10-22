import type { PortfolioContent } from '../../lib/types'
import { StudioChrome } from './StudioChrome'
import { WritingIndex } from './WritingIndex'

/** Shared composition keeps the standalone preview faithful to the production archive. */
export function WritingArchive({ content }: { content: PortfolioContent }) {
  return (
    <StudioChrome
      active="writing"
      footer={content.footer}
      name={content.header?.sureName}
      profile={content.header}
    >
      <main tabIndex={-1} id="main-content" className="studio-container studio-writing-page">
        <header className="journal-page-heading">
          <p className="studio-eyebrow">The library / Collected writing</p>
          <h1>
            Notes, ideas <em>& discoveries.</em>
          </h1>
          <p className="studio-lead">
            Explore the archive. Find a topic, follow an idea, discover something new.
          </p>
        </header>
        <WritingIndex articles={content.articles} />
      </main>
    </StudioChrome>
  )
}
