import React from 'react'

import './graphics.scss'

/**
 * Full logo shown on the login page and other branded contexts.
 */
export const Logo: React.FC = () => {
  return (
    <span className="pocms-logo">
      <svg viewBox="0 0 32 32" role="presentation" focusable="false" className="pocms-logo__mark">
        <rect x="1" y="1" width="30" height="30" rx="8" className="pocms-mark__plate" />
        <path
          d="M11 24V8h6.6c3.4 0 5.6 2 5.6 5.1 0 3.2-2.2 5.2-5.6 5.2H14.6V24H11zm3.6-8.3h2.6c1.7 0 2.7-1 2.7-2.6s-1-2.6-2.7-2.6h-2.6v5.2z"
          className="pocms-mark__letter"
        />
      </svg>
      <span className="pocms-logo__text">
        <strong>PoCMS</strong>
        <small>Portfolio Content Management</small>
      </span>
    </span>
  )
}

export default Logo
