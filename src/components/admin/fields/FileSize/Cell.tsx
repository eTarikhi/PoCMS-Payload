'use client'

import type { DefaultCellComponentProps } from 'payload'
import React from 'react'

const UNITS = ['B', 'KB', 'MB', 'GB']

/** Upload file sizes in lists ("334 KB" instead of 341586), with the exact bytes as a tooltip. */
export function FileSizeCell({ cellData }: DefaultCellComponentProps) {
  if (typeof cellData !== 'number') return <span className="acn:text-muted-foreground">-</span>
  let size = cellData
  let unit = 0
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024
    unit += 1
  }
  const text = `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${UNITS[unit]}`
  return (
    <span className="acn:tabular-nums" title={`${cellData.toLocaleString()} bytes`}>
      {text}
    </span>
  )
}

export default FileSizeCell
