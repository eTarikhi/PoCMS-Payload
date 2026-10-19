'use client'

import type { DefaultCellComponentProps } from 'payload'
import React from 'react'

import { BOOTSTRAP_CONTEXT_COLORS } from './colors'

/** A swatch of the color the site will use, plus the stored value (unchanged). */
export function ContextColorCell({ cellData }: DefaultCellComponentProps) {
  const value = typeof cellData === 'string' ? cellData : ''
  if (!value) return <span className="acn:text-muted-foreground">-</span>
  return (
    <span className="acn:inline-flex acn:items-center acn:gap-2">
      <span
        aria-hidden
        className="acn:size-3 acn:shrink-0 acn:rounded-full acn:ring-1 acn:ring-border"
        style={{ backgroundColor: BOOTSTRAP_CONTEXT_COLORS[value] ?? 'transparent' }}
      />
      <span className="acn:capitalize">{value}</span>
    </span>
  )
}

export default ContextColorCell
