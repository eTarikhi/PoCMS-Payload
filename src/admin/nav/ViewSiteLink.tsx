import React from 'react'

/**
 * Small nav footer link so editors can jump to the live portfolio without
 * leaving the admin shell. Rendered after the nav links (afterNavLinks).
 */
export const ViewSiteLink: React.FC = () => {
  return (
    <a
      className="pocms-view-site"
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        margin: '0.75rem 0.75rem 0',
        padding: '0.45rem 0.75rem',
        borderRadius: '6px',
        border: '1px solid var(--theme-elevation-150)',
        color: 'var(--theme-text)',
        fontSize: '0.82rem',
        textDecoration: 'none',
      }}
    >
      View live site <span aria-hidden="true">↗</span>
    </a>
  )
}

export default ViewSiteLink
