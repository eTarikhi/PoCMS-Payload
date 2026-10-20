'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-react'

import { cn } from '@/components/admin/utilities/cn'

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('acn:scroll-my-1 acn:p-1', className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('acn:flex acn:flex-1 acn:text-left', className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: 'sm' | 'default'
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        'acn:flex acn:w-fit acn:items-center acn:justify-between acn:gap-1.5 acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:py-2 acn:pr-2 acn:pl-2.5 acn:text-sm acn:whitespace-nowrap acn:shadow-xs acn:transition-[color,box-shadow] acn:outline-none acn:focus-visible:border-ring acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50 acn:disabled:cursor-not-allowed acn:disabled:opacity-50 acn:aria-invalid:border-destructive acn:aria-invalid:ring-3 acn:aria-invalid:ring-destructive/20 acn:data-placeholder:text-muted-foreground acn:data-[size=default]:h-9 acn:data-[size=sm]:h-8 acn:*:data-[slot=select-value]:line-clamp-1 acn:*:data-[slot=select-value]:flex acn:*:data-[slot=select-value]:items-center acn:*:data-[slot=select-value]:gap-1.5 acn:dark:bg-input/30 acn:dark:hover:bg-input/50 acn:dark:aria-invalid:border-destructive/50 acn:dark:aria-invalid:ring-destructive/40 acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="acn:pointer-events-none acn:size-4 acn:text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="acn:isolate acn:z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            'acn:relative acn:isolate acn:z-50 acn:max-h-(--available-height) acn:w-(--anchor-width) acn:min-w-36 acn:origin-(--transform-origin) acn:overflow-x-hidden acn:overflow-y-auto acn:rounded-md acn:bg-popover acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10 acn:duration-100 acn:data-[align-trigger=true]:animate-none acn:data-[side=bottom]:slide-in-from-top-2 acn:data-[side=inline-end]:slide-in-from-left-2 acn:data-[side=inline-start]:slide-in-from-right-2 acn:data-[side=left]:slide-in-from-right-2 acn:data-[side=right]:slide-in-from-left-2 acn:data-[side=top]:slide-in-from-bottom-2 acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-open:zoom-in-95 acn:data-closed:animate-out acn:data-closed:fade-out-0 acn:data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('acn:px-2 acn:py-1.5 acn:text-xs acn:text-muted-foreground', className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'acn:relative acn:flex acn:w-full acn:cursor-default acn:items-center acn:gap-2 acn:rounded-sm acn:py-1.5 acn:pr-8 acn:pl-2 acn:text-sm acn:outline-hidden acn:select-none acn:focus:bg-accent acn:focus:text-accent-foreground acn:not-data-[variant=destructive]:focus:**:text-accent-foreground acn:data-disabled:pointer-events-none acn:data-disabled:opacity-50 acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4 acn:*:[span]:last:flex acn:*:[span]:last:items-center acn:*:[span]:last:gap-2',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="acn:flex acn:flex-1 acn:shrink-0 acn:gap-2 acn:whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="acn:pointer-events-none acn:absolute acn:right-2 acn:flex acn:size-4 acn:items-center acn:justify-center" />
        }
      >
        <CheckIcon className="acn:pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('acn:pointer-events-none acn:-mx-1 acn:my-1 acn:h-px acn:bg-border', className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        'acn:top-0 acn:z-10 acn:flex acn:w-full acn:cursor-default acn:items-center acn:justify-center acn:bg-popover acn:py-1 acn:[&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        'acn:bottom-0 acn:z-10 acn:flex acn:w-full acn:cursor-default acn:items-center acn:justify-center acn:bg-popover acn:py-1 acn:[&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
