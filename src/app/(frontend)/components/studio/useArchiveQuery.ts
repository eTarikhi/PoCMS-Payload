'use client'

import { useSyncExternalStore } from 'react'

const QUERY_EVENT = 'studio:query-change'
const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener)
  window.addEventListener(QUERY_EVENT, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(QUERY_EVENT, listener)
  }
}
const snapshot = () => window.location.search
const serverSnapshot = () => ''

/** URL-backed filters without making static archive routes request-dependent.
 * Typing replaces the current entry; category changes create a history entry.
 * Preserve Next's history state and unrelated query parameters when editing URLs.
 */
export function useArchiveQuery() {
  const search = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const params = new URLSearchParams(search)
  const update = (values: Partial<Record<'q' | 'category', string>>, push = false) => {
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries(values)) {
      if (!value.trim() || (key === 'category' && value === '*')) url.searchParams.delete(key)
      else url.searchParams.set(key, value)
    }
    if (url.href === window.location.href) return
    const target = `${url.pathname}${url.search}${url.hash}`
    if (push) window.history.pushState(window.history.state, '', target)
    else window.history.replaceState(window.history.state, '', target)
    window.dispatchEvent(new Event(QUERY_EVENT))
  }
  return {
    query: params.get('q') || '',
    category: params.get('category') || '*',
    setQuery: (value: string) => update({ q: value }),
    resetFilters: () => update({ q: '', category: '*' }, true),
    setCategory: (value: string) => update({ category: value }, true),
  }
}
