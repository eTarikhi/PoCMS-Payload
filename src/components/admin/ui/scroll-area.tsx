'use client'

import * as React from 'react'

import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'

import { cn } from '@/components/admin/lib/utils'

function ScrollArea({ className, children, ...props }: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('acn:relative', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="acn:size-full acn:rounded-[inherit] acn:transition-[color,box-shadow] acn:outline-none acn:focus-visible:ring-[3px] acn:focus-visible:ring-ring/50 acn:focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'acn:flex acn:touch-none acn:p-px acn:transition-colors acn:select-none acn:data-horizontal:h-2.5 acn:data-horizontal:flex-col acn:data-horizontal:border-t acn:data-horizontal:border-t-transparent acn:data-vertical:h-full acn:data-vertical:w-2.5 acn:data-vertical:border-l acn:data-vertical:border-l-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="acn:relative acn:flex-1 acn:rounded-full acn:bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
