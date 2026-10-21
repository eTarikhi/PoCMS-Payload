import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'

/**
 * Payload resolves `namespace:key` — exactly two segments, with `key` a single property. Nested
 * groups therefore cannot be keys; the catalogue is one flat level per namespace. This mirrors that
 * rule, so a dotted key fails the test instead of rendering as raw text in the admin.
 */
const catalog = new Set(
  Object.entries(en).flatMap(([namespace, keys]) =>
    Object.keys(keys).map((key) => `${namespace}:${key}`),
  ),
)

/** Every `.ts`/`.tsx` under src, so the scan cannot miss a component in a new folder. */
const sourceFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full)
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
    }),
  )
  return files.flat()
}

/**
 * The catalogue (P4.5). A missing key in Payload's `t` returns the key itself, which is a visible
 * bug only to whoever looks at that screen — this test makes it a build failure instead.
 */
describe('custom translation catalogue', () => {
  it('has a non-trivial set of keys and no empty strings', () => {
    expect(catalog.size).toBeGreaterThan(20)
    for (const [namespace, strings] of Object.entries(en)) {
      expect(Object.keys(strings).length, `${namespace} is empty`).toBeGreaterThan(0)
    }
    expect(JSON.stringify(en)).not.toContain('""')
  })

  it('defines every key the code asks for', async () => {
    const files = await sourceFiles(path.join(process.cwd(), 'src'))
    const used = new Map<string, string>()
    // Only keys whose namespace is ours: `t('fields:addNew')` belongs to Payload.
    const namespace = Object.keys(en).join('|')
    const pattern = new RegExp(`['"\`]((?:${namespace}):[A-Za-z0-9_]+)['"\`]`, 'g')
    for (const file of files) {
      const source = await fs.readFile(file, 'utf8')
      for (const match of source.matchAll(pattern)) {
        used.set(match[1], path.relative(process.cwd(), file))
      }
    }

    expect(used.size).toBeGreaterThan(0)
    const missing = [...used].filter(([key]) => !catalog.has(key))
    expect(missing.map(([key, file]) => `${key} (${file})`)).toEqual([])
  })

  it('never uses a dotted key, which Payload cannot resolve', () => {
    for (const key of catalog) expect(key).not.toMatch(/\.[A-Za-z]/)
  })

  it('registers the catalogue in the config', async () => {
    const config = await fs.readFile(path.join(process.cwd(), 'src/payload.config.ts'), 'utf8')
    expect(config).toContain('i18n: i18nConfig')
    const i18n = await fs.readFile(path.join(process.cwd(), 'src/i18n/index.ts'), 'utf8')
    expect(i18n).toContain('...customEn')
  })
})
