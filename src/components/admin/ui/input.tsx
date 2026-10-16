import * as React from 'react'

import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/components/admin/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'acn:h-9 acn:w-full acn:min-w-0 acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-1 acn:text-base acn:shadow-xs acn:transition-[color,box-shadow] acn:outline-none acn:file:inline-flex acn:file:h-7 acn:file:border-0 acn:file:bg-transparent acn:file:text-sm acn:file:font-medium acn:file:text-foreground acn:placeholder:text-muted-foreground acn:focus-visible:border-ring acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50 acn:disabled:pointer-events-none acn:disabled:cursor-not-allowed acn:disabled:opacity-50 acn:aria-invalid:border-destructive acn:aria-invalid:ring-3 acn:aria-invalid:ring-destructive/20 acn:md:text-sm acn:dark:bg-input/30 acn:dark:aria-invalid:border-destructive/50 acn:dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
