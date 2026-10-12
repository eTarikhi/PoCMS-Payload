'use client'

import type { ApexOptions } from 'apexcharts'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'

import type { GrowthSeries } from '../data/types'
import { cn } from '../lib/cn'
import { formatCount } from '../lib/format'

/**
 * Area chart — TailAdmin Free `StatisticsChart` visuals, driven by real
 * `createdAt` counts from the Payload Local API.
 *
 * `react-apexcharts` is loaded with `next/dynamic({ ssr: false })` exactly like
 * upstream: ApexCharts touches `window` on mount and would otherwise break
 * server rendering of the admin view.
 */
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

type Granularity = 'monthly' | 'quarterly' | 'annual'

export type ContentGrowthChartProps = {
  growth: GrowthSeries
  className?: string
}

function aggregate(points: GrowthSeries['points'], granularity: Granularity) {
  if (granularity === 'monthly') return points

  const buckets = new Map<string, { label: string; value: number }>()

  for (const point of points) {
    const [year, month] = point.key.split('-')
    const monthIndex = Number(month) - 1
    const key =
      granularity === 'quarterly' ? `${year}-Q${Math.floor(monthIndex / 3) + 1}` : String(year)
    const label =
      granularity === 'quarterly' ? `Q${Math.floor(monthIndex / 3) + 1} ${year.slice(2)}` : year
    const bucket = buckets.get(key) ?? { label, value: 0 }
    bucket.value += point.value
    buckets.set(key, bucket)
  }

  return Array.from(buckets.entries()).map(([key, value]) => ({ key, ...value }))
}

const TABS: Array<{ id: Granularity; label: string }> = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'annual', label: 'Annual' },
]

export default function ContentGrowthChart({ growth, className }: ContentGrowthChartProps) {
  const [granularity, setGranularity] = useState<Granularity>('monthly')

  const series = useMemo(() => aggregate(growth.points, granularity), [growth.points, granularity])

  const options: ApexOptions = useMemo(
    () => ({
      legend: { show: false, position: 'top', horizontalAlign: 'left' },
      colors: ['#465FFF', '#9CB9FF'],
      chart: {
        fontFamily: 'inherit',
        height: 310,
        type: 'area',
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      stroke: { curve: 'smooth', width: [2] },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.55, opacityTo: 0 } },
      markers: { size: 0, strokeColors: '#fff', strokeWidth: 2, hover: { size: 6 } },
      grid: {
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        borderColor: '#E4E7EC',
      },
      dataLabels: { enabled: false },
      tooltip: { enabled: true, y: { formatter: (value: number) => formatCount(value) } },
      xaxis: {
        type: 'category',
        categories: series.map((point) => point.label),
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        labels: {
          style: { fontSize: '12px', colors: ['#6B7280'] },
          formatter: (value: number) => formatCount(value),
        },
        forceNiceScale: true,
      },
    }),
    [series],
  )

  const chartSeries = useMemo(
    () => [{ name: `${growth.collectionLabel} created`, data: series.map((point) => point.value) }],
    [growth.collectionLabel, series],
  )

  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white px-5 pt-5 pb-5 sm:px-6 sm:pt-6 dark:border-gray-800 dark:bg-white/3',
        className,
      )}
    >
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Content growth
          </h3>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {growth.collectionLabel} created per {granularity.replace('ly', '')} period ·{' '}
            {formatCount(growth.total)} in range
          </p>
        </div>

        <div className="flex max-h-10 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setGranularity(tab.id)}
              className={cn(
                'rounded-md px-3 py-2 text-theme-sm font-medium transition-colors hover:text-gray-900 dark:hover:text-white',
                granularity === tab.id
                  ? 'bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="custom-scrollbar max-w-full overflow-x-auto">
        <div className="min-w-250 xl:min-w-full">
          <Chart options={options} series={chartSeries} type="area" height={310} />
        </div>
      </div>
    </div>
  )
}
