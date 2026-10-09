/**
 * Contrast check for the article reading layer (article page spec §2, §8, §9, F-A1).
 * Pure computation (WCAG 2.x relative luminance). No database is needed.
 *
 * The pairs are read from styles/article.css, so the check tests the colors that actually ship.
 * If a color in the stylesheet changes, the expected value below must change too, and the test shows it.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(
  path.resolve(__dirname, '../../src/app/(frontend)/styles/article.css'),
  'utf8',
)

const channel = (value: number): number => {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (hex: string): number => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two hex colors. */
const ratio = (a: string, b: string): number => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const BACKGROUND = '#0d0f17'
const AMBER = '#da9100'

describe('article reading layer contrast (WCAG AA = 4.5:1 for text)', () => {
  it('uses the stylesheet colors this check was written against', () => {
    // If one of these disappears, the pair below no longer matches the shipped CSS.
    for (const color of ['#0d0f17', '#e7e7e7', '#fff', '#ddd', '#cfc4ad', '#da9100', '#ffc448', '#34495e']) {
      expect(css.toLowerCase(), `missing ${color}`).toContain(color)
    }
  })

  const textPairs: Array<[string, string, string]> = [
    ['body text', '#e7e7e7', BACKGROUND],
    ['title', '#fff', BACKGROUND],
    ['excerpt', '#ddd', BACKGROUND],
    ['meta row', '#cfc4ad', BACKGROUND],
    ['links', '#ffc448', BACKGROUND],
    ['link hover', AMBER, BACKGROUND],
    ['category badge text', BACKGROUND, AMBER],
    ['primary CTA text (not-found page)', BACKGROUND, AMBER],
  ]

  for (const [label, foreground, background] of textPairs) {
    it(`${label}: ${foreground} on ${background} passes AA`, () => {
      expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('the badge and CTA pairing is the AAA choice (dark text on amber, F-A1)', () => {
    expect(ratio(BACKGROUND, AMBER)).toBeGreaterThanOrEqual(7)
  })

  it('white on amber (the homepage btn-primary) is recorded as a failure, not used here', () => {
    // F-A1: the homepage button fails AA. This test keeps the finding visible.
    expect(ratio('#fff', AMBER)).toBeLessThan(4.5)
  })
})
