import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/components/admin/utilities/cn'

const buttonVariants = cva(
  'acn:group/button acn:inline-flex acn:shrink-0 acn:items-center acn:justify-center acn:rounded-md acn:border acn:border-transparent acn:bg-clip-padding acn:text-sm acn:font-medium acn:whitespace-nowrap acn:transition-all acn:outline-none acn:select-none acn:focus-visible:border-ring acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50 acn:active:not-aria-[haspopup]:translate-y-px acn:disabled:pointer-events-none acn:disabled:opacity-50 acn:aria-invalid:border-destructive acn:aria-invalid:ring-3 acn:aria-invalid:ring-destructive/20 acn:dark:aria-invalid:border-destructive/50 acn:dark:aria-invalid:ring-destructive/40 acn:[&_svg]:pointer-events-none acn:[&_svg]:shrink-0 acn:[&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'acn:bg-primary acn:text-primary-foreground acn:hover:bg-primary/80',
        outline:
          'acn:border-border acn:bg-background acn:shadow-xs acn:hover:bg-muted acn:hover:text-foreground acn:aria-expanded:bg-muted acn:aria-expanded:text-foreground acn:dark:border-input acn:dark:bg-input/30 acn:dark:hover:bg-input/50',
        secondary:
          'acn:bg-secondary acn:text-secondary-foreground acn:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] acn:aria-expanded:bg-secondary acn:aria-expanded:text-secondary-foreground',
        ghost:
          'acn:hover:bg-muted acn:hover:text-foreground acn:aria-expanded:bg-muted acn:aria-expanded:text-foreground acn:dark:hover:bg-muted/50',
        destructive:
          'acn:bg-destructive/10 acn:text-destructive acn:hover:bg-destructive/20 acn:focus-visible:border-destructive/40 acn:focus-visible:ring-destructive/20 acn:dark:bg-destructive/20 acn:dark:hover:bg-destructive/30 acn:dark:focus-visible:ring-destructive/40',
        link: 'acn:text-primary acn:underline-offset-4 acn:hover:underline',
      },
      size: {
        default:
          'acn:h-9 acn:gap-1.5 acn:px-2.5 acn:in-data-[slot=button-group]:rounded-md acn:has-data-[icon=inline-end]:pr-2 acn:has-data-[icon=inline-start]:pl-2',
        xs: 'acn:h-6 acn:gap-1 acn:rounded-[min(var(--radius-md),8px)] acn:px-2 acn:text-xs acn:in-data-[slot=button-group]:rounded-md acn:has-data-[icon=inline-end]:pr-1.5 acn:has-data-[icon=inline-start]:pl-1.5 acn:[&_svg:not([class*=size-])]:size-3',
        sm: 'acn:h-8 acn:gap-1 acn:rounded-[min(var(--radius-md),10px)] acn:px-2.5 acn:in-data-[slot=button-group]:rounded-md acn:has-data-[icon=inline-end]:pr-1.5 acn:has-data-[icon=inline-start]:pl-1.5',
        lg: 'acn:h-10 acn:gap-1.5 acn:px-2.5 acn:has-data-[icon=inline-end]:pr-2 acn:has-data-[icon=inline-start]:pl-2',
        icon: 'acn:size-9',
        'icon-xs':
          'acn:size-6 acn:rounded-[min(var(--radius-md),8px)] acn:in-data-[slot=button-group]:rounded-md acn:[&_svg:not([class*=size-])]:size-3',
        'icon-sm':
          'acn:size-8 acn:rounded-[min(var(--radius-md),10px)] acn:in-data-[slot=button-group]:rounded-md',
        'icon-lg': 'acn:size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
