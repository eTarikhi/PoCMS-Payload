'use client'

import dynamic from 'next/dynamic'
import React from 'react'

/**
 * The terminal console is client code used by one view; loading it on demand keeps it out of the
 * chunk every admin page shares (Payload's admin is one route).
 */
export const TerminalLazy = dynamic(
  () => import('./Console').then((module) => module.TerminalConsole),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="acn:text-sm acn:text-muted-foreground">
        Loading the terminal…
      </p>
    ),
  },
)
