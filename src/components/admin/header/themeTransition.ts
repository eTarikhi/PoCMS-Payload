/**
 * Switches the admin theme with a circular reveal from `origin` (the clicked control), using the
 * View Transitions API where available. Without it, or with reduced motion, it switches instantly.
 * Payload's setTheme updates html[data-theme] synchronously, which the transition snapshots.
 */
export function switchTheme(
  setTheme: (theme: 'light' | 'dark') => void,
  next: 'light' | 'dark',
  origin?: { x: number; y: number },
): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (typeof document.startViewTransition !== 'function' || reduceMotion) {
    setTheme(next)
    return
  }
  const root = document.documentElement
  root.style.setProperty('--theme-reveal-x', `${origin?.x ?? window.innerWidth}px`)
  root.style.setProperty('--theme-reveal-y', `${origin?.y ?? 0}px`)
  root.dataset.themeTransition = ''
  const transition = document.startViewTransition(() => setTheme(next))
  void transition.finished.finally(() => delete root.dataset.themeTransition)
}
