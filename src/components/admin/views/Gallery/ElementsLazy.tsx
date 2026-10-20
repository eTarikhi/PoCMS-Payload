'use client'

import dynamic from 'next/dynamic'
import React from 'react'

/**
 * The element demos use every primitive, so they load on demand: without this split, Payload's
 * single admin route would ship them to every admin page.
 */
export const ElementsLazy = dynamic(() => import('./Elements').then((mod) => mod.Elements), {
  loading: () => (
    <p role="status" className="acn:text-sm acn:text-muted-foreground">
      Loading the elements…
    </p>
  ),
})
