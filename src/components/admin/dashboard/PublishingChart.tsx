'use client'

import dynamic from 'next/dynamic'
import React from 'react'

import { Skeleton } from '../ui/skeleton'

export type PublishingPoint = { key: string; month: string; label: string; articles: number }

/** Recharts loads only when the widget renders (kept out of the shared admin bundle). */
const Chart = dynamic(
  () => import('./PublishingChartInner').then((mod) => mod.PublishingChartInner),
  {
    ssr: false,
    loading: () => <Skeleton className="acn:h-48 acn:w-full" />,
  },
)

export function PublishingChart({ data }: { data: PublishingPoint[] }) {
  return <Chart data={data} />
}
