import * as React from 'react'

import { cn } from '@/lib/utils'

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      className={cn(
        'tw:rounded-2xl tw:border tw:border-admin-border tw:bg-admin-card tw:text-admin-foreground tw:shadow-sm',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-header"
      className={cn('tw:flex tw:flex-col tw:gap-1.5 tw:p-5 tw:sm:p-6', className)}
      {...props}
    />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    data-slot="card-title"
    className={cn(
      'tw:m-0 tw:text-base tw:font-semibold tw:leading-none tw:tracking-tight',
      className,
    )}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="card-description"
    className={cn('tw:m-0 tw:text-sm tw:leading-relaxed tw:text-admin-muted-foreground', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-content"
      className={cn('tw:px-5 tw:pb-5 tw:sm:px-6 tw:sm:pb-6', className)}
      {...props}
    />
  ),
)
CardContent.displayName = 'CardContent'
