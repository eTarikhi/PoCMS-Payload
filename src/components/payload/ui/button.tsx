'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean
  size?: ButtonSize
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  default:
    'tw:bg-admin-primary tw:text-admin-primary-foreground tw:shadow-sm tw:hover:bg-admin-primary/90',
  secondary: 'tw:bg-admin-muted tw:text-admin-foreground tw:hover:bg-admin-muted/75',
  outline:
    'tw:border tw:border-admin-border tw:bg-admin-card tw:text-admin-foreground tw:hover:bg-admin-muted',
  ghost: 'tw:bg-transparent tw:text-admin-foreground tw:hover:bg-admin-muted',
  destructive: 'tw:bg-rose-600 tw:text-white tw:hover:bg-rose-700',
}

const sizes: Record<ButtonSize, string> = {
  default: 'tw:min-h-[44px] tw:px-4 tw:py-2',
  sm: 'tw:min-h-[40px] tw:rounded-lg tw:px-3',
  lg: 'tw:min-h-[48px] tw:rounded-xl tw:px-6',
  icon: 'tw:size-[44px]',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild = false,
      className,
      disabled,
      size = 'default',
      type = 'button',
      variant = 'default',
      ...props
    },
    ref,
  ) => {
    const Component = asChild ? Slot : 'button'

    return (
      <Component
        ref={ref}
        className={cn(
          'tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:gap-2 tw:whitespace-nowrap tw:rounded-xl tw:text-sm tw:font-semibold tw:transition-colors tw:focus-visible:outline-hidden tw:focus-visible:ring-2 tw:focus-visible:ring-admin-ring tw:focus-visible:ring-offset-2 tw:focus-visible:ring-offset-admin-card tw:disabled:pointer-events-none tw:disabled:opacity-50',
          variants[variant],
          sizes[size],
          className,
        )}
        {...(asChild ? {} : { disabled, type })}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
