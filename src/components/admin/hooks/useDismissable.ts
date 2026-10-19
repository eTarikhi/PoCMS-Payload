'use client'

import { type RefObject, useEffect } from 'react'

/** Closes a native <details> menu on Escape (focus back on its summary) and on outside clicks. */
export function useDismissable(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current
      if (!details?.open) return
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return
        details.open = false
        details.querySelector('summary')?.focus()
      } else if (!details.contains(event.target as Node)) {
        details.open = false
      }
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [ref])
}
