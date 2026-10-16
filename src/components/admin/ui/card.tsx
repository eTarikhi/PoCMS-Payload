import * as React from 'react'

import { cn } from '@/components/admin/lib/utils'

function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'acn:group/card acn:flex acn:flex-col acn:gap-(--card-spacing) acn:overflow-hidden acn:rounded-xl acn:bg-card acn:py-(--card-spacing) acn:text-sm acn:text-card-foreground acn:shadow-xs acn:ring-1 acn:ring-foreground/10 acn:[--card-spacing:--spacing(6)] acn:has-[>img:first-child]:pt-0 acn:data-[size=sm]:[--card-spacing:--spacing(4)] acn:*:[img:first-child]:rounded-t-xl acn:*:[img:last-child]:rounded-b-xl',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'acn:group/card-header acn:@container/card-header acn:grid acn:auto-rows-min acn:items-start acn:gap-1 acn:rounded-t-xl acn:px-(--card-spacing) acn:has-data-[slot=card-action]:grid-cols-[1fr_auto] acn:has-data-[slot=card-description]:grid-rows-[auto_auto] acn:[.border-b]:pb-(--card-spacing)',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'acn:font-heading acn:text-base acn:leading-normal acn:font-medium acn:group-data-[size=sm]/card:text-sm',
        className,
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('acn:text-sm acn:text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'acn:col-start-2 acn:row-span-2 acn:row-start-1 acn:self-start acn:justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('acn:px-(--card-spacing)', className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'acn:flex acn:items-center acn:rounded-b-xl acn:px-(--card-spacing) acn:[.border-t]:pt-(--card-spacing)',
        className,
      )}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
