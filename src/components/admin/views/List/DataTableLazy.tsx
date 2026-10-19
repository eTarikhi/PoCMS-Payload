'use client'

import dynamic from 'next/dynamic'

/**
 * TanStack Table loads as its own chunk, only on pages that render a list. Payload's admin is one
 * route, so a static import would put it in the bundle of every admin page. Server rendering stays
 * on (the table HTML arrives with the page); the chunk is fetched before that part hydrates.
 */
export const LazyDataTable = dynamic(() => import('./DataTable').then((mod) => mod.DataTable))
