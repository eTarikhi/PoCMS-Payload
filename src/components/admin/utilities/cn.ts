import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge configured for the admin's Tailwind prefix (ADR 0002): classes are written
 * `acn:px-2 acn:hover:bg-muted`, and conflicting prefixed classes still resolve last-wins.
 */
const twMerge = extendTailwindMerge({ prefix: 'acn' })

/** Joins class names and resolves Tailwind conflicts (e.g. acn:px-2 then acn:px-4 resolves to acn:px-4). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
