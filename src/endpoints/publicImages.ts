import fs from 'node:fs/promises'
import { ImageResponse } from 'next/og'
import type { Endpoint } from 'payload'
import React from 'react'
import sharp from 'sharp'

import { hasAnyRole } from '@/access/permissions'
import { listPublicImages, resolveSafePublicImagePath } from '@/lib/staticImageMeta'

export const RESPONSIVE_FRAME_WIDTHS = [400, 640, 800, 1080, 1200, 1600] as const

export const clampResponsiveFrameWidth = (rawWidth: string | null | undefined): number => {
  const parsed = Number.parseInt(String(rawWidth ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1200
  let closest: number = RESPONSIVE_FRAME_WIDTHS[0]
  let smallestDiff = Math.abs(parsed - closest)
  for (const candidate of RESPONSIVE_FRAME_WIDTHS) {
    const diff = Math.abs(parsed - candidate)
    if (diff < smallestDiff) {
      closest = candidate
      smallestDiff = diff
    }
  }
  return closest
}

export const isAllowedBlobImageUrl = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.public.blob.vercel-storage.com') &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

async function loadAllowedSourceBuffer(src: string): Promise<Buffer | null> {
  const localPath = resolveSafePublicImagePath(src)
  if (localPath) {
    try {
      return await fs.readFile(localPath)
    } catch {
      return null
    }
  }

  if (isAllowedBlobImageUrl(src)) {
    try {
      const response = await fetch(src, { signal: AbortSignal.timeout(8_000) })
      if (!response.ok) return null
      const arrayBuf = await response.arrayBuffer()
      if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > 15 * 1024 * 1024) return null
      return Buffer.from(arrayBuf)
    } catch {
      return null
    }
  }

  return null
}

/**
 * `GET /api/public-images` — Authenticated Admin catalog of pre-uploaded assets in `public/images/**`.
 */
export const publicImagesEndpoint: Endpoint = {
  path: '/public-images',
  method: 'get',
  handler: async (req) => {
    if (!hasAnyRole(req.user)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(req.url || 'http://localhost/api/public-images')
    const query = url.searchParams.get('q')
    const items = await listPublicImages(query)

    return Response.json({
      total: items.length,
      items,
    })
  },
}

/**
 * `GET /api/media-frame?src=/images/...&w=800&mode=contain|card`
 * Renders a pre-uploaded `imageUrl` (`/images/**` or Vercel Blob) through Next.js `ImageResponse`
 * (`next/og`) onto a normalized 16:9 canvas and transcodes the output to optimized `image/webp`
 * at the requested responsive width (`400` | `640` | `800` | `1080` | `1200` | `1600`).
 */
export const mediaFrameEndpoint: Endpoint = {
  path: '/media-frame',
  method: 'get',
  handler: async (req) => {
    const reqUrl = new URL(req.url || 'http://localhost/api/media-frame')
    const src = reqUrl.searchParams.get('src')?.trim() ?? ''
    if (!src) {
      return Response.json({ error: 'Missing "src" query parameter.' }, { status: 400 })
    }

    const rawBuffer = await loadAllowedSourceBuffer(src)
    if (!rawBuffer) {
      return Response.json(
        { error: 'Unsupported or missing pre-uploaded image source.' },
        { status: 404 },
      )
    }

    const targetWidth = clampResponsiveFrameWidth(reqUrl.searchParams.get('w'))
    const mode = reqUrl.searchParams.get('mode') === 'card' ? 'card' : 'contain'
    const caption = reqUrl.searchParams.get('caption')?.trim().slice(0, 120) || ''

    try {
      // Normalize input to PNG data URI so Satori (`ImageResponse`) renders WebP/AVIF/JPEG/SVG reliably.
      const { data: normalizedPng, info: pngInfo } = await sharp(rawBuffer, {
        limitInputPixels: 64_000_000,
      })
        .resize(1520, 840, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true })
      const dataUri = `data:image/png;base64,${normalizedPng.toString('base64')}`

      const maxStageW = mode === 'card' ? 1460 : 1540
      const maxStageH = caption ? 740 : mode === 'card' ? 790 : 840
      const srcW = Math.max(1, pngInfo.width || 1200)
      const srcH = Math.max(1, pngInfo.height || 675)
      const fitScale = Math.min(maxStageW / srcW, maxStageH / srcH)
      const renderW = Math.max(1, Math.round(srcW * fitScale))
      const renderH = Math.max(1, Math.round(srcH * fitScale))

      const frameElement = React.createElement(
        'div',
        {
          style: {
            width: '1600px',
            height: '900px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(145deg, #07090f 0%, #0d0f17 55%, #161c2e 100%)',
            padding: mode === 'card' ? '44px' : '24px',
            position: 'relative',
          },
        },
        React.createElement('div', {
          style: {
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: '160px',
            right: '160px',
            height: '3px',
            background:
              'linear-gradient(90deg, rgba(218,145,0,0) 0%, #ffc448 50%, rgba(218,145,0,0) 100%)',
          },
        }),
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              flex: 1,
              borderRadius: mode === 'card' ? '20px' : '12px',
              border: mode === 'card' ? '1px solid rgba(255, 196, 72, 0.28)' : 'none',
              backgroundColor: mode === 'card' ? 'rgba(18, 22, 36, 0.85)' : 'transparent',
              overflow: 'hidden',
              padding: mode === 'card' ? '18px' : '0px',
            },
          },
          React.createElement('img', {
            src: dataUri,
            alt: caption || 'Article media',
            width: renderW,
            height: renderH,
            style: {
              width: `${renderW}px`,
              height: `${renderH}px`,
              borderRadius: '10px',
            },
          }),
        ),
        caption
          ? React.createElement(
              'div',
              {
                style: {
                  marginTop: '16px',
                  color: '#cfc4ad',
                  fontSize: '24px',
                  fontWeight: 600,
                },
              },
              caption,
            )
          : null,
      )

      const ogResponse = new ImageResponse(frameElement, {
        width: 1600,
        height: 900,
      })

      const pngCompositeBuffer = Buffer.from(await ogResponse.arrayBuffer())
      const targetHeight = Math.round((targetWidth * 9) / 16)
      const webpBuffer = await sharp(pngCompositeBuffer)
        .resize(targetWidth, targetHeight, { fit: 'cover' })
        .webp({ quality: 84 })
        .toBuffer()

      return new Response(new Uint8Array(webpBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to render responsive WebP media frame.',
        },
        { status: 500 },
      )
    }
  },
}
