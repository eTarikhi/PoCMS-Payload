import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * TailAdmin ships a handful of custom utilities that stock `tailwind-merge`
 * does not know about (`text-theme-sm`, `text-title-sm`, `shadow-theme-xs`, ...).
 * Teaching tailwind-merge about them keeps `cn()` from dropping classes it
 * mistakenly believes are duplicates (e.g. `text-theme-sm` vs `text-gray-500`).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'theme-xs',
            'theme-sm',
            'theme-xl',
            'title-sm',
            'title-md',
            'title-lg',
            'title-xl',
            'title-2xl',
          ],
        },
      ],
      shadow: [
        {
          shadow: [
            'theme-xs',
            'theme-sm',
            'theme-md',
            'theme-lg',
            'theme-xl',
            'focus-ring',
            'tooltip',
          ],
        },
      ],
    },
  },
})

/**
 * Conditional class-name combiner — the TailAdmin `cn()` helper
 * (upstream: `src/utils/index.ts`).
 *
 * @example cn('bg-white', isActive && 'text-black', 'px-4') // => 'bg-white text-black px-4'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
