import * as React from 'react'

import { cn } from '@/components/admin/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'acn:flex acn:field-sizing-content acn:min-h-16 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-2 acn:text-base acn:shadow-xs acn:transition-[color,box-shadow] acn:outline-none acn:placeholder:text-muted-foreground acn:focus-visible:border-ring acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50 acn:disabled:cursor-not-allowed acn:disabled:opacity-50 acn:aria-invalid:border-destructive acn:aria-invalid:ring-3 acn:aria-invalid:ring-destructive/20 acn:md:text-sm acn:dark:bg-input/30 acn:dark:aria-invalid:border-destructive/50 acn:dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
