'use client'

import * as React from 'react'

import { Combobox as ComboboxPrimitive } from '@base-ui/react'

import { ChevronDownIcon, XIcon, CheckIcon } from 'lucide-react'

import { cn } from '@/components/admin/lib/utils'
import { Button } from '@/components/admin/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/admin/ui/input-group'

const Combobox = ComboboxPrimitive.Root

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn('acn:[&_svg:not([class*=size-])]:size-4', className)}
      {...props}
    >
      {children}
      <ChevronDownIcon className="acn:pointer-events-none acn:size-4 acn:text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <XIcon className="acn:pointer-events-none" />
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean
  showClear?: boolean
}) {
  return (
    <InputGroup className={cn('acn:w-auto', className)}>
      <ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            render={<ComboboxTrigger />}
            data-slot="input-group-button"
            className="acn:group-has-data-[slot=combobox-clear]/input-group:hidden acn:data-pressed:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}

function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 6,
  align = 'start',
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="acn:isolate acn:z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn(
            'acn:group/combobox-content acn:relative acn:max-h-(--available-height) acn:w-(--anchor-width) acn:max-w-(--available-width) acn:min-w-[calc(var(--anchor-width)+--spacing(7))] acn:origin-(--transform-origin) acn:overflow-hidden acn:rounded-md acn:bg-popover acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10 acn:duration-100 acn:data-[chips=true]:min-w-(--anchor-width) acn:data-[side=bottom]:slide-in-from-top-2 acn:data-[side=inline-end]:slide-in-from-left-2 acn:data-[side=inline-start]:slide-in-from-right-2 acn:data-[side=left]:slide-in-from-right-2 acn:data-[side=right]:slide-in-from-left-2 acn:data-[side=top]:slide-in-from-bottom-2 acn:*:data-[slot=input-group]:m-1 acn:*:data-[slot=input-group]:mb-0 acn:*:data-[slot=input-group]:h-8 acn:*:data-[slot=input-group]:border-input/30 acn:*:data-[slot=input-group]:bg-input/30 acn:*:data-[slot=input-group]:shadow-none acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-open:zoom-in-95 acn:data-closed:animate-out acn:data-closed:fade-out-0 acn:data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        'acn:no-scrollbar acn:max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] acn:scroll-py-1 acn:overflow-y-auto acn:overscroll-contain acn:p-1 acn:data-empty:p-0',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        'acn:relative acn:flex acn:w-full acn:cursor-default acn:items-center acn:gap-2 acn:rounded-sm acn:py-1.5 acn:pr-8 acn:pl-2 acn:text-sm acn:outline-hidden acn:select-none acn:data-highlighted:bg-accent acn:data-highlighted:text-accent-foreground acn:not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground acn:data-disabled:pointer-events-none acn:data-disabled:opacity-50 acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="acn:pointer-events-none acn:absolute acn:right-2 acn:flex acn:size-4 acn:items-center acn:justify-center" />
        }
      >
        <CheckIcon className="acn:pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn('acn:px-2 acn:py-1.5 acn:text-xs acn:text-muted-foreground', className)}
      {...props}
    />
  )
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        'acn:hidden acn:w-full acn:justify-center acn:py-2 acn:text-center acn:text-sm acn:text-muted-foreground acn:group-data-empty/combobox-content:flex',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn('acn:-mx-1 acn:my-1 acn:h-px acn:bg-border', className)}
      {...props}
    />
  )
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        'acn:flex acn:min-h-9 acn:flex-wrap acn:items-center acn:gap-1.5 acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:bg-clip-padding acn:px-2.5 acn:py-1.5 acn:text-sm acn:shadow-xs acn:transition-[color,box-shadow] acn:focus-within:border-ring acn:focus-within:ring-3 acn:focus-within:ring-ring/50 acn:has-aria-invalid:border-destructive acn:has-aria-invalid:ring-3 acn:has-aria-invalid:ring-destructive/20 acn:has-data-[slot=combobox-chip]:px-1.5 acn:dark:bg-input/30 acn:dark:has-aria-invalid:border-destructive/50 acn:dark:has-aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'acn:flex acn:h-[calc(--spacing(5.5))] acn:w-fit acn:items-center acn:justify-center acn:gap-1 acn:rounded-sm acn:bg-muted acn:px-1.5 acn:text-xs acn:font-medium acn:whitespace-nowrap acn:text-foreground acn:has-disabled:pointer-events-none acn:has-disabled:cursor-not-allowed acn:has-disabled:opacity-50 acn:has-data-[slot=combobox-chip-remove]:pr-0',
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className="acn:-ml-1 acn:opacity-50 acn:hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <XIcon className="acn:pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  )
}

function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn('acn:min-w-16 acn:flex-1 acn:outline-none', className)}
      {...props}
    />
  )
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
}
