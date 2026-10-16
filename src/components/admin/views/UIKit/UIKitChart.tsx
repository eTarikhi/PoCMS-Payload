'use client'

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/admin/ui/chart'

const DATA = [
  { month: 'May', articles: 1, projects: 2 },
  { month: 'Jun', articles: 2, projects: 1 },
  { month: 'Jul', articles: 0, projects: 3 },
  { month: 'Aug', articles: 3, projects: 1 },
  { month: 'Sep', articles: 1, projects: 2 },
  { month: 'Oct', articles: 2, projects: 4 },
]

const config = {
  articles: { label: 'Articles', color: 'var(--chart-1)' },
  projects: { label: 'Projects', color: 'var(--chart-3)' },
} satisfies ChartConfig

export function UIKitChart() {
  const total = DATA.reduce((sum, d) => sum + d.articles + d.projects, 0)
  return (
    <figure data-slot="ui-kit-chart" className="acn:space-y-2">
      <ChartContainer config={config} className="acn:aspect-auto acn:h-48 acn:w-full">
        <BarChart accessibilityLayer data={DATA}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="articles" fill="var(--color-articles)" radius={4} />
          <Bar dataKey="projects" fill="var(--color-projects)" radius={4} />
        </BarChart>
      </ChartContainer>
      <figcaption className="acn:text-xs acn:text-muted-foreground">
        Sample data: {total} items published over six months.
      </figcaption>
    </figure>
  )
}
