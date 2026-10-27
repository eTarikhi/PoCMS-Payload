'use client'

import { useEffect, useId, useRef } from 'react'

import type { HeaderBackgroundPreset } from '@/app/(frontend)/lib/types'

type HeaderBackgroundProps = {
  preset: HeaderBackgroundPreset
  coverUrl?: string | null
}

type NodePoint = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  warm: boolean
}

export function HeaderBackground({ preset, coverUrl }: HeaderBackgroundProps) {
  const rawFilterId = useId()
  const filterId = `pocms-grain-${rawFilterId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const effectivePreset: HeaderBackgroundPreset =
    preset === 'chromatic-cover' && !coverUrl ? 'aurora-grain' : preset

  useEffect(() => {
    if (effectivePreset !== 'constellation-canvas') return
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
    const canvas = canvasRef.current
    if (!canvas || typeof canvas.getContext !== 'function') return
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext('2d')
    } catch {
      ctx = null
    }
    if (!ctx) return

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let rafId = 0
    let isVisible = true
    let width = Math.max(canvas.clientWidth || 960, 320)
    let height = Math.max(canvas.clientHeight || 360, 220)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(canvas.clientWidth || 960, 320)
      height = Math.max(canvas.clientHeight || 360, 220)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()

    const count = Math.min(34, Math.max(18, Math.floor(width / 46)))
    const points: NodePoint[] = Array.from({ length: count }, (_, idx) => ({
      x: ((idx * 97) % 100) * 0.01 * width,
      y: ((idx * 53 + 19) % 100) * 0.01 * height,
      vx: ((idx % 2 === 0 ? 1 : -1) * (0.14 + (idx % 5) * 0.03)),
      vy: (((idx % 3 === 0 ? 1 : -1)) * (0.1 + (idx % 4) * 0.025)),
      radius: idx % 4 === 0 ? 2.1 : 1.35,
      warm: idx % 3 !== 0,
    }))

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height)
      const linkDist = 138

      for (let i = 0; i < points.length; i += 1) {
        const p = points[i]
        if (!reducedMotion) {
          p.x += p.vx
          p.y += p.vy
          if (p.x < 0 || p.x > width) p.vx *= -1
          if (p.y < 0 || p.y > height) p.vy *= -1
        }

        for (let j = i + 1; j < points.length; j += 1) {
          const q = points[j]
          const dx = p.x - q.x
          const dy = p.y - q.y
          const dist = Math.hypot(dx, dy)
          if (dist < linkDist) {
            const alpha = (1 - dist / linkDist) * 0.19
            ctx.strokeStyle = p.warm
              ? `rgba(218, 145, 0, ${alpha.toFixed(3)})`
              : `rgba(93, 173, 226, ${alpha.toFixed(3)})`
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.stroke()
          }
        }

        ctx.fillStyle = p.warm ? 'rgba(255, 196, 72, 0.72)' : 'rgba(147, 197, 232, 0.58)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      if (!reducedMotion && isVisible) {
        rafId = window.requestAnimationFrame(drawFrame)
      }
    }

    drawFrame()

    const onResize = () => {
      resize()
      if (reducedMotion) drawFrame()
    }
    window.addEventListener('resize', onResize)

    let observer: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        ([entry]) => {
          const nextVisible = Boolean(entry?.isIntersecting)
          if (nextVisible && !isVisible && !reducedMotion) {
            isVisible = true
            rafId = window.requestAnimationFrame(drawFrame)
          } else {
            isVisible = nextVisible
            if (!nextVisible && rafId) {
              window.cancelAnimationFrame(rafId)
              rafId = 0
            }
          }
        },
        { threshold: 0.05 },
      )
      observer.observe(canvas)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      if (rafId) window.cancelAnimationFrame(rafId)
      observer?.disconnect()
    }
  }, [effectivePreset])

  if (effectivePreset === 'blueprint-spotlight') {
    return (
      <div
        className="pocms-header-bg"
        data-bg-preset="blueprint-spotlight"
        aria-hidden="true"
      >
        <div className="pocms-header-bg__spotlight" />
        <div className="pocms-header-bg pocms-header-bg--blueprint" />
      </div>
    )
  }

  if (effectivePreset === 'chromatic-cover' && coverUrl) {
    return (
      <div
        className="pocms-header-bg"
        data-bg-preset="chromatic-cover"
        aria-hidden="true"
      >
        <div
          className="pocms-header-bg__cover-wash"
          style={{ backgroundImage: `url("${coverUrl.replace(/"/g, '%22')}")` }}
        />
        <div className="pocms-header-bg__cover-scrim" />
      </div>
    )
  }

  if (effectivePreset === 'constellation-canvas') {
    return (
      <div
        className="pocms-header-bg"
        data-bg-preset="constellation-canvas"
        aria-hidden="true"
      >
        <div className="pocms-header-bg__spotlight" />
        <canvas ref={canvasRef} className="pocms-header-bg__canvas" />
      </div>
    )
  }

  if (effectivePreset === 'obsidian-minimal') {
    return (
      <div
        className="pocms-header-bg pocms-header-bg--minimal"
        data-bg-preset="obsidian-minimal"
        aria-hidden="true"
      />
    )
  }

  // Default: 'aurora-grain'
  return (
    <div
      className="pocms-header-bg pocms-header-bg--aurora"
      data-bg-preset="aurora-grain"
      aria-hidden="true"
    >
      <div className="pocms-header-bg__plume pocms-header-bg__plume--1" />
      <div className="pocms-header-bg__plume pocms-header-bg__plume--2" />
      <div className="pocms-header-bg__plume pocms-header-bg__plume--3" />
      <svg className="pocms-header-bg__grain" xmlns="http://www.w3.org/2000/svg">
        <filter id={filterId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.78"
            numOctaves={3}
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} />
      </svg>
    </div>
  )
}
