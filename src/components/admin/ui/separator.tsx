'use client'

import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'

import { cn } from '@/components/admin/lib/utils'

function Separator({ className, orientation = 'horizontal', ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'acn:shrink-0 acn:bg-border acn:data-horizontal:h-px acn:data-horizontal:w-full acn:data-vertical:w-px acn:data-vertical:self-stretch',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
