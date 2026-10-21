'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { ProjectItem } from '../../lib/types'
import { CoverImage } from '../ui/CoverImage'

/** Native modal dialog provides focus containment, Escape, and focus restoration. */
export function ProjectViewer({ project, onClose }: { project: ProjectItem; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [fullWidth, setFullWidth] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      document.body.style.overflow = overflow
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="studio-viewer"
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], [tabindex="0"]',
          ),
        )
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
      onClick={(event) => {
        // A backdrop click lands on the dialog, but clicks in the panel do not.
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            event.currentTarget.close()
        }
      }}
    >
      <div className="studio-viewer-heading">
        <div>
          <p className="studio-eyebrow">Project / Image preview</p>
          <h2 id={titleId}>{project.title}</h2>
        </div>
        <button
          type="button"
          className="studio-viewer-close"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close project preview"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        className="studio-viewer-zoom"
        aria-pressed={fullWidth}
        onClick={() => setFullWidth(!fullWidth)}
      >
        {fullWidth ? 'Fit entire image' : 'Inspect at full width'}
      </button>
      <div
        className={`studio-viewer-image${fullWidth ? ' is-expanded' : ''}`}
        role="region"
        aria-label="Project screenshot"
        tabIndex={fullWidth ? 0 : undefined}
      >
        <CoverImage
          src={project.imageUrl || project.thumbnailUrl}
          fallbackSrc="/placeholder.svg"
          alt={`${project.title} — full project screenshot`}
          width={1600}
          height={1000}
          sizes="(max-width: 1000px) 95vw, 1000px"
          priority
        />
      </div>
      <div className="studio-viewer-links">
        {project.url && project.url !== '#' ? (
          <a href={project.url} target="_blank" rel="noopener noreferrer">
            Visit project <span aria-hidden="true">↗</span>
            <span className="studio-sr"> (opens in a new tab)</span>
          </a>
        ) : null}
        {project.readMoreUrl ? (
          <a href={project.readMoreUrl} target="_blank" rel="noopener noreferrer">
            Further reading <span aria-hidden="true">↗</span>
            <span className="studio-sr"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </dialog>
  )
}
