'use client'

import { useLexicalEditable } from '@payloadcms/richtext-lexical/lexical/react/useLexicalEditable'
import { useBlockComponentContext } from '@payloadcms/richtext-lexical/client'
import { RenderFields, useForm, useFormFields } from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'

type SizeOption = 'small' | 'medium' | 'normal' | 'wide' | 'custom'
type AlignOption = 'left' | 'center' | 'right'
type RatioOption = 'auto' | '16:9' | '4:3' | '1:1'

const SIZE_PILLS: Array<{ label: string; value: SizeOption }> = [
  { label: '40%', value: 'small' },
  { label: '65%', value: 'medium' },
  { label: '100%', value: 'normal' },
  { label: 'Wide', value: 'wide' },
  { label: 'Custom px', value: 'custom' },
]

const ALIGN_PILLS: Array<{ label: string; value: AlignOption }> = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
]

const RATIO_PILLS: Array<{ label: string; value: RatioOption }> = [
  { label: 'Auto', value: 'auto' },
  { label: '16:9', value: '16:9' },
  { label: '4:3', value: '4:3' },
  { label: '1:1', value: '1:1' },
]

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.2rem 0.5rem',
  fontSize: '0.72rem',
  fontWeight: 600,
  borderRadius: '5px',
  border: active ? '1px solid #da9100' : '1px solid var(--theme-elevation-200)',
  background: active ? 'rgba(218, 145, 0, 0.2)' : 'var(--theme-elevation-100)',
  color: 'var(--theme-text)',
  cursor: 'pointer',
  lineHeight: 1.3,
})

