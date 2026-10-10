'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

// Thin amber bar at the top of the article that shows how far the reader has scrolled (article page spec §5.2).
// It only changes `transform`, and it is hidden when the reader prefers reduced motion (§9).
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const subscribeToReducedMotion = (onChange: () => void) => {
  if (!window.matchMedia) return () => {}
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const readReducedMotion = () => (window.matchMedia ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false)

// The server has no window, so it renders the bar. The client switches to "hidden" when needed.
const serverReducedMotion = () => false

export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null)
  const reduced = useSyncExternalStore(subscribeToReducedMotion, readReducedMotion, serverReducedMotion)

  useEffect(() => {
    if (reduced) return

    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const ratio = scrollable > 0 ? Math.min(Math.max(window.scrollY / scrollable, 0), 1) : 0
      if (barRef.current) barRef.current.style.transform = `scaleX(${ratio})`
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [reduced])

  if (reduced) return null

  return <div ref={barRef} className="article-progress" aria-hidden="true" />
}
