import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

/**
 * Ported from TailAdmin Free `src/components/ui/badge/Badge.tsx`.
 */
export type BadgeVariant = 'light' | 'solid'
export type BadgeSize = 'sm' | 'md'
export type BadgeColor = 'primary' | 'success' | 'error' | 'warning' | 'info' | 'light' | 'dark'

export type BadgeProps = {
  variant?: BadgeVariant
  size?: BadgeSize
  color?: BadgeColor
  startIcon?: ReactNode
  endIcon?: ReactNode
  children: ReactNode
  className?: string
}

const baseStyles =
  'inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 font-medium whitespace-nowrap'

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-theme-xs',
  md: 'text-sm',
}

const variants: Record<BadgeVariant, Record<BadgeColor, string>> = {
  light: {
    primary: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400',
    success: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500',
    error: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500',
    warning: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400',
    info: 'bg-blue-light-50 text-blue-light-500 dark:bg-blue-light-500/15 dark:text-blue-light-500',
    light: 'bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80',
    dark: 'bg-gray-500 text-white dark:bg-white/5 dark:text-white',
  },
  solid: {
    primary: 'bg-brand-500 text-white dark:text-white',
    success: 'bg-success-500 text-white dark:text-white',
    error: 'bg-error-500 text-white dark:text-white',
    warning: 'bg-warning-500 text-white dark:text-white',
    info: 'bg-blue-light-500 text-white dark:text-white',
    light: 'bg-gray-400 text-white dark:bg-white/5 dark:text-white/80',
    dark: 'bg-gray-700 text-white dark:text-white',
  },
}

export function Badge({
  variant = 'light',
  color = 'primary',
  size = 'md',
  startIcon,
  endIcon,
  children,
  className,
}: BadgeProps) {
  return (
    <span className={cn(baseStyles, sizeStyles[size], variants[variant][color], className)}>
      {startIcon ? <span className="me-1 flex items-center">{startIcon}</span> : null}
      {children}
      {endIcon ? <span className="ms-1 flex items-center">{endIcon}</span> : null}
    </span>
  )
}

export default Badge
