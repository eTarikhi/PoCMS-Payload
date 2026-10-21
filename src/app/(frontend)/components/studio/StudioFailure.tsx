'use client'

import Link from 'next/link'
import { StudioChrome } from './StudioChrome'

/** No failed CMS data is replaced with demo content, and server error details stay private. */
export function StudioFailure({ retry }: { retry: () => void }) {
  return (
    <StudioChrome footer={null}>
      <main id="main-content" tabIndex={-1} className="studio-container studio-system-page">
        <p className="studio-eyebrow">A brief interruption</p>
        <h1>
          Something didn’t
          <br />
          come through<span className="studio-accent">.</span>
        </h1>
        <p className="studio-lead">
          The content could not be loaded. Please try again in a moment.
        </p>
        <div className="studio-actions">
          <button type="button" className="studio-button" onClick={retry}>
            Try again ↻
          </button>
          <Link className="studio-text-link" href="/">
            Return home
          </Link>
        </div>
      </main>
    </StudioChrome>
  )
}
