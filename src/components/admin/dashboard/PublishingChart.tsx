'use client'

import { ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import React, { useRef, useState } from 'react'

import { cn } from '../lib/utils'
import { Button } from '../ui/button'
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

const readRange = (): number => {
  try {
    const stored = Number(window.localStorage.getItem(RANGE_KEY))
    return (RANGES as readonly number[]).includes(stored) ? stored : DEFAULT_RANGE
  } catch {
    return DEFAULT_RANGE
  }
}

/**
 * Interactive publishing chart, plain React and CSS (no chart library): 6/12/24-month range
 * (remembered), series toggles, tooltips on hover and focus, and a selected month (click a bar, use
 * the arrow keys, or step with the buttons) with links to that month's documents.
 *
 * The months are a radio group with roving focus, each named with its counts, so the plot works
 * with a keyboard and a screen reader; the widget's hidden table adds links for every month.
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
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)

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
  const max = Math.max(1, ...visible.flatMap((point) => shown.map((series) => point[series])))
  const tooltip = visible.find((point) => point.key === hoverKey) ?? null
  const tooltipLeft = tooltip
    ? Math.min(85, Math.max(15, ((visible.indexOf(tooltip) + 0.5) / visible.length) * 100))
    : 0

  // Arrow keys move the selection (and focus) between months, like a radio group.
  const onPlotKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 1, ArrowDown: -1 }[event.key]
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? visible.length - 1
          : step
            ? selectedIndex + step
            : null
    if (target === null || target < 0 || target >= visible.length) return
    event.preventDefault()
    const key = visible[target].key
    setSelectedKey(key)
    setHoverKey(key)
    plotRef.current?.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)?.focus()
  }

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

      <div className="acn:flex acn:gap-2">
        {/* Y axis */}
        <div
          aria-hidden
          className="acn:flex acn:h-44 acn:w-6 acn:flex-col acn:justify-between acn:text-right acn:text-xs acn:text-muted-foreground acn:tabular-nums"
        >
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="acn:min-w-0 acn:flex-1">
          {/* Plot: one radio per month (roving focus, arrow keys), grouped bars inside. */}
          <div
            ref={plotRef}
            role="radiogroup"
            aria-label="Month"
            onKeyDown={onPlotKeyDown}
            onPointerLeave={() => setHoverKey(null)}
            className="acn:relative acn:flex acn:h-44 acn:items-stretch acn:gap-0.5 acn:border-b acn:border-border acn:bg-[linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] acn:bg-[length:100%_50%]"
          >
            {visible.map((point) => {
              const isSelected = point.key === selected.key
              const counts = SERIES_KEYS.map(
                (series) => `${point[series]} ${PUBLISHING_SERIES[series].label.toLowerCase()}`,
              ).join(', ')
              return (
                <button
                  key={point.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${point.label}: ${counts}`}
                  tabIndex={isSelected ? 0 : -1}
                  data-key={point.key}
                  onClick={() => setSelectedKey(point.key)}
                  onPointerEnter={() => setHoverKey(point.key)}
                  onFocus={() => setHoverKey(point.key)}
                  onBlur={() => setHoverKey(null)}
                  className={cn(
                    'acn:group acn:relative acn:flex acn:min-w-0 acn:flex-1 acn:cursor-pointer acn:items-end acn:justify-center acn:gap-px acn:rounded-t-md acn:border-0 acn:bg-transparent acn:px-px acn:pt-2 acn:outline-none acn:hover:bg-muted/60 acn:focus-visible:ring-2 acn:focus-visible:ring-ring',
                    isSelected && 'acn:bg-muted acn:hover:bg-muted',
                  )}
                >
                  {shown.map((series) => (
                    <span
                      key={series}
                      aria-hidden
                      className="acn:block acn:w-full acn:max-w-5 acn:rounded-t-sm acn:transition-[height] acn:duration-300 acn:motion-reduce:transition-none"
                      style={{
                        height: `${(point[series] / max) * 100}%`,
                        minHeight: point[series] > 0 ? 2 : 0,
                        backgroundColor: PUBLISHING_SERIES[series].color,
                      }}
                    />
                  ))}
                </button>
              )
            })}
            {tooltip ? (
              <div
                role="presentation"
                data-testid="publishing-tooltip"
                className="acn:pointer-events-none acn:absolute acn:top-1 acn:z-10 acn:min-w-36 acn:-translate-x-1/2 acn:rounded-lg acn:border acn:border-border acn:bg-popover acn:px-3 acn:py-2 acn:text-xs acn:text-popover-foreground acn:shadow-md"
                style={{ left: `${tooltipLeft}%` }}
              >
                <div className="acn:mb-1 acn:font-medium">{tooltip.label}</div>
                {SERIES_KEYS.map((series) => (
                  <div key={series} className="acn:flex acn:items-center acn:gap-2">
                    <span
                      aria-hidden
                      className="acn:size-2 acn:rounded-sm"
                      style={{ backgroundColor: PUBLISHING_SERIES[series].color }}
                    />
                    <span className="acn:text-muted-foreground">
                      {PUBLISHING_SERIES[series].label}
                    </span>
                    <span className="acn:ml-auto acn:font-mono acn:tabular-nums">
                      {tooltip[series]}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {/* X axis: selected month as a pill. */}
          <div
            aria-hidden
            className="acn:mt-1 acn:flex acn:gap-0.5 acn:text-xs acn:text-muted-foreground"
          >
            {visible.map((point) => (
              <span
                key={point.key}
                className="acn:relative acn:flex acn:min-w-0 acn:flex-1 acn:justify-center"
              >
                {ticks.includes(point.key) ? (
                  <span
                    className={cn(
                      'acn:rounded-full acn:px-1.5 acn:leading-5 acn:whitespace-nowrap',
                      point.key === selected.key && 'acn:bg-primary acn:text-primary-foreground',
                    )}
                  >
                    {labelFor(point.key)}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
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
