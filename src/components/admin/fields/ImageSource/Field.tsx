'use client'

import type { UploadFieldClientProps } from 'payload'
import { FieldDescription, FieldError, UploadField, useField } from '@payloadcms/ui'
import React, { useId, useState } from 'react'

import { cn } from '@/components/admin/utilities/cn'
import { useCustomT } from '@/i18n/useCustomT'

/**
 * One picture, two sources (roadmap P5.2).
 *
 * Articles, Projects and the Header each keep an upload field *and* a text URL: the URL is how the
 * original site stored images, and it stays so old content keeps working. Rendered as two unrelated
 * fields, editors cannot tell which one wins. This component replaces the upload field's UI with a
 * single control that shows both sources as tabs, states which one the site uses, and previews the
 * result. The stored data is untouched: tab one writes the upload field, tab two writes the sibling
 * URL field (named by `clientProps.urlField`).
 *
 * The upload tab renders Payload's own `UploadField`, so choosing, replacing and removing a media
 * document behave exactly as before (drawer, thumbnails, focal point, required checks).
 */
export type ImageSourceFieldProps = UploadFieldClientProps & {
  /** Name of the sibling text field that holds an external image URL. */
  urlField: string
  urlLabel?: string
  urlDescription?: string
}

export function ImageSourceField({
  field,
  path,
  readOnly,
  urlField,
  urlLabel,
  urlDescription,
  ...rest
}: ImageSourceFieldProps) {
  const t = useCustomT()
  const resolvedUrlLabel = urlLabel ?? t('imageSource:externalUrlDefault')
  const resolvedUrlDescription = urlDescription ?? t('imageSource:externalUrlDescription')
  // `path` is passed outright: with `potentiallyStalePath` only, the hook resolves through the
  // surrounding FieldPathContext, which inside a field component is the field's own path — both
  // hooks then read the same field and the control reports the wrong source.
  const upload = useField({ path })
  const url = useField<string>({ path: urlField })
  const hasUpload = Boolean(upload.value)
  const hasUrl = typeof url.value === 'string' && url.value.trim().length > 0
  const isReadOnly = Boolean(readOnly || field.admin?.readOnly)

  // Start on the tab that explains what the editor sees, but only for the first render: after that
  // the editor's choice wins, or switching tabs would be undone on every form update.
  const [tab, setTab] = useState<'upload' | 'url'>(() => (!hasUpload && hasUrl ? 'url' : 'upload'))

  // The URL preview must not keep a broken image on screen after the editor fixes the URL. The
  // failure is remembered together with the URL it belongs to instead of being reset in an effect:
  // a URL that differs from the failed one is by definition not failed yet.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const previewFailed = hasUrl && failedUrl === String(url.value)

  const tabsId = useId()
  const source = hasUpload ? 'upload' : hasUrl ? 'url' : 'none'

  return (
    <div className={cn('field-type upload', upload.showError && 'error')}>
      <label className="field-label">
        {typeof field.label === 'string' || !field.label ? (field.label ?? field.name) : field.name}
        {field.required ? <span className="required">*</span> : null}
      </label>

      <div
        role="tablist"
        aria-label={t('imageSource:tabListLabel')}
        className="acn:mt-2 acn:inline-flex acn:gap-1 acn:rounded-lg acn:border acn:border-border acn:bg-muted acn:p-1"
      >
        {(
          [
            ['upload', t('imageSource:mediaLibrary')],
            ['url', t('imageSource:externalUrl')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${tabsId}-${value}`}
            aria-selected={tab === value}
            aria-controls={`${tabsId}-${value}-panel`}
            onClick={() => setTab(value)}
            className={cn(
              'acn:rounded-md acn:px-3 acn:py-1.5 acn:text-sm acn:font-medium acn:transition-colors',
              'acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50 acn:focus-visible:outline-none',
              tab === value
                ? 'acn:bg-card acn:text-card-foreground acn:shadow-sm'
                : 'acn:text-muted-foreground acn:hover:text-card-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${tabsId}-upload-panel`}
        aria-labelledby={`${tabsId}-upload`}
        hidden={tab !== 'upload'}
        className="acn:mt-3"
      >
        <UploadField field={field} path={path} readOnly={readOnly} {...rest} />
      </div>

      <div
        role="tabpanel"
        id={`${tabsId}-url-panel`}
        aria-labelledby={`${tabsId}-url`}
        hidden={tab !== 'url'}
        className="acn:mt-3"
      >
        <label htmlFor={`field-${urlField}-source`} className="field-label">
          {resolvedUrlLabel}
        </label>
        {/* Payload renders the real field as a hidden input (admin.hidden); this is its visible
            control. The id is distinct so the two never share one. */}
        <input
          id={`field-${urlField}-source`}
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={typeof url.value === 'string' ? url.value : ''}
          onChange={(event) => url.setValue(event.target.value)}
          onBlur={() => url.setValue(url.value, true)}
          disabled={isReadOnly}
          aria-describedby={`${urlField}-description`}
          aria-invalid={url.showError || undefined}
          className="acn:mt-1 acn:w-full acn:rounded-md acn:border acn:border-border acn:bg-card acn:px-3 acn:py-2 acn:text-sm acn:text-card-foreground"
        />
        <div id={`${urlField}-description`}>
          <FieldDescription description={resolvedUrlDescription} path={urlField} />
        </div>
        <FieldError path={urlField} showError={url.showError} message={url.errorMessage} />

        {hasUrl && !previewFailed ? (
          /* eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary URL */
          <img
            src={String(url.value)}
            alt=""
            className="acn:mt-3 acn:max-h-40 acn:rounded-md acn:border acn:border-border acn:object-contain"
            onError={() => setFailedUrl(String(url.value))}
          />
        ) : null}
        {hasUrl && previewFailed ? (
          <p className="acn:mt-2 acn:text-sm acn:text-destructive">
            {t('imageSource:brokenUrl')}
          </p>
        ) : null}
      </div>

      <p className="acn:mt-3 acn:text-sm acn:text-muted-foreground" data-testid="image-source-status">
        {source === 'upload'
          ? t('imageSource:usesUpload')
          : source === 'url'
            ? t('imageSource:usesUrl')
            : t('imageSource:usesNothing')}
        {hasUpload && hasUrl ? ` ${t('imageSource:uploadWins')}` : null}
      </p>

      <FieldError path={path} showError={upload.showError} message={upload.errorMessage} />
    </div>
  )
}

export default ImageSourceField
