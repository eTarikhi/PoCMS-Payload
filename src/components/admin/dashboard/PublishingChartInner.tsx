'use client'

import React from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart'
import type { PublishingPoint } from './PublishingChart'

const config = { articles: { label: 'Articles', color: 'var(--chart-1)' } } satisfies ChartConfig

export function PublishingChartInner({ data }: { data: PublishingPoint[] }) {
  return (
    <ChartContainer config={config} className="acn:aspect-auto acn:h-48 acn:w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: -24, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={48} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
            />
          }
        />
        <Bar dataKey="articles" fill="var(--color-articles)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
