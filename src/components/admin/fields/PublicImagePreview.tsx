'use client'

import { useField } from '@payloadcms/ui'
import React, { useMemo, useState } from 'react'

type PublicAssetEntry = {
  path: string
  filename: string
  folder: string
  sizeBytes: number
  width: number | null
  height: number | null
}

type AfterInputProps = {
  path?: string
  field?: { name?: string }
}

const extractUnderlyingSource = (val: string): string => {
  if (!val.startsWith('/api/media-frame')) return val
  try {
    const parsed = new URL(val, 'http://localhost')
    return parsed.searchParams.get('src') || val
  } catch {
    return val
  }
}

export function PublicImagePreview(props: AfterInputProps) {
  const resolvedPath = props.path ?? props.field?.name ?? 'imageUrl'
  const { value, setValue } = useField<string>({ path: resolvedPath })

  const currentUrl = typeof value === 'string' ? value.trim() : ''
  const isFramed = currentUrl.startsWith('/api/media-frame')
  const rawSource = useMemo(() => extractUnderlyingSource(currentUrl), [currentUrl])

  const [browserOpen, setBrowserOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [assets, setAssets] = useState<PublicAssetEntry[]>([])
  const [search, setSearch] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const openBrowser = async () => {
    const nextOpen = !browserOpen
    setBrowserOpen(nextOpen)
    if (!nextOpen || assets.length > 0) return

    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/public-images', { credentials: 'include' })
      if (!res.ok) {
        setErrorMsg('Unable to load /public/images catalog.')
        return
      }
      const json = (await res.json()) as { items?: PublicAssetEntry[] }
      setAssets(Array.isArray(json.items) ? json.items : [])
    } catch {
      setErrorMsg('Network error loading /public/images.')
    } finally {
      setLoading(false)
    }
  }

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return assets
    return assets.filter(
      (item) =>
        item.path.toLowerCase().includes(q) || item.folder.toLowerCase().includes(q),
    )
  }, [assets, search])

  const canFrameWithOg =
    rawSource.startsWith('/images/') ||
    rawSource.includes('.public.blob.vercel-storage.com')

  const toggleOgWebpFrame = () => {
    if (!rawSource) return
    if (isFramed) {
      setValue(rawSource)
    } else {
      setValue(`/api/media-frame?src=${encodeURIComponent(rawSource)}&mode=card`)
    }
  }

  return (
    <div
      style={{
        marginTop: '0.55rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={openBrowser}
          style={{
            padding: '0.32rem 0.7rem',
            fontSize: '0.78rem',
            fontWeight: 600,
            borderRadius: '6px',
            border: '1px solid var(--theme-elevation-200)',
            background: 'var(--theme-elevation-100)',
            color: 'var(--theme-text)',
            cursor: 'pointer',
          }}
        >
          {browserOpen ? 'Close /public/images Browser' : 'Browse Existing /public/images'}
        </button>

        {currentUrl && canFrameWithOg ? (
          <button
            type="button"
            onClick={toggleOgWebpFrame}
            style={{
              padding: '0.32rem 0.7rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid var(--theme-elevation-250)',
              background: isFramed ? 'rgba(218, 145, 0, 0.18)' : 'var(--theme-elevation-50)',
              color: 'var(--theme-text)',
              cursor: 'pointer',
            }}
          >
            {isFramed
              ? '✓ Framed via ImageResponse WebP (Use Raw URL)'
              : 'Frame 16:9 via ImageResponse WebP'}
          </button>
        ) : null}

        {currentUrl ? (
          <button
            type="button"
            onClick={() => setValue('')}
            style={{
              padding: '0.32rem 0.6rem',
              fontSize: '0.76rem',
              borderRadius: '6px',
              border: '1px solid var(--theme-elevation-200)',
              background: 'transparent',
              color: 'var(--theme-elevation-650)',
              cursor: 'pointer',
            }}
          >
            Clear URL
          </button>
        ) : null}
      </div>

      {currentUrl ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.65rem',
            borderRadius: '8px',
            border: '1px solid var(--theme-elevation-150)',
            background: 'var(--theme-elevation-50)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt="Selected URL preview"
            style={{
              width: '88px',
              height: '52px',
              objectFit: 'cover',
              borderRadius: '6px',
              background: '#0d0f17',
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, fontSize: '0.76rem', lineHeight: 1.4 }}>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--theme-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {rawSource}
            </div>
            <div style={{ color: 'var(--theme-elevation-600)' }}>
              {isFramed
                ? 'Delivered via Next.js ImageResponse 16:9 canvas + multi-size WebP'
                : 'Delivered via Next.js responsive srcset + WebP'}
            </div>
          </div>
        </div>
      ) : null}

      {browserOpen ? (
        <div
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--theme-elevation-200)',
            background: 'var(--theme-elevation-50)',
          }}
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter /images/... (e.g. articles, projects, profile)"
            style={{
              width: '100%',
              padding: '0.42rem 0.65rem',
              marginBottom: '0.65rem',
              fontSize: '0.8rem',
              borderRadius: '6px',
              border: '1px solid var(--theme-elevation-200)',
              background: 'var(--theme-input-bg, var(--theme-bg))',
              color: 'var(--theme-text)',
            }}
          />

          {loading ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--theme-elevation-600)' }}>
              Scanning /public/images…
            </div>
          ) : errorMsg ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--theme-error-500)' }}>{errorMsg}</div>
          ) : filteredAssets.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--theme-elevation-600)' }}>
              No matching images in /public/images.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
                gap: '0.55rem',
                maxHeight: '240px',
                overflowY: 'auto',
              }}
            >
              {filteredAssets.map((asset) => {
                const selected = rawSource === asset.path
                return (
                  <button
                    key={asset.path}
                    type="button"
                    onClick={() => {
                      setValue(asset.path)
                      setBrowserOpen(false)
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      padding: '0.35rem',
                      borderRadius: '6px',
                      border: selected
                        ? '2px solid #da9100'
                        : '1px solid var(--theme-elevation-150)',
                      background: 'var(--theme-bg)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.path}
                      alt={asset.filename}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '68px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        background: '#0d0f17',
                      }}
                    />
                    <span
                      style={{
                        marginTop: '0.3rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'var(--theme-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={asset.path}
                    >
                      {asset.filename}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--theme-elevation-550)' }}>
                      {asset.folder}
                      {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default PublicImagePreview
