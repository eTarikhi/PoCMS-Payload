'use client'

import { ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import React, { useState, useSyncExternalStore } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import {
  DEFAULT_RANGE,
  monthListURL,
  PUBLISHING_SERIES,
  SERIES_KEYS,
  type PublishingPoint,
  type PublishingSeries,
} from './publishing'

const RANGES = [6, 12, 24] as const
const RANGE_KEY = 'pocms-publishing-range'

const chartConfig = Object.fromEntries(
  SERIES_KEYS.map((series) => [
    series,
    { label: PUBLISHING_SERIES[series].label, color: PUBLISHING_SERIES[series].color },
  ]),
) satisfies ChartConfig

const readRange = (): number => {
  try {
    const stored = Number(window.localStorage.getItem(RANGE_KEY))
    return (RANGES as readonly number[]).includes(stored) ? stored : DEFAULT_RANGE
  } catch {
    return DEFAULT_RANGE
  }
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * Interactive publishing chart: 6/12/24-month range (remembered), series toggles, tooltips, and a
 * selected month (click a bar, or step with the buttons) with links to that month's documents.
 * The plot itself is hidden from assistive technology: the controls, the month details and the
 * widget's hidden table carry the same information.
 */
export default function PublishingChart({
  points,
  adminRoute,
}: {
  points: PublishingPoint[]
  adminRoute: string
}) {
  const [range, setRange] = useState(readRange)
  const [hidden, setHidden] = useState<Record<PublishingSeries, boolean>>({
    articles: false,
    projects: false,
  })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  )

  const shown = SERIES_KEYS.filter((series) => !hidden[series])
  const visible = points.slice(-range)
  const activity = (point: PublishingPoint) => shown.reduce((sum, series) => sum + point[series], 0)
  const latestActive = [...visible].reverse().find((point) => activity(point) > 0)
  const selected =
    visible.find((point) => point.key === selectedKey) ??
    latestActive ??
    visible[visible.length - 1]
  const selectedIndex = visible.indexOf(selected)
  const totals = Object.fromEntries(
    SERIES_KEYS.map((series) => [series, visible.reduce((sum, p) => sum + p[series], 0)]),
  ) as Record<PublishingSeries, number>
  const busiest = visible.reduce((best, point) => (activity(point) > activity(best) ? point : best))
  // Axis labels: every month (6M), odd months (12M) or quarters (24M), plus the selected month
  // (drawn as a pill), leaving out its immediate neighbours so labels don't collide.
  const every = range <= 6 ? 1 : range <= 12 ? 2 : 3
  const ticks = visible
    .filter((point, index) => {
      if (point.key === selected.key) return true
      if (every > 1 && Math.abs(index - selectedIndex) === 1) return false
      return (Number(point.key.slice(5, 7)) - 1) % every === 0
    })
    .map((point) => point.key)
  // Month ticks, with the year on January ("Jan ’25") so long ranges stay readable.
  const labelFor = (key: string) => {
    const month = visible.find((point) => point.key === key)?.month ?? key
    return key.endsWith('-01') ? `${month} ’${key.slice(2, 4)}` : month
  }

  return (
    <div data-testid="publishing-chart" className="acn:flex acn:flex-col acn:gap-3">
      <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
        <div role="group" aria-label="Series" className="acn:flex acn:flex-wrap acn:gap-1">
          {SERIES_KEYS.map((series) => {
            const on = !hidden[series]
            return (
              <button
                key={series}
                type="button"
                aria-pressed={on}
                // Keep at least one series on.
                disabled={on && shown.length === 1}
                onClick={() => setHidden((value) => ({ ...value, [series]: !value[series] }))}
                className={cn(
                  'acn:inline-flex acn:h-7 acn:cursor-pointer acn:items-center acn:gap-2 acn:rounded-full acn:border acn:border-border acn:bg-transparent acn:px-3 acn:text-xs acn:text-foreground acn:hover:bg-muted acn:disabled:cursor-default acn:disabled:hover:bg-transparent',
                  !on && 'acn:text-muted-foreground acn:line-through',
                )}
              >
                <span
                  aria-hidden
                  className="acn:size-2.5 acn:rounded-full"
                  style={{
                    backgroundColor: on ? PUBLISHING_SERIES[series].color : 'transparent',
                    outline: '1px solid var(--border)',
                  }}
                />
                {PUBLISHING_SERIES[series].label}
                <span className="acn:text-muted-foreground acn:tabular-nums">{totals[series]}</span>
              </button>
            )
          })}
        </div>
        <ToggleGroup
          aria-label="Time range"
          variant="outline"
          size="sm"
          value={[String(range)]}
          onValueChange={(value) => {
            const next = Number(value[0])
            if (!next) return
            setRange(next)
            setSelectedKey(null)
            try {
              window.localStorage.setItem(RANGE_KEY, String(next))
            } catch {
              // Not remembered in private mode.
            }
          }}
        >
          {RANGES.map((months) => (
            <ToggleGroupItem
              key={months}
              value={String(months)}
              // The name starts with the visible text (WCAG 2.5.3, Label in Name).
              aria-label={`${months}M, last ${months} months`}
            >
              {months}M
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div aria-hidden>
        <ChartContainer config={chartConfig} className="acn:aspect-auto acn:h-52 acn:w-full">
          <BarChart data={visible} accessibilityLayer={false} margin={{ left: -16, right: 20 }}>
            <CartesianGrid vertical={false} />

            <XAxis
              dataKey="key"
              ticks={ticks}
              interval={0}
              tickLine={false}
              axisLine={false}
              height={28}
              tick={({ x, y, payload }) => {
                const value = String(payload?.value)
                const isSelected = value === selected.key
                return (
                  <g transform={`translate(${x},${y})`}>
                    {isSelected ? (
                      <rect x={-24} y={3} width={48} height={20} rx={10} fill="var(--primary)" />
                    ) : null}
                    <text
                      dy={17}
                      textAnchor="middle"
                      fontSize={12}
                      fill={isSelected ? 'var(--primary-foreground)' : 'var(--muted-foreground)'}
                    >
                      {labelFor(value)}
                    </text>
                  </g>
                )
              }}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
            <ChartTooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    (payload?.[0]?.payload as PublishingPoint | undefined)?.label
                  }
                />
              }
            />
            {shown.map((series) => (
              <Bar
                key={series}
                dataKey={series}
                fill={`var(--color-${series})`}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                cursor="pointer"
                isAnimationActive={!reducedMotion}
                onClick={(_, index) => setSelectedKey(visible[index]?.key ?? null)}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </div>

      <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-x-3 acn:gap-y-1 acn:border-t acn:border-border acn:pt-3 acn:text-sm">
        <div className="acn:flex acn:items-center acn:gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            disabled={selectedIndex <= 0}
            onClick={() => setSelectedKey(visible[selectedIndex - 1]?.key ?? null)}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <span
            aria-live="polite"
            data-testid="publishing-month"
            className="acn:min-w-32 acn:text-center acn:font-medium"
          >
            {selected.label}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            disabled={selectedIndex >= visible.length - 1}
            onClick={() => setSelectedKey(visible[selectedIndex + 1]?.key ?? null)}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
        {SERIES_KEYS.map((series) =>
          selected[series] > 0 ? (
            <Link
              key={series}
              href={monthListURL(adminRoute, series, selected.key)}
              className="acn:inline-flex acn:items-center acn:gap-1 acn:text-foreground"
            >
              {selected[series]} {PUBLISHING_SERIES[series].label.toLowerCase()}
              <ArrowUpRightIcon aria-hidden className="acn:size-3.5" />
            </Link>
          ) : (
            <span key={series} className="acn:text-muted-foreground">
              0 {PUBLISHING_SERIES[series].label.toLowerCase()}
            </span>
          ),
        )}
        <span className="acn:ml-auto acn:text-xs acn:text-muted-foreground">
          {activity(busiest) > 0
            ? `Busiest: ${busiest.label} (${activity(busiest)})`
            : 'No activity'}
        </span>
      </div>
    </div>
  )
}
