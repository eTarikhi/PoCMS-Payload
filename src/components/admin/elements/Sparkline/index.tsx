import React from 'react'

import { cn } from '@/components/admin/utilities/cn'

/**
 * A small server-rendered SVG line (no client JavaScript). Decorative: the numbers next to it say
 * the same thing, so it is hidden from assistive technology.
 */
export function Sparkline({ className, values }: { className?: string; values: number[] }) {
  const max = Math.max(1, ...values)
  const width = 96
  const height = 28
  const step = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((value, i) => [i * step, height - 2 - (value / max) * (height - 4)])
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  return (
    <svg
      aria-hidden
      data-slot="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      className={cn('acn:h-7 acn:w-16 acn:shrink-0 acn:overflow-visible acn:sm:w-24', className)}
      preserveAspectRatio="none"
    >
      <polygon points={area} fill="var(--chart-1)" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
