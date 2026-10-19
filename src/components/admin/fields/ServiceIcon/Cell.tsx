'use client'

import dynamic from 'next/dynamic'

/** Import-map entry for the Services icon cell; Font Awesome loads only where the cell renders. */
export const IconCell = dynamic(() => import('./CellView').then((mod) => mod.IconCellView))

export default IconCell
