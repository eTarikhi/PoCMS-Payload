'use client'

import * as React from 'react'

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar'

import { cn } from '@/components/admin/lib/utils'

function Avatar({
  className,
  size = 'default',
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: 'default' | 'sm' | 'lg'
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        'acn:group/avatar acn:relative acn:flex acn:size-8 acn:shrink-0 acn:rounded-full acn:select-none acn:after:absolute acn:after:inset-0 acn:after:rounded-full acn:after:border acn:after:border-border acn:after:mix-blend-darken acn:data-[size=lg]:size-10 acn:data-[size=sm]:size-6 acn:dark:after:mix-blend-lighten',
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('acn:aspect-square acn:size-full acn:rounded-full acn:object-cover', className)}
      {...props}
    />
  )
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'acn:flex acn:size-full acn:items-center acn:justify-center acn:rounded-full acn:bg-muted acn:text-sm acn:text-muted-foreground acn:group-data-[size=sm]/avatar:text-xs',
        className,
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'acn:absolute acn:right-0 acn:bottom-0 acn:z-10 acn:inline-flex acn:items-center acn:justify-center acn:rounded-full acn:bg-primary acn:text-primary-foreground acn:bg-blend-color acn:ring-2 acn:ring-background acn:select-none',
        'acn:group-data-[size=sm]/avatar:size-2 acn:group-data-[size=sm]/avatar:[&>svg]:hidden',
        'acn:group-data-[size=default]/avatar:size-2.5 acn:group-data-[size=default]/avatar:[&>svg]:size-2',
        'acn:group-data-[size=lg]/avatar:size-3 acn:group-data-[size=lg]/avatar:[&>svg]:size-2',
        className,
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        'acn:group/avatar-group acn:flex acn:-space-x-2 acn:*:data-[slot=avatar]:ring-2 acn:*:data-[slot=avatar]:ring-background',
        className,
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'acn:relative acn:flex acn:size-8 acn:shrink-0 acn:items-center acn:justify-center acn:rounded-full acn:bg-muted acn:text-sm acn:text-muted-foreground acn:ring-2 acn:ring-background acn:group-has-data-[size=lg]/avatar-group:size-10 acn:group-has-data-[size=sm]/avatar-group:size-6 acn:[&>svg]:size-4 acn:group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 acn:group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }
