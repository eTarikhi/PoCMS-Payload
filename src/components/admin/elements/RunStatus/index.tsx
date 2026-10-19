import { CircleCheckIcon, CircleSlashIcon, CircleXIcon, LoaderCircleIcon } from 'lucide-react'
import React from 'react'

import { cn } from '@/components/admin/utilities/cn'

export type RunTone = 'good' | 'running' | 'poor' | 'muted'

const STYLE: Record<RunTone, string> = {
  good: 'acn:bg-rating-good/6 acn:text-rating-good',
  running: 'acn:bg-rating-average/6 acn:text-rating-average',
  poor: 'acn:bg-rating-poor/6 acn:text-rating-poor',
  muted: 'acn:bg-muted acn:text-muted-foreground',
}
const ICON = {
  good: CircleCheckIcon,
  running: LoaderCircleIcon,
  poor: CircleXIcon,
  muted: CircleSlashIcon,
} satisfies Record<RunTone, unknown>

/** Status of a build, deployment or job: icon plus word (colour is never the only cue). */
export function RunStatus({
  className,
  label,
  tone,
}: {
  className?: string
  label: string
  tone: RunTone
}) {
  const Icon = ICON[tone]
  return (
    <span
      className={cn(
        'acn:inline-flex acn:items-center acn:gap-1 acn:rounded-sm acn:px-1.5 acn:py-0.5 acn:text-xs acn:font-medium acn:whitespace-nowrap',
        STYLE[tone],
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn('acn:size-3.5', tone === 'running' && 'acn:motion-safe:animate-spin')}
      />
      {label}
    </span>
  )
}

/** "1m 32s", "45s", "1h 3m". */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
