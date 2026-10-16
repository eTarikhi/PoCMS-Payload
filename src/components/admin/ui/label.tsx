'use client'

import * as React from 'react'

import { cn } from '@/components/admin/lib/utils'

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'acn:flex acn:items-center acn:gap-2 acn:text-sm acn:leading-none acn:font-medium acn:select-none acn:group-data-[disabled=true]:pointer-events-none acn:group-data-[disabled=true]:opacity-50 acn:peer-disabled:cursor-not-allowed acn:peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
