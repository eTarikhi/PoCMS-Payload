import React from 'react'

// Keep Payload's access-filtered, responsive Nav; this is only its visual brand slot.
export default function SidebarBrand() {
  return (
    <div className="pocms-nav-brand" aria-label="PoCMS content management">
      <span className="pocms-nav-brand__mark" aria-hidden="true">
        P<span>.</span>
      </span>
      <span className="pocms-nav-brand__name">
        <strong>PoCMS</strong>
        <small>PORTFOLIO STUDIO</small>
      </span>
    </div>
  )
}
