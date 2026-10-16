'use client'

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

import { cn } from '@/components/admin/lib/utils'

function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="acn:isolate acn:z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'acn:z-50 acn:inline-flex acn:w-fit acn:max-w-xs acn:origin-(--transform-origin) acn:items-center acn:gap-1.5 acn:rounded-md acn:bg-foreground acn:px-3 acn:py-1.5 acn:text-xs acn:text-background acn:has-data-[slot=kbd]:pr-1.5 acn:data-[side=bottom]:slide-in-from-top-2 acn:data-[side=inline-end]:slide-in-from-left-2 acn:data-[side=inline-start]:slide-in-from-right-2 acn:data-[side=left]:slide-in-from-right-2 acn:data-[side=right]:slide-in-from-left-2 acn:data-[side=top]:slide-in-from-bottom-2 acn:**:data-[slot=kbd]:relative acn:**:data-[slot=kbd]:isolate acn:**:data-[slot=kbd]:z-50 acn:**:data-[slot=kbd]:rounded-sm acn:data-[state=delayed-open]:animate-in acn:data-[state=delayed-open]:fade-in-0 acn:data-[state=delayed-open]:zoom-in-95 acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-open:zoom-in-95 acn:data-closed:animate-out acn:data-closed:fade-out-0 acn:data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="acn:z-50 acn:size-2.5 acn:translate-y-[calc(-50%-2px)] acn:rotate-45 acn:rounded-[2px] acn:bg-foreground acn:fill-foreground acn:data-[side=bottom]:top-1 acn:data-[side=inline-end]:top-1/2! acn:data-[side=inline-end]:-left-1 acn:data-[side=inline-end]:-translate-y-1/2 acn:data-[side=inline-start]:top-1/2! acn:data-[side=inline-start]:-right-1 acn:data-[side=inline-start]:-translate-y-1/2 acn:data-[side=left]:top-1/2! acn:data-[side=left]:-right-1 acn:data-[side=left]:-translate-y-1/2 acn:data-[side=right]:top-1/2! acn:data-[side=right]:-left-1 acn:data-[side=right]:-translate-y-1/2 acn:data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
