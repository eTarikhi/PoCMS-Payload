import { ImageResponse } from 'next/og'
import React from 'react'

import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { DynamicOgCardKind } from '@/app/(frontend)/lib/seo'

const OG_WIDTH = 1200
const OG_HEIGHT = 630

const sanitizeText = (raw: string | null, maxLen: number, fallback = ''): string => {
  if (!raw) return fallback
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallback
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen - 1).trimEnd()}…`
}

const computeInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'AT'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

const defaultEyebrowForKind = (kind: DynamicOgCardKind): string => {
  switch (kind) {
    case 'article':
      return 'Article'
    case 'project':
      return 'Case Study'
    case 'hub':
      return 'Archive Hub'
    default:
      return 'Portfolio'
  }
}

/**
 * SEO Milestone 2.D — Branded `1200×630` Dynamic Open Graph Card Generator (`GET /og`).
 * Serves crawler-friendly PNG social cards (outside `/api/*` so `robots.txt` allows indexing
 * by Twitterbot, LinkedInBot, Slackbot, Discordbot, and Googlebot-Image) for Articles,
 * Projects, and Archive Hubs without a custom `meta.image`.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)

  const rawKind = searchParams.get('kind')
  const kind: DynamicOgCardKind =
    rawKind === 'article' || rawKind === 'project' || rawKind === 'hub' || rawKind === 'site'
      ? rawKind
      : 'site'

  const title = sanitizeText(searchParams.get('title'), 120, DEFAULT_SITE_SETTINGS.siteTitle)
  const subtitle = sanitizeText(searchParams.get('subtitle'), 180, '')
  const eyebrow = sanitizeText(
    searchParams.get('eyebrow'),
    48,
    defaultEyebrowForKind(kind),
  ).toUpperCase()
  const meta = sanitizeText(searchParams.get('meta'), 64, '')
  const author = sanitizeText(searchParams.get('author'), 48, DEFAULT_SITE_SETTINGS.ownerName)
  const siteName = sanitizeText(searchParams.get('site'), 56, DEFAULT_SITE_SETTINGS.siteName)

  const rawTags = searchParams.get('tags') || ''
  const tags = rawTags
    .split(',')
    .map((item) => sanitizeText(item, 28, ''))
    .filter(Boolean)
    .slice(0, 4)

  const titleFontSize = title.length > 78 ? 40 : title.length > 52 ? 48 : 56
  const initials = computeInitials(author)

  const card = (
    <div
      style={{
        width: `${OG_WIDTH}px`,
        height: `${OG_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '54px 64px',
        background: 'linear-gradient(138deg, #07090f 0%, #0d0f17 54%, #161d31 100%)',
        color: '#f8f9fc',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Top Solar-Gold Specular Hairline */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: '96px',
          right: '96px',
          height: '4px',
          background:
            'linear-gradient(90deg, rgba(218,145,0,0) 0%, #ffc448 50%, rgba(218,145,0,0) 100%)',
        }}
      />

      {/* Ambient Warm Gold & Cool Slate Glow Accents */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '-140px',
          right: '-110px',
          width: '460px',
          height: '460px',
          borderRadius: '9999px',
          background: 'radial-gradient(circle, rgba(218, 145, 0, 0.22) 0%, rgba(218, 145, 0, 0) 70%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '-160px',
          left: '-90px',
          width: '440px',
          height: '440px',
          borderRadius: '9999px',
          background: 'radial-gradient(circle, rgba(52, 73, 94, 0.36) 0%, rgba(52, 73, 94, 0) 72%)',
        }}
      />

      {/* Inner Architectural Frame */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '40px 46px',
          borderRadius: '24px',
          border: '1px solid rgba(255, 196, 72, 0.24)',
          backgroundColor: 'rgba(15, 19, 31, 0.72)',
        }}
      >
        {/* Top Row: Eyebrow Badge + Optional Meta Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 18px',
              borderRadius: '999px',
              backgroundColor: 'rgba(218, 145, 0, 0.16)',
              border: '1px solid rgba(255, 196, 72, 0.42)',
              color: '#ffc448',
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            {eyebrow}
          </div>

          {meta ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '7px 16px',
                borderRadius: '999px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cfc4ad',
                fontSize: '15px',
                fontWeight: 600,
              }}
            >
              {meta}
            </div>
          ) : null}
        </div>

        {/* Center Stack: Title + Subtitle + Optional Tags */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            marginTop: '12px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: `${titleFontSize}px`,
              fontWeight: 700,
              lineHeight: 1.16,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </div>

          {subtitle ? (
            <div
              style={{
                display: 'flex',
                color: '#cfc4ad',
                fontSize: '23px',
                fontWeight: 400,
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </div>
          ) : null}

          {tags.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                marginTop: '4px',
              }}
            >
              {tags.map((tag, index) => (
                <div
                  key={`${tag}-${index}`}
                  style={{
                    display: 'flex',
                    padding: '5px 14px',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(52, 73, 94, 0.42)',
                    border: '1px solid rgba(207, 196, 173, 0.22)',
                    color: '#e7e7e7',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Bottom Attribution Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '42px',
                height: '42px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #ffc448 0%, #da9100 100%)',
                color: '#090b12',
                fontSize: '17px',
                fontWeight: 700,
              }}
            >
              {initials}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', color: '#f8f9fc', fontSize: '18px', fontWeight: 700 }}>
                {author}
              </div>
              <div style={{ display: 'flex', color: '#cfc4ad', fontSize: '14px', fontWeight: 400 }}>
                {siteName}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              color: '#ffc448',
              fontSize: '15px',
              fontWeight: 600,
              letterSpacing: '0.03em',
            }}
          >
            1200 × 630 • PoCMS
          </div>
        </div>
      </div>
    </div>
  )

  const response = new ImageResponse(card, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
  })

  response.headers.set(
    'Cache-Control',
    'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
  )

  return response
}
