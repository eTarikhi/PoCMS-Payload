'use client'

import { useMemo } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { Label } from '@/components/admin/elements/Label'
import { Separator } from '@/components/admin/elements/Separator'
import { cn } from '@/components/admin/utilities/cn'

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        'acn:flex acn:flex-col acn:gap-6 acn:has-[>[data-slot=checkbox-group]]:gap-3 acn:has-[>[data-slot=radio-group]]:gap-3',
        className,
      )}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        'acn:mb-3 acn:font-medium acn:data-[variant=label]:text-sm acn:data-[variant=legend]:text-base',
        className,
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        'acn:group/field-group acn:@container/field-group acn:flex acn:w-full acn:flex-col acn:gap-7 acn:data-[slot=checkbox-group]:gap-3 acn:*:data-[slot=field-group]:gap-4',
        className,
      )}
      {...props}
    />
  )
}

const fieldVariants = cva(
  'acn:group/field acn:flex acn:w-full acn:gap-3 acn:data-[invalid=true]:text-destructive',
  {
    variants: {
      orientation: {
        vertical: 'acn:flex-col acn:*:w-full acn:[&>.sr-only]:w-auto',
        horizontal:
          'acn:flex-row acn:items-center acn:has-[>[data-slot=field-content]]:items-start acn:*:data-[slot=field-label]:flex-auto acn:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
        responsive:
          'acn:flex-col acn:*:w-full acn:@md/field-group:flex-row acn:@md/field-group:items-center acn:@md/field-group:*:w-auto acn:@md/field-group:has-[>[data-slot=field-content]]:items-start acn:@md/field-group:*:data-[slot=field-label]:flex-auto acn:[&>.sr-only]:w-auto acn:@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      },
    },
    defaultVariants: {
      orientation: 'vertical',
    },
  },
)

function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        'acn:group/field-content acn:flex acn:flex-1 acn:flex-col acn:gap-1 acn:leading-snug',
        className,
      )}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        'acn:group/field-label acn:peer/field-label acn:flex acn:w-fit acn:gap-2 acn:leading-snug acn:group-data-[disabled=true]/field:opacity-50 acn:has-data-checked:border-primary/30 acn:has-data-checked:bg-primary/5 acn:has-[>[data-slot=field]]:rounded-md acn:has-[>[data-slot=field]]:border acn:*:data-[slot=field]:p-3 acn:dark:has-data-checked:border-primary/20 acn:dark:has-data-checked:bg-primary/10',
        'acn:has-[>[data-slot=field]]:w-full acn:has-[>[data-slot=field]]:flex-col',
        className,
      )}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        'acn:flex acn:w-fit acn:items-center acn:gap-2 acn:text-sm acn:font-medium acn:group-data-[disabled=true]/field:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        'acn:text-left acn:text-sm acn:leading-normal acn:font-normal acn:text-muted-foreground acn:group-has-data-horizontal/field:text-balance acn:[[data-variant=legend]+&]:-mt-1.5',
        'acn:last:mt-0 acn:nth-last-2:-mt-1',
        'acn:[&>a]:underline acn:[&>a]:underline-offset-4 acn:[&>a:hover]:text-primary',
        className,
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        'acn:relative acn:-my-2 acn:h-5 acn:text-sm acn:group-data-[variant=outline]/field-group:-mb-2',
        className,
      )}
      {...props}
    >
      <Separator className="acn:absolute acn:inset-0 acn:top-1/2" />
      {children && (
        <span
          className="acn:relative acn:mx-auto acn:block acn:w-fit acn:bg-background acn:px-2 acn:text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [...new Map(errors.map((error) => [error?.message, error])).values()]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="acn:ml-4 acn:flex acn:list-disc acn:flex-col acn:gap-1">
        {uniqueErrors.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('acn:text-sm acn:font-normal acn:text-destructive', className)}
      {...props}
    >
      {content}
    </div>
  )
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}
