import React from 'react'

/**
 * Login-screen logo (`admin.components.graphics.Logo`): the eTarikhi mark from the site's own
 * favicon set plus the product name. Server component; Tailwind `acn:` utilities only.
 */
export function Logo() {
  return (
    <div className="acn:flex acn:items-center acn:gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, already optimised */}
      <img
        src="/images/favicon/web-app-manifest-192x192.png"
        alt=""
        width={48}
        height={48}
        className="acn:size-12 acn:shrink-0"
      />
      <div className="acn:flex acn:flex-col acn:leading-tight">
        <span className="acn:text-2xl acn:font-semibold acn:tracking-tight acn:text-foreground">
          PoCMS
        </span>
        <span className="acn:text-sm acn:text-muted-foreground">eTarikhi portfolio admin</span>
      </div>
    </div>
  )
}

export default Logo
