import type { Payload, SanitizedPermissions, TypedUser } from 'payload'

import { Button } from '../ui/Button'
import { loadAdminUiData, toShellUser } from '../data/serverData'
import { formatCount } from '../lib/format'
import { ArrowUpRightIcon, BoxIconLine, ClockIcon, GroupIcon, ImageIcon } from '../icons'
import { resolveBranding } from '../config'
import { tailAdminDashboardHref } from '../paths'

import '../styles/tailadmin.css'

/**
 * Injected above Payload's stock dashboard through
 * `admin.components.beforeDashboard`.
 *
 * Payload passes `{ i18n, locale, params, payload, permissions, searchParams,
 * user }` to `beforeDashboard` components — notably **no `req`** — so the data
 * layer is called with `user` instead and access control still applies
 * (`overrideAccess: false`).
 *
 * All fallible work happens in `loadStripData()`, which returns `null` on
 * failure; the JSX itself is built outside any `try/catch` because React does
 * not render synchronously and a `try/catch` around JSX cannot catch render
 * errors (see the `react-hooks/error-boundaries` rule). A failure therefore
 * degrades to "no strip", never to a broken stock dashboard.
 */
type BeforeDashboardProps = {
  payload: Payload
  permissions?: SanitizedPermissions
  user?: TypedUser
  locale?: string
}

type MiniStat = {
  label: string
  value: string
  icon: React.ReactNode
}

type StripData = {
  adminBase: string
  locale?: string
  totals: {
    documents: number
    collections: number
    media: number
    users: number
  }
}

async function loadStripData({
  payload,
  permissions,
  user,
  locale,
}: BeforeDashboardProps): Promise<StripData | null> {
  try {
    const adminBase = payload.config.routes?.admin ?? '/admin'
    const { stats } = await loadAdminUiData({
      payload,
      permissions,
      userDoc: user ? (user as unknown as Record<string, unknown>) : null,
      user: toShellUser(user),
      locale,
      branding: resolveBranding(),
      quick: true,
    })

    // Plain data only — no JSX inside the try/catch.
    return {
      adminBase,
      locale,
      totals: {
        documents: stats.totals.documents,
        collections: stats.totals.collections,
        media: stats.totals.media,
        users: stats.totals.users,
      },
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[tailadmin-pilot] KPI strip could not load its data:', error)
    }
    return null
  }
}

export async function TailAdminKpiStrip(props: BeforeDashboardProps) {
  const data = await loadStripData(props)
  if (!data) return null

  const { adminBase, totals } = data
  const stripLocale = data.locale

  const miniStats: MiniStat[] = [
    {
      label: 'Documents',
      value: formatCount(totals.documents, stripLocale),
      icon: <BoxIconLine size={20} />,
    },
    {
      label: 'Collections',
      value: formatCount(totals.collections, stripLocale),
      icon: <ImageIcon size={20} />,
    },
    {
      label: 'Media',
      value: formatCount(totals.media, stripLocale),
      icon: <ClockIcon size={20} />,
    },
    {
      label: 'Users',
      value: formatCount(totals.users, stripLocale),
      icon: <GroupIcon size={20} />,
    },
  ]

  return (
    <div className="ta-inline mb-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700 dark:bg-white/3">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Content overview
            </h2>
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">
              TailAdmin pilot · rendered from the Payload Local API with your access rights applied
            </p>
          </div>
          <Button
            href={tailAdminDashboardHref(adminBase)}
            size="sm"
            variant="outline"
            endIcon={<ArrowUpRightIcon size={14} />}
          >
            Open TailAdmin dashboard
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {miniStats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-25 p-3 dark:border-gray-700 dark:bg-white/3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
                {stat.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">
                  {stat.label}
                </span>
                <span className="block text-theme-xl font-semibold text-gray-800 dark:text-white/90">
                  {stat.value}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TailAdminKpiStrip
