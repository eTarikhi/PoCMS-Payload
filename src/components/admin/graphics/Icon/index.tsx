import React from 'react'

/** Nav/breadcrumb icon (`admin.components.graphics.Icon`): the eTarikhi mark. */
export function Icon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static asset, already optimised
    <img
      src="/images/favicon/favicon-96x96.png"
      alt="PoCMS"
      width={20}
      height={20}
      className="acn:block acn:size-5"
    />
  )
}

export default Icon
