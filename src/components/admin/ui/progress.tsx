'use client'

import { Progress as ProgressPrimitive } from '@base-ui/react/progress'

import { cn } from '@/components/admin/lib/utils'

function Progress({ className, children, value, ...props }: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn('acn:flex acn:flex-wrap acn:gap-3', className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        'acn:relative acn:flex acn:h-1.5 acn:w-full acn:items-center acn:overflow-x-hidden acn:rounded-full acn:bg-muted',
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn('acn:h-full acn:bg-primary acn:transition-all', className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn('acn:text-sm acn:font-medium', className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        'acn:ml-auto acn:text-sm acn:text-muted-foreground acn:tabular-nums',
        className,
      )}
      data-slot="progress-value"
      {...props}
    />
  )
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue }
