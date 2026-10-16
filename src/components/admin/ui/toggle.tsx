'use client'

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/components/admin/lib/utils'

const toggleVariants = cva(
  'acn:group/toggle acn:inline-flex acn:items-center acn:justify-center acn:gap-1 acn:rounded-md acn:text-sm acn:font-medium acn:whitespace-nowrap acn:transition-[color,box-shadow] acn:outline-none acn:hover:bg-muted acn:hover:text-foreground acn:focus-visible:border-ring acn:focus-visible:ring-[3px] acn:focus-visible:ring-ring/50 acn:disabled:pointer-events-none acn:disabled:opacity-50 acn:aria-invalid:border-destructive acn:aria-invalid:ring-destructive/20 acn:aria-pressed:bg-muted acn:dark:aria-invalid:ring-destructive/40 acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'acn:bg-transparent',
        outline: 'acn:border acn:border-input acn:bg-transparent acn:shadow-xs acn:hover:bg-muted',
      },
      size: {
        default:
          'acn:h-9 acn:min-w-9 acn:px-2.5 acn:has-data-[icon=inline-end]:pr-2 acn:has-data-[icon=inline-start]:pl-2',
        sm: 'acn:h-8 acn:min-w-8 acn:px-2.5 acn:has-data-[icon=inline-end]:pr-1.5 acn:has-data-[icon=inline-start]:pl-1.5',
        lg: 'acn:h-10 acn:min-w-10 acn:px-2.5 acn:has-data-[icon=inline-end]:pr-2 acn:has-data-[icon=inline-start]:pl-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
