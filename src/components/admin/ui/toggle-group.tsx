'use client'

import * as React from 'react'

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { type VariantProps } from 'class-variance-authority'

import { cn } from '@/components/admin/lib/utils'
import { toggleVariants } from '@/components/admin/ui/toggle'

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: 'horizontal' | 'vertical'
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 2,
  orientation: 'horizontal',
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = 'horizontal',
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: 'horizontal' | 'vertical'
  }) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        'acn:group/toggle-group acn:flex acn:w-fit acn:flex-row acn:items-center acn:gap-[--spacing(var(--gap))] acn:rounded-md acn:data-[spacing=0]:data-[variant=outline]:shadow-xs acn:data-vertical:flex-col acn:data-vertical:items-stretch',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        'acn:shrink-0 acn:group-data-[spacing=0]/toggle-group:rounded-none acn:group-data-[spacing=0]/toggle-group:px-2 acn:group-data-[spacing=0]/toggle-group:shadow-none acn:focus:z-10 acn:focus-visible:z-10 acn:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 acn:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 acn:group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-md acn:group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-md acn:group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-md acn:group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-md acn:data-[state=on]:bg-muted acn:group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 acn:group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 acn:group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l acn:group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t',
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
