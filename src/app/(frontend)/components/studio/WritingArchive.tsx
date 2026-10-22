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
        <p className="studio-eyebrow">Articles & insights</p>
        <h1>Writing</h1>
        <p className="studio-lead">Technical notes, discoveries, and lessons from practice.</p>
        <WritingIndex articles={content.articles} />
      </main>
    </StudioChrome>
  )
}
