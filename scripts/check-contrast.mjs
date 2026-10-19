#!/usr/bin/env node
/**
 * WCAG 2.2 contrast check for the admin design tokens (src/styles/admin/tokens.css).
 *
 * Tier 2 tokens point at Payload variables, so this script resolves them with the Payload 3.90
 * palette below plus the hex values parsed from tokens.css (brand primitives, the light canvas
 * with its tinted steps, and the navy-tinted dark neutrals). It fails (exit 1) when a pair is
 * below its threshold:
 *   text  4.5:1  (WCAG 1.4.3, normal text)
 *   ui    3.0:1  (WCAG 1.4.11, focus rings, icons, chart strokes)
 *
 *   node scripts/check-contrast.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'src/styles/admin/tokens.css'), 'utf8')

/** Reads `--name: #hex` from a block selected by `scope` (':root' or "html[data-theme='dark']"). */
function hexVars(scope) {
  const start = css.indexOf(`${scope} {`)
  if (start === -1) throw new Error(`Block ${scope} not found in tokens.css`)
  const block = css.slice(start, css.indexOf('}', start))
  const out = {}
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi))
    out[m[1]] = m[2].toLowerCase()
  return out
}

const rootHex = hexVars(':root')
const darkHex = hexVars("html[data-theme='dark']")

// Payload 3.90 palette (node_modules/@payloadcms/next/dist/prod/styles.css).
const payload = {
  light: {
    'elevation-0': '#ffffff',
    'elevation-600': '#656565',
    'elevation-800': '#2f2f2f',
    'error-600': '#b63636',
    'error-100': '#fce5e3',
    'success-600': '#0b6e99',
    'success-100': '#daedf8',
    'warning-600': '#96570b',
    'warning-100': '#f8e8db',
  },
  dark: {
    'elevation-0': darkHex['theme-elevation-0'],
    'elevation-50': darkHex['theme-elevation-50'],
    'elevation-100': darkHex['theme-elevation-100'],
    'elevation-600': '#b5b5b5', // base-300
    'elevation-1000': '#ffffff',
    'error-600': '#f66d67', // flips to error-400
    'error-100': '#40201d', // flips to error-900
    'success-600': '#24a4df', // flips to success-400
    'success-100': '#132c3a', // flips to success-900
    'warning-600': '#df8411', // flips to warning-400
    'warning-100': '#382614', // flips to warning-900
  },
}

const themes = {
  light: {
    // The light canvas and the tinted steps come from tokens.css; surfaces stay white.
    background: rootHex['theme-bg'],
    foreground: payload.light['elevation-800'],
    card: payload.light['elevation-0'],
    muted: rootHex['theme-elevation-50'],
    'muted-foreground': payload.light['elevation-600'],
    primary: rootHex['brand-amber-700'],
    'primary-foreground': rootHex['brand-on-light'],
    destructive: payload.light['error-600'],
    'destructive-foreground': payload.light['elevation-0'],
    'destructive-soft': payload.light['error-100'],
    success: payload.light['success-600'],
    'success-soft': payload.light['success-100'],
    warning: payload.light['warning-600'],
    'warning-soft': payload.light['warning-100'],
  },
  dark: {
    background: payload.dark['elevation-0'],
    foreground: payload.dark['elevation-1000'],
    card: payload.dark['elevation-50'],
    muted: payload.dark['elevation-50'],
    'muted-foreground': payload.dark['elevation-600'],
    primary: rootHex['brand-amber-500'],
    'primary-foreground': rootHex['brand-navy-900'],
    destructive: payload.dark['error-600'],
    'destructive-foreground': rootHex['brand-navy-900'],
    'destructive-soft': payload.dark['error-100'],
    success: payload.dark['success-600'],
    'success-soft': payload.dark['success-100'],
    warning: payload.dark['warning-600'],
    'warning-soft': payload.dark['warning-100'],
  },
}

// [foreground token, background token, kind]
const pairs = [
  ['foreground', 'background', 'text'],
  ['foreground', 'card', 'text'],
  ['muted-foreground', 'background', 'text'],
  ['muted-foreground', 'card', 'text'],
  ['muted-foreground', 'muted', 'text'],
  ['primary-foreground', 'primary', 'text'],
  ['primary', 'background', 'text'],
  ['primary', 'card', 'text'],
  ['destructive', 'background', 'text'],
  ['destructive', 'card', 'text'],
  ['destructive', 'destructive-soft', 'text'],
  ['destructive-foreground', 'destructive', 'text'],
  ['success', 'background', 'text'],
  ['success', 'success-soft', 'text'],
  ['warning', 'background', 'text'],
  ['warning', 'warning-soft', 'text'],
  ['primary', 'background', 'ui'], // focus ring (--ring = --primary)
]

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

let failures = 0
const lines = ['| Theme | Pair | Colours | Ratio | Needs | Result |', '|---|---|---|---|---|---|']
for (const [theme, tokens] of Object.entries(themes)) {
  for (const [fg, bg, kind] of pairs) {
    const a = tokens[fg]
    const b = tokens[bg]
    if (!a || !b) throw new Error(`Missing value for ${theme} ${fg}/${bg}`)
    const r = ratio(a, b)
    const needs = kind === 'text' ? 4.5 : 3
    const ok = r >= needs
    if (!ok) failures++
    lines.push(
      `| ${theme} | \`${fg}\` on \`${bg}\` | ${a} / ${b} | ${r.toFixed(2)}:1 | ${needs}:1 | ${ok ? 'pass' : '**FAIL**'} |`,
    )
  }
}

console.log(lines.join('\n'))
if (failures > 0) {
  console.error(`\n${failures} token pair(s) below WCAG AA.`)
  process.exit(1)
}
console.log('\nAll token pairs meet WCAG 2.2 AA.')
