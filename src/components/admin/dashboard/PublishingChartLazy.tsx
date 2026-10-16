'use client'

import React, { lazy, Suspense, type ReactNode, useSyncExternalStore } from 'react'

import type { PublishingPoint } from './publishing'

// The interactive chart is a separate chunk, requested only when the dashboard shows this widget
// (Payload's import map would otherwise put it on every admin page).
const PublishingChart = lazy(() => import('./PublishingChart'))

const noopSubscribe = () => () => {}

/**
 * Shows `children` (the server-rendered bars) on the server and while the chart chunk loads, then
 * the interactive chart (client-only: it reads localStorage for the remembered range).
 */
export function PublishingChartLazy({
  children,
  points,
  adminRoute,
}: {
  children: ReactNode
  points: PublishingPoint[]
  adminRoute: string
}) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  if (!mounted) return children
  return (
    <Suspense fallback={children}>
      <PublishingChart points={points} adminRoute={adminRoute} />
    </Suspense>
  )
}
