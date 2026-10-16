'use client'

import * as React from 'react'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/components/admin/lib/utils'

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="acn:isolate acn:z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'acn:z-50 acn:flex acn:w-72 acn:origin-(--transform-origin) acn:flex-col acn:gap-4 acn:rounded-md acn:bg-popover acn:p-4 acn:text-sm acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10 acn:outline-hidden acn:duration-100 acn:data-[side=bottom]:slide-in-from-top-2 acn:data-[side=inline-end]:slide-in-from-left-2 acn:data-[side=inline-start]:slide-in-from-right-2 acn:data-[side=left]:slide-in-from-right-2 acn:data-[side=right]:slide-in-from-left-2 acn:data-[side=top]:slide-in-from-bottom-2 acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-open:zoom-in-95 acn:data-closed:animate-out acn:data-closed:fade-out-0 acn:data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('acn:flex acn:flex-col acn:gap-1 acn:text-sm', className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('acn:font-medium', className)}
      {...props}
    />
  )
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('acn:text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger }
