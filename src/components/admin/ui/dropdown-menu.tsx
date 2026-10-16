'use client'

import * as React from 'react'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'

import { ChevronRightIcon, CheckIcon } from 'lucide-react'

import { cn } from '@/components/admin/lib/utils'

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="acn:isolate acn:z-50 acn:outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'acn:z-50 acn:max-h-(--available-height) acn:w-(--anchor-width) acn:min-w-32 acn:origin-(--transform-origin) acn:overflow-x-hidden acn:overflow-y-auto acn:rounded-md acn:bg-popover acn:p-1 acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10 acn:duration-100 acn:outline-none acn:data-[side=bottom]:slide-in-from-top-2 acn:data-[side=inline-end]:slide-in-from-left-2 acn:data-[side=inline-start]:slide-in-from-right-2 acn:data-[side=left]:slide-in-from-right-2 acn:data-[side=right]:slide-in-from-left-2 acn:data-[side=top]:slide-in-from-bottom-2 acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-open:zoom-in-95 acn:data-closed:animate-out acn:data-closed:overflow-hidden acn:data-closed:fade-out-0 acn:data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'acn:px-2 acn:py-1.5 acn:text-xs acn:font-medium acn:text-muted-foreground acn:data-inset:pl-8',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: 'default' | 'destructive'
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        'acn:group/dropdown-menu-item acn:relative acn:flex acn:cursor-default acn:items-center acn:gap-2 acn:rounded-sm acn:px-2 acn:py-1.5 acn:text-sm acn:outline-hidden acn:select-none acn:focus:bg-accent acn:focus:text-accent-foreground acn:not-data-[variant=destructive]:focus:**:text-accent-foreground acn:data-inset:pl-8 acn:data-[variant=destructive]:text-destructive acn:data-[variant=destructive]:focus:bg-destructive/10 acn:data-[variant=destructive]:focus:text-destructive acn:dark:data-[variant=destructive]:focus:bg-destructive/20 acn:data-disabled:pointer-events-none acn:data-disabled:opacity-50 acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4 acn:data-[variant=destructive]:*:[svg]:text-destructive',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        'acn:flex acn:cursor-default acn:items-center acn:gap-2 acn:rounded-sm acn:px-2 acn:py-1.5 acn:text-sm acn:outline-hidden acn:select-none acn:focus:bg-accent acn:focus:text-accent-foreground acn:not-data-[variant=destructive]:focus:**:text-accent-foreground acn:data-inset:pl-8 acn:data-popup-open:bg-accent acn:data-popup-open:text-accent-foreground acn:data-open:bg-accent acn:data-open:text-accent-foreground acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="acn:ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  align = 'start',
  alignOffset = -3,
  side = 'right',
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        'acn:w-auto acn:min-w-[96px] acn:rounded-md acn:bg-popover acn:p-1 acn:text-popover-foreground acn:shadow-lg acn:ring-1 acn:ring-foreground/10 acn:duration-100 acn:data-[side=bottom]:slide-in-from-top-2 acn:data-[side=left]:slide-in-from-right-2 acn:data-[side=right]:slide-in-from-left-2 acn:data-[side=top]:slide-in-from-bottom-2 acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-open:zoom-in-95 acn:data-closed:animate-out acn:data-closed:fade-out-0 acn:data-closed:zoom-out-95',
        className,
      )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        'acn:relative acn:flex acn:cursor-default acn:items-center acn:gap-2 acn:rounded-sm acn:py-1.5 acn:pr-8 acn:pl-2 acn:text-sm acn:outline-hidden acn:select-none acn:focus:bg-accent acn:focus:text-accent-foreground acn:focus:**:text-accent-foreground acn:data-inset:pl-8 acn:data-disabled:pointer-events-none acn:data-disabled:opacity-50 acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4',
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="acn:pointer-events-none acn:absolute acn:right-2 acn:flex acn:items-center acn:justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        'acn:relative acn:flex acn:cursor-default acn:items-center acn:gap-2 acn:rounded-sm acn:py-1.5 acn:pr-8 acn:pl-2 acn:text-sm acn:outline-hidden acn:select-none acn:focus:bg-accent acn:focus:text-accent-foreground acn:focus:**:text-accent-foreground acn:data-inset:pl-8 acn:data-disabled:pointer-events-none acn:data-disabled:opacity-50 acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    >
      <span
        className="acn:pointer-events-none acn:absolute acn:right-2 acn:flex acn:items-center acn:justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('acn:-mx-1 acn:my-1 acn:h-px acn:bg-border', className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'acn:ml-auto acn:text-xs acn:tracking-widest acn:text-muted-foreground acn:group-focus/dropdown-menu-item:text-accent-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
