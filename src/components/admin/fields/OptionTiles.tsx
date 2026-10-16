'use client'

import type { SelectFieldClientProps } from 'payload'
import { FieldDescription, FieldError, useField } from '@payloadcms/ui'
import React, { useId } from 'react'

import { cn } from '../lib/utils'

type Option = { label: string; value: string }

function normalise(options: SelectFieldClientProps['field']['options']): Option[] {
  return (options ?? []).map((option) =>
    typeof option === 'string'
      ? { label: option, value: option }
      : {
          label: typeof option.label === 'string' ? option.label : option.value,
          value: option.value,
        },
  )
}

/**
 * A single-choice select field shown as tiles (native radio inputs, so arrow keys, form semantics
 * and screen readers work as usual). The stored value is the option value, unchanged; `renderVisual`
 * draws the swatch or icon for each option.
 */
export function OptionTiles({
  field,
  path: pathFromProps,
  readOnly,
  renderVisual,
}: SelectFieldClientProps & { renderVisual: (value: string) => React.ReactNode }) {
  const { value, setValue, showError, errorMessage, path, disabled } = useField<string>({
    potentiallyStalePath: pathFromProps,
  })
  const labelId = useId()
  const options = normalise(field.options)
  const isReadOnly = Boolean(readOnly || disabled || field.admin?.readOnly)
  const label = typeof field.label === 'string' ? field.label : field.name

  return (
    <div
      className={cn('field-type', showError && 'error')}
      style={{ marginBottom: 'var(--spacing-field)' }}
    >
      {/* Payload styles only label.field-label. No htmlFor: the label names the radiogroup below;
          pointing it at one radio would select that option when clicked. */}
      <label id={labelId} className="field-label">
        {label}
        {field.required ? <span className="required">*</span> : null}
      </label>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-invalid={showError || undefined}
        className="acn:mt-1 acn:flex acn:flex-wrap acn:gap-2"
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'acn:inline-flex acn:cursor-pointer acn:items-center acn:gap-2 acn:rounded-md acn:border acn:border-border acn:bg-card acn:px-3 acn:py-2 acn:text-sm acn:text-card-foreground acn:transition-colors',
              'acn:hover:bg-muted acn:has-[:checked]:border-primary acn:has-[:checked]:bg-primary/10',
              'acn:has-[:focus-visible]:ring-3 acn:has-[:focus-visible]:ring-ring/50',
              isReadOnly && 'acn:cursor-not-allowed acn:opacity-60',
            )}
          >
            <input
              type="radio"
              name={path}
              value={option.value}
              checked={value === option.value}
              disabled={isReadOnly}
              onChange={() => setValue(option.value)}
              className="acn:sr-only"
            />
            {renderVisual(option.value)}
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <FieldError path={path} showError={showError} message={errorMessage} />
      <FieldDescription description={field.admin?.description} path={path} />
    </div>
  )
}
