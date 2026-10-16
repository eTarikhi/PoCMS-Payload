'use client'

import type { DefaultCellComponentProps } from 'payload'
import React from 'react'

/** 0-100 values (Skills proficiency) as a small bar with the number. */
export function ProgressCell({ cellData }: DefaultCellComponentProps) {
  const value = typeof cellData === 'number' ? Math.max(0, Math.min(100, cellData)) : null
  if (value === null) return <span className="acn:text-muted-foreground">-</span>
  return (
    <span className="acn:inline-flex acn:w-36 acn:items-center acn:gap-2">
      <span
        role="meter"
        aria-label="Proficiency"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="acn:h-1.5 acn:flex-1 acn:overflow-hidden acn:rounded-full acn:bg-muted"
      >
        <span
          className="acn:block acn:h-full acn:rounded-full acn:bg-primary"
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="acn:w-8 acn:text-right acn:tabular-nums">{value}</span>
    </span>
  )
}

export default ProgressCell
