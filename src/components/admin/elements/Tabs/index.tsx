'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/components/admin/utilities/cn'

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn('acn:group/tabs acn:flex acn:gap-2 acn:data-horizontal:flex-col', className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  'acn:group/tabs-list acn:inline-flex acn:w-fit acn:items-center acn:justify-center acn:rounded-lg acn:p-[3px] acn:text-muted-foreground acn:group-data-horizontal/tabs:h-9 acn:group-data-vertical/tabs:h-fit acn:group-data-vertical/tabs:flex-col acn:data-[variant=line]:rounded-none',
  {
    variants: {
      variant: {
        default: 'acn:bg-muted',
        line: 'acn:gap-1 acn:bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function TabsList({
  className,
  variant = 'default',
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'acn:relative acn:inline-flex acn:h-[calc(100%-1px)] acn:flex-1 acn:items-center acn:justify-center acn:gap-1.5 acn:rounded-md acn:border acn:border-transparent acn:px-2 acn:py-1 acn:text-sm acn:font-medium acn:whitespace-nowrap acn:text-muted-foreground acn:transition-all acn:group-data-vertical/tabs:w-full acn:group-data-vertical/tabs:justify-start acn:hover:text-foreground acn:focus-visible:border-ring acn:focus-visible:ring-[3px] acn:focus-visible:ring-ring/50 acn:focus-visible:outline-1 acn:focus-visible:outline-ring acn:disabled:pointer-events-none acn:disabled:opacity-50 acn:has-data-[icon=inline-end]:pr-1.5 acn:has-data-[icon=inline-start]:pl-1.5 acn:aria-disabled:pointer-events-none acn:aria-disabled:opacity-50 acn:dark:text-muted-foreground acn:dark:hover:text-foreground acn:group-data-[variant=default]/tabs-list:data-active:shadow-sm acn:group-data-[variant=line]/tabs-list:data-active:shadow-none acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4',
        'acn:group-data-[variant=line]/tabs-list:bg-transparent acn:group-data-[variant=line]/tabs-list:data-active:bg-transparent acn:dark:group-data-[variant=line]/tabs-list:data-active:border-transparent acn:dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
        'acn:data-active:bg-background acn:data-active:text-foreground acn:dark:data-active:border-input acn:dark:data-active:bg-input/30 acn:dark:data-active:text-foreground',
        'acn:after:absolute acn:after:bg-foreground acn:after:opacity-0 acn:after:transition-opacity acn:group-data-horizontal/tabs:after:inset-x-0 acn:group-data-horizontal/tabs:after:bottom-[-5px] acn:group-data-horizontal/tabs:after:h-0.5 acn:group-data-vertical/tabs:after:inset-y-0 acn:group-data-vertical/tabs:after:-right-1 acn:group-data-vertical/tabs:after:w-0.5 acn:group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('acn:flex-1 acn:text-sm acn:outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