export function MediaBlockEditor() {
  const { BlockCollapsible, EditButton, formSchema, RemoveButton } = useBlockComponentContext()
  const { setModified } = useForm()
  const isEditable = useLexicalEditable()

  const {
    mediaVal,
    imageUrlVal,
    sizeVal,
    customWidthVal,
    alignmentVal,
    aspectRatioVal,
    captionVal,
    updateField,
  } = useFormFields(([fields, dispatch]) => ({
    mediaVal: fields?.media?.value,
    imageUrlVal: typeof fields?.imageUrl?.value === 'string' ? fields.imageUrl.value : '',
    sizeVal: ((fields?.size?.value as SizeOption | undefined) ?? 'normal') as SizeOption,
    customWidthVal:
      typeof fields?.customWidth?.value === 'number' ? fields.customWidth.value : 560,
    alignmentVal: ((fields?.alignment?.value as AlignOption | undefined) ?? 'center') as AlignOption,
    aspectRatioVal: ((fields?.aspectRatio?.value as RatioOption | undefined) ?? 'auto') as RatioOption,
    captionVal: typeof fields?.caption?.value === 'string' ? fields.caption.value : '',
    updateField: (path: string, value: unknown) => {
      dispatch({ type: 'UPDATE', path, value })
      setModified(true)
    },
  }))

  const [fetchedMediaUrl, setFetchedMediaUrl] = useState<string>('')
  const [showFields, setShowFields] = useState<boolean>(false)
  const figureRef = useRef<HTMLDivElement | null>(null)

  const mediaObjectUrl =
    mediaVal && typeof mediaVal === 'object' && 'url' in mediaVal && typeof mediaVal.url === 'string'
      ? mediaVal.url
      : ''
  const mediaId =
    typeof mediaVal === 'number' || typeof mediaVal === 'string' ? String(mediaVal) : ''

  useEffect(() => {
    if (!mediaId || mediaObjectUrl) return
    let cancelled = false
    fetch(`/api/media/${encodeURIComponent(mediaId)}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc: { url?: string; sizes?: { card?: { url?: string } } } | null) => {
        if (cancelled || !doc) return
        setFetchedMediaUrl(doc.sizes?.card?.url || doc.url || '')
      })
      .catch(() => {
        // Ignore preview fetch errors
      })
    return () => {
      cancelled = true
    }
  }, [mediaId, mediaObjectUrl])

  const previewSrc = mediaObjectUrl || (mediaId ? fetchedMediaUrl : '') || imageUrlVal.trim()

  const computeStageWidthStyle = (): React.CSSProperties => {
    switch (sizeVal) {
      case 'small':
        return { width: '40%', maxWidth: '100%' }
      case 'medium':
        return { width: '65%', maxWidth: '100%' }
      case 'custom':
        return { width: `${Math.max(180, Math.min(1140, customWidthVal || 560))}px`, maxWidth: '100%' }
      case 'wide':
      case 'normal':
      default:
        return { width: '100%', maxWidth: '100%' }
    }
  }

  const justifyMap: Record<AlignOption, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  }

  const ratioCss =
    aspectRatioVal === '16:9'
      ? '16 / 9'
      : aspectRatioVal === '4:3'
        ? '4 / 3'
        : aspectRatioVal === '1:1'
          ? '1 / 1'
          : undefined

  const startResizeDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditable || !figureRef.current) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = figureRef.current.getBoundingClientRect().width

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const rawNext = startWidth + delta
      const snapped = Math.max(180, Math.min(1140, Math.round(rawNext / 8) * 8))
      updateField('size', 'custom')
      updateField('customWidth', snapped)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <BlockCollapsible
      Actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => setShowFields((prev) => !prev)}
            style={pillStyle(showFields || !previewSrc)}
          >
            {showFields || !previewSrc ? 'Hide Fields' : 'Source & Caption'}
          </button>
          <EditButton />
          <RemoveButton />
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* In-Editor Interactive Dimension, Alignment & Ratio Toolbar */}
        {isEditable ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              padding: '0.45rem 0.6rem',
              borderRadius: '8px',
              background: 'var(--theme-elevation-50)',
              border: '1px solid var(--theme-elevation-150)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.28rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--theme-elevation-600)', marginRight: '0.2rem' }}>
                Size:
              </span>
              {SIZE_PILLS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField('size', opt.value)}
                  style={pillStyle(sizeVal === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
              {sizeVal === 'custom' ? (
                <input
                  type="number"
                  min={180}
                  max={1140}
                  step={8}
                  value={customWidthVal}
                  aria-label="Custom width in pixels"
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10)
                    if (Number.isFinite(parsed)) {
                      updateField('customWidth', Math.max(180, Math.min(1140, parsed)))
                    }
                  }}
                  style={{
                    width: '68px',
                    padding: '0.16rem 0.35rem',
                    fontSize: '0.72rem',
                    borderRadius: '5px',
                    border: '1px solid var(--theme-elevation-250)',
                    background: 'var(--theme-bg)',
                    color: 'var(--theme-text)',
                  }}
                />
              ) : null}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.28rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--theme-elevation-600)', marginRight: '0.15rem' }}>
                Align:
              </span>
              {ALIGN_PILLS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField('alignment', opt.value)}
                  style={pillStyle(alignmentVal === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.28rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--theme-elevation-600)', marginRight: '0.15rem' }}>
                Ratio:
              </span>
              {RATIO_PILLS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField('aspectRatio', opt.value)}
                  style={pillStyle(aspectRatioVal === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Live WYSIWYG Resizable Preview Stage */}
        {previewSrc ? (
          <div
            style={{
              display: 'flex',
              justifyContent: justifyMap[alignmentVal] ?? 'center',
              width: '100%',
              padding: '0.5rem',
              borderRadius: '8px',
              background: 'var(--theme-elevation-50)',
              border: '1px dashed var(--theme-elevation-200)',
            }}
          >
            <div
              ref={figureRef}
              style={{
                position: 'relative',
                ...computeStageWidthStyle(),
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt={captionVal || 'In-editor preview'}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                  aspectRatio: ratioCss,
                  objectFit: ratioCss ? 'cover' : 'contain',
                  borderRadius: '6px',
                  background: '#0d0f17',
                }}
              />

              {isEditable ? (
                <div
                  role="separator"
                  aria-label="Drag to resize image width"
                  title="Drag horizontally to resize width"
                  onPointerDown={startResizeDrag}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: '-6px',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '44px',
                    borderRadius: '6px',
                    background: '#da9100',
                    border: '2px solid #0d0f17',
                    cursor: 'ew-resize',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  }}
                />
              ) : null}

              {captionVal ? (
                <div
                  style={{
                    marginTop: '0.35rem',
                    fontSize: '0.76rem',
                    color: 'var(--theme-elevation-600)',
                    textAlign: 'center',
                  }}
                >
                  {captionVal}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Inline Payload Field Form (shown automatically when no image is chosen yet, or toggled) */}
        {showFields || !previewSrc ? (
          <RenderFields
            fields={formSchema}
            forceRender
            parentIndexPath=""
            parentPath=""
            parentSchemaPath=""
            permissions={true}
            readOnly={!isEditable}
          />
        ) : null}
      </div>
    </BlockCollapsible>
  )
}

export default MediaBlockEditor
