import type { PortfolioContent } from '../../lib/types'
import { StudioChrome } from './StudioChrome'
import { WritingIndex } from './WritingIndex'

/** Shared composition keeps the standalone preview faithful to the production archive. */
export function WritingArchive({ content }: { content: PortfolioContent }) {
  return (
    <StudioChrome active="writing" footer={content.footer} name={content.header?.sureName}>
      <main tabIndex={-1} id="main-content" className="studio-container studio-writing-page">
        <p className="studio-eyebrow">The journal / Writing</p>
        <h1>
          Notes from
          <br />
          the workbench<span className="studio-accent">.</span>
        </h1>
        <p className="studio-lead">Ideas, discoveries, and lessons from building for the web.</p>
        <WritingIndex articles={content.articles} />
      </main>
    </StudioChrome>
  )
}
