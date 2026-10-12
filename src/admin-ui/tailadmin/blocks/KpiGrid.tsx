import type { ReactNode } from 'react'

import { Badge } from '../ui/Badge'
import { BoxIconLine, ClockIcon, GroupIcon, ImageIcon } from '../icons'
import type { ContentStats } from '../data/types'
import { formatCount } from '../lib/format'

/**
 * KPI tiles — TailAdmin Free `EcommerceMetrics` markup, fed with real Payload
 * counts instead of the template's hard-coded demo numbers.
 *
 * Deliberate omission: the upstream tiles show fake "+11.01%" deltas. Inventing
 * percentages for a CMS dashboard would be misleading, so the badge shows a
 * fact that is actually computed (documents touched in the last 7 days).
 */
export type KpiGridProps = {
  stats: ContentStats
  locale?: string
}

type Kpi = {
  label: string
  value: string
  icon: ReactNode
  badge?: { text: string; color: 'primary' | 'success' | 'warning' | 'light' | 'info' }
}

export function KpiGrid({ stats, locale }: KpiGridProps) {
  const kpis: Kpi[] = [
    {
      label: 'Total documents',
      value: formatCount(stats.totals.documents, locale),
      icon: <BoxIconLine className="size-6 text-gray-800 dark:text-white/90" />,
      badge:
        stats.totals.updatedLast7Days > 0
          ? {
              text: `${formatCount(stats.totals.updatedLast7Days, locale)} touched this week`,
              color: 'success',
            }
          : { text: 'No recent edits', color: 'light' },
    },
    {
      label: 'Collections',
      value: formatCount(stats.totals.collections, locale),
      icon: <ImageIcon className="size-6 text-gray-800 dark:text-white/90" />,
      badge: {
        text: `${formatCount(stats.totals.globals, locale)} global${stats.totals.globals === 1 ? '' : 's'}`,
        color: 'primary',
      },
    },
    {
      label: 'Media items',
      value: formatCount(stats.totals.media, locale),
      icon: <ClockIcon className="size-6 text-gray-800 dark:text-white/90" />,
      badge: { text: 'Uploads', color: 'light' },
    },
    {
      label: 'Users',
      value: formatCount(stats.totals.users, locale),
      icon: <GroupIcon className="size-6 text-gray-800 dark:text-white/90" />,
      badge: { text: 'Accounts', color: 'info' },
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/3"
        >
          <div className="flex size-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
            {kpi.icon}
          </div>

          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="block truncate text-theme-sm text-gray-500 dark:text-gray-400">
                {kpi.label}
              </span>
              <h4 className="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
                {kpi.value}
              </h4>
            </div>
            {kpi.badge ? (
              <Badge color={kpi.badge.color} size="sm" className="max-w-40 truncate">
                {kpi.badge.text}
              </Badge>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export default KpiGrid
