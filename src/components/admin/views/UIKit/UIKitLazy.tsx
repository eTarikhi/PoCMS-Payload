'use client'

import dynamic from 'next/dynamic'
import React from 'react'

/**
 * The UI kit renders every primitive, so it is loaded on demand: without this split, Payload's
 * single admin route would ship the whole kit to every admin page.
 */
export const UIKitLazy = dynamic(() => import('./UIKitClient').then((mod) => mod.UIKitClient), {
  loading: () => (
    <p role="status" className="acn:text-sm acn:text-muted-foreground">
      Loading the UI kit…
    </p>
  ),
})
