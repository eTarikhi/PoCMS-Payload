import React from 'react'

/**
 * Compact "View site" ghost button in the admin header (visible on every page).
 * Complements the sidebar link so editors can always jump to the live portfolio.
 */
export const HeaderViewSiteButton: React.FC = () => {
  return (
    <a className="pocms-view-site-header" href="/" target="_blank" rel="noopener noreferrer">
      View site
      <span aria-hidden="true">↗</span>
    </a>
  )
}

export default HeaderViewSiteButton
