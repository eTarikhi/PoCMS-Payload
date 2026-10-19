'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { Button } from '@/components/admin/elements/Button'
import { Input } from '@/components/admin/elements/Input'
import { Textarea } from '@/components/admin/elements/Textarea'
import { cn } from '@/components/admin/utilities/cn'

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        'acn:group/input-group acn:relative acn:flex acn:h-9 acn:w-full acn:min-w-0 acn:items-center acn:rounded-md acn:border acn:border-input acn:shadow-xs acn:transition-[color,box-shadow] acn:outline-none acn:in-data-[slot=combobox-content]:focus-within:border-inherit acn:in-data-[slot=combobox-content]:focus-within:ring-0 acn:has-[[data-slot=input-group-control]:focus-visible]:border-ring acn:has-[[data-slot=input-group-control]:focus-visible]:ring-3 acn:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 acn:has-[[data-slot][aria-invalid=true]]:border-destructive acn:has-[[data-slot][aria-invalid=true]]:ring-3 acn:has-[[data-slot][aria-invalid=true]]:ring-destructive/20 acn:has-[>[data-align=block-end]]:h-auto acn:has-[>[data-align=block-end]]:flex-col acn:has-[>[data-align=block-start]]:h-auto acn:has-[>[data-align=block-start]]:flex-col acn:has-[>textarea]:h-auto acn:dark:bg-input/30 acn:dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 acn:has-[>[data-align=block-end]]:[&>input]:pt-3 acn:has-[>[data-align=block-start]]:[&>input]:pb-3 acn:has-[>[data-align=inline-end]]:[&>input]:pr-1.5 acn:has-[>[data-align=inline-start]]:[&>input]:pl-1.5',
        className,
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  'acn:flex acn:h-auto acn:cursor-text acn:items-center acn:justify-center acn:gap-2 acn:py-1.5 acn:text-sm acn:font-medium acn:text-muted-foreground acn:select-none acn:group-data-[disabled=true]/input-group:opacity-50 acn:[&>kbd]:rounded-[calc(var(--radius)-5px)] acn:[&>svg:not([class*=size-])]:size-4',
  {
    variants: {
      align: {
        'inline-start':
          'acn:order-first acn:pl-2 acn:has-[>button]:-ml-1 acn:has-[>kbd]:ml-[-0.15rem]',
        'inline-end':
          'acn:order-last acn:pr-2 acn:has-[>button]:-mr-1 acn:has-[>kbd]:mr-[-0.15rem]',
        'block-start':
          'acn:order-first acn:w-full acn:justify-start acn:px-2.5 acn:pt-2 acn:group-has-[>input]/input-group:pt-2 acn:[.border-b]:pb-2',
        'block-end':
          'acn:order-last acn:w-full acn:justify-start acn:px-2.5 acn:pb-2 acn:group-has-[>input]/input-group:pb-2 acn:[.border-t]:pt-2',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  },
)

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          return
        }

        e.currentTarget.parentElement?.querySelector('input')?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva(
  'acn:flex acn:items-center acn:gap-2 acn:text-sm acn:shadow-none',
  {
    variants: {
      size: {
        xs: 'acn:h-6 acn:gap-1 acn:rounded-[calc(var(--radius)-5px)] acn:px-1.5 acn:[&>svg:not([class*=size-])]:size-3.5',
        sm: '',
        'icon-xs': 'acn:size-6 acn:rounded-[calc(var(--radius)-5px)] acn:p-0 acn:has-[>svg]:p-0',
        'icon-sm': 'acn:size-8 acn:p-0 acn:has-[>svg]:p-0',
      },
    },
    defaultVariants: {
      size: 'xs',
    },
  },
)

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size' | 'type'> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: 'button' | 'submit' | 'reset'
  }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'acn:flex acn:items-center acn:gap-2 acn:text-sm acn:text-muted-foreground acn:[&_svg]:pointer-events-none acn:[&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        'acn:flex-1 acn:rounded-none acn:border-0 acn:bg-transparent acn:shadow-none acn:ring-0 acn:focus-visible:ring-0 acn:aria-invalid:ring-0 acn:dark:bg-transparent',
        className,
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        'acn:flex-1 acn:resize-none acn:rounded-none acn:border-0 acn:bg-transparent acn:py-2 acn:shadow-none acn:ring-0 acn:focus-visible:ring-0 acn:aria-invalid:ring-0 acn:dark:bg-transparent',
        className,
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
