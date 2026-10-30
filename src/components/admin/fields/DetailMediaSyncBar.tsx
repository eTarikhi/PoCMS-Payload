'use client'

import { toast, useForm, useFormFields } from '@payloadcms/ui'
import React from 'react'

export function DetailMediaSyncBar() {
  const { addFieldRow, dispatchFields, getDataByPath, setModified } = useForm()

  const snapshot = useFormFields(([fields]) => {
    const detailMode = (fields['detailMedia.mode']?.value as string | undefined) ?? 'single'
    const primaryMode = (fields['primaryMedia.mode']?.value as string | undefined) ?? 'single'
    const primarySourceRaw = fields['primaryMedia.source']?.value as string | undefined
    const primaryMediaVal = fields['primaryMedia.media']?.value
    const primaryUrlVal = fields['primaryMedia.imageUrl']?.value
    const primaryAltVal = fields['primaryMedia.alt']?.value

    const legacyMediaVal = fields['image']?.value
    const legacyUrlVal = fields['imageUrl']?.value ?? fields['src']?.value
    const legacyAltVal = fields['imageAlt']?.value

    const primaryUrl = typeof primaryUrlVal === 'string' ? primaryUrlVal.trim() : ''
    const legacyUrl = typeof legacyUrlVal === 'string' ? legacyUrlVal.trim() : ''
    const effectiveMedia = primaryMediaVal ?? legacyMediaVal ?? null
    const effectiveUrl = primaryUrl || legacyUrl
    const effectiveAlt =
      (typeof primaryAltVal === 'string' && primaryAltVal.trim()) ||
      (typeof legacyAltVal === 'string' && legacyAltVal.trim()) ||
      ''

    const inferredSource: 'upload' | 'url' =
      primarySourceRaw === 'url' || primarySourceRaw === 'upload'
        ? primarySourceRaw
        : effectiveUrl && !effectiveMedia
          ? 'url'
          : 'upload'

    const hasPrimaryImage =
      primaryMode !== 'none' &&
      (inferredSource === 'url' ? Boolean(effectiveUrl) : Boolean(effectiveMedia || effectiveUrl))

    return {
      detailMode,
      inferredSource: inferredSource === 'upload' && !effectiveMedia && effectiveUrl ? 'url' : inferredSource,
      effectiveMedia,
      effectiveUrl,
      effectiveAlt,
      hasPrimaryImage,
    }
  })

  const syncFromPrimary = () => {
    if (!snapshot.hasPrimaryImage) {
      toast.error('Set an image in Primary Media Block first.')
      return
    }

    const existingRows = getDataByPath<unknown[]>('detailMedia.items')
    const hasRows = Array.isArray(existingRows) && existingRows.length > 0

    if (!hasRows) {
      addFieldRow({
        path: 'detailMedia.items',
        schemaPath: 'detailMedia.items',
        subFieldState: {
          source: {
            initialValue: snapshot.inferredSource,
            value: snapshot.inferredSource,
            valid: true,
          },
          media: {
            initialValue: snapshot.inferredSource === 'upload' ? snapshot.effectiveMedia : null,
            value: snapshot.inferredSource === 'upload' ? snapshot.effectiveMedia : null,
            valid: true,
          },
          imageUrl: {
            initialValue: snapshot.inferredSource === 'url' ? snapshot.effectiveUrl : '',
            value: snapshot.inferredSource === 'url' ? snapshot.effectiveUrl : '',
            valid: true,
          },
          alt: {
            initialValue: snapshot.effectiveAlt,
            value: snapshot.effectiveAlt,
            valid: true,
          },
          caption: {
            initialValue: '',
            value: '',
            valid: true,
          },
        },
      })
    } else {
      dispatchFields({
        type: 'UPDATE',
        path: 'detailMedia.items.0.source',
        value: snapshot.inferredSource,
      })
      dispatchFields({
        type: 'UPDATE',
        path: 'detailMedia.items.0.media',
        value: snapshot.inferredSource === 'upload' ? snapshot.effectiveMedia : null,
      })
      dispatchFields({
        type: 'UPDATE',
        path: 'detailMedia.items.0.imageUrl',
        value: snapshot.inferredSource === 'url' ? snapshot.effectiveUrl : '',
      })
      if (snapshot.effectiveAlt) {
        dispatchFields({
          type: 'UPDATE',
          path: 'detailMedia.items.0.alt',
          value: snapshot.effectiveAlt,
        })
      }
      setModified(true)
    }

    toast.success('Mapped Primary Media into Detail Media Item #1.')
  }

  return (
    <div
      style={{
        marginBottom: '0.75rem',
        padding: '0.6rem 0.8rem',
        borderRadius: '8px',
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-50)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.65rem',
      }}
    >
      <div style={{ fontSize: '0.78rem', color: 'var(--theme-elevation-650)', lineHeight: 1.45 }}>
        {snapshot.detailMode === 'gallery'
          ? 'Gallery View renders every item below in sequence on the slug detail page.'
          : 'Single Image View renders Item #1 on the slug detail page (auto-mapped from Primary Media when left empty).'}
      </div>

      <button
        type="button"
        onClick={syncFromPrimary}
        disabled={!snapshot.hasPrimaryImage}
        style={{
          padding: '0.34rem 0.72rem',
          fontSize: '0.76rem',
          fontWeight: 600,
          borderRadius: '6px',
          border: '1px solid var(--theme-elevation-250)',
          background: snapshot.hasPrimaryImage ? 'var(--theme-elevation-100)' : 'transparent',
          color: snapshot.hasPrimaryImage ? 'var(--theme-text)' : 'var(--theme-elevation-450)',
          cursor: snapshot.hasPrimaryImage ? 'pointer' : 'not-allowed',
          flexShrink: 0,
        }}
      >
        Sync Item #1 from Primary Media
      </button>
    </div>
  )
}

export default DetailMediaSyncBar
