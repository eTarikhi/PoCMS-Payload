import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

/**
 * Card surfaces used across the TailAdmin pilot.
 *
 * `Panel` is the plain TailAdmin card (`rounded-2xl border bg-white`), and
 * `ComponentCard` is upstream `src/components/common/ComponentCard.tsx` — a
 * panel with a title, a description and an optional action slot.
 */
export type PanelProps = {
  children: ReactNode
  className?: string
  /** Tighter padding used by table panels. */
  padded?: boolean
}

export function Panel({ children, className, padded = true }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3',
        padded && 'p-5 sm:p-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

export type ComponentCardProps = {
  title: string
  desc?: ReactNode
  children: ReactNode
  className?: string
  action?: ReactNode
}

export function ComponentCard({ title, desc, children, className, action }: ComponentCardProps) {
  return (
    <Panel className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)}>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>
          {desc ? (
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{desc}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
      </div>
      {children}
    </Panel>
  )
}

export default Panel
