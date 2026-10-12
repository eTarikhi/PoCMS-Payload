import * as React from 'react'

import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'success' | 'outline'

const variants: Record<BadgeVariant, string> = {
  default: 'tw:bg-admin-primary/10 tw:text-admin-primary',
  secondary: 'tw:bg-admin-muted tw:text-admin-muted-foreground',
  success: 'tw:bg-emerald-500/10 tw:text-emerald-700 tw:dark:text-emerald-300',
  outline: 'tw:border tw:border-admin-border tw:bg-transparent tw:text-admin-foreground',
}

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'tw:inline-flex tw:items-center tw:rounded-full tw:px-2.5 tw:py-1 tw:text-[13px] tw:font-medium tw:leading-none',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
