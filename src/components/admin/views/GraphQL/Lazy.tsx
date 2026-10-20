'use client'

import dynamic from 'next/dynamic'
import React from 'react'

/**
 * The GraphQL tab's client loads as its own chunk, only when the tab opens: Payload's admin is one
 * route, so a static import would ship it with every admin page.
 */
export const GraphQLViewLazy = dynamic(
  () => import('./Client').then((mod) => mod.GraphQLViewClient),
  {
    loading: () => (
      <p role="status" className="acn:px-(--gutter-h) acn:text-sm acn:text-muted-foreground">
        Loading the GraphQL view…
      </p>
    ),
  },
)
