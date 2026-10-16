'use client'

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'

import { CheckIcon } from 'lucide-react'

import { cn } from '@/components/admin/lib/utils'

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'acn:peer acn:relative acn:flex acn:size-4 acn:shrink-0 acn:items-center acn:justify-center acn:rounded-[4px] acn:border acn:border-input acn:shadow-xs acn:transition-shadow acn:outline-none acn:group-has-disabled/field:opacity-50 acn:after:absolute acn:after:-inset-x-3 acn:after:-inset-y-2 acn:focus-visible:border-ring acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50 acn:disabled:cursor-not-allowed acn:disabled:opacity-50 acn:aria-invalid:border-destructive acn:aria-invalid:ring-3 acn:aria-invalid:ring-destructive/20 acn:aria-invalid:aria-checked:border-primary acn:dark:bg-input/30 acn:dark:aria-invalid:border-destructive/50 acn:dark:aria-invalid:ring-destructive/40 acn:data-checked:border-primary acn:data-checked:bg-primary acn:data-checked:text-primary-foreground acn:dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="acn:grid acn:place-content-center acn:text-current acn:transition-none acn:[&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
