import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/components/admin/lib/utils'

const badgeVariants = cva(
  'acn:group/badge acn:inline-flex acn:h-5 acn:w-fit acn:shrink-0 acn:items-center acn:justify-center acn:gap-1 acn:overflow-hidden acn:rounded-4xl acn:border acn:border-transparent acn:px-2 acn:py-0.5 acn:text-xs acn:font-medium acn:whitespace-nowrap acn:transition-all acn:focus-visible:border-ring acn:focus-visible:ring-[3px] acn:focus-visible:ring-ring/50 acn:has-data-[icon=inline-end]:pr-1.5 acn:has-data-[icon=inline-start]:pl-1.5 acn:aria-invalid:border-destructive acn:aria-invalid:ring-destructive/20 acn:dark:aria-invalid:ring-destructive/40 acn:[&>svg]:pointer-events-none acn:[&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'acn:bg-primary acn:text-primary-foreground acn:[a]:hover:bg-primary/80',
        secondary: 'acn:bg-secondary acn:text-secondary-foreground acn:[a]:hover:bg-secondary/80',
        destructive:
          'acn:bg-destructive/10 acn:text-destructive acn:focus-visible:ring-destructive/20 acn:dark:bg-destructive/20 acn:dark:focus-visible:ring-destructive/40 acn:[a]:hover:bg-destructive/20',
        outline:
          'acn:border-border acn:text-foreground acn:[a]:hover:bg-muted acn:[a]:hover:text-muted-foreground',
        ghost: 'acn:hover:bg-muted acn:hover:text-muted-foreground acn:dark:hover:bg-muted/50',
        link: 'acn:text-primary acn:underline-offset-4 acn:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  })
}

export { Badge, badgeVariants }
