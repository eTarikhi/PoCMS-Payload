import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'

/** Flattens `en.custom` into `widgets.fields.collection` style paths. */
const flatten = (value: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) => {
    const name = prefix ? `${prefix}.${key}` : key
    return typeof child === 'object' && child !== null
      ? flatten(child as Record<string, unknown>, name)
      : [name]
  })

const catalog = new Set(flatten(en.custom))

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
 * The `custom` namespace (P4.5). A missing key in Payload's `t` returns the key itself, which is a
 * visible bug only to whoever looks at that screen — this test makes it a build failure instead.
 */
describe('custom translation catalogue', () => {
  it('has a non-trivial set of keys and no empty strings', () => {
    expect(catalog.size).toBeGreaterThan(20)
    for (const [group, strings] of Object.entries(en.custom)) {
      expect(Object.keys(strings).length, `${group} is empty`).toBeGreaterThan(0)
    }
    const values = JSON.stringify(en.custom)
    expect(values).not.toContain('""')
  })

  it('defines every `custom:` key the code asks for', async () => {
    const files = await sourceFiles(path.join(process.cwd(), 'src'))
    const used = new Map<string, string>()
    for (const file of files) {
      const source = await fs.readFile(file, 'utf8')
      for (const match of source.matchAll(/['"`](custom:[A-Za-z0-9_.]+)['"`]/g)) {
        used.set(match[1], path.relative(process.cwd(), file))
      }
    }

    expect(used.size).toBeGreaterThan(0)
    const missing = [...used].filter(([key]) => !catalog.has(key.slice('custom:'.length)))
    expect(missing.map(([key, file]) => `${key} (${file})`)).toEqual([])
  })

  it('registers the catalogue in the config', async () => {
    const config = await fs.readFile(path.join(process.cwd(), 'src/payload.config.ts'), 'utf8')
    expect(config).toContain('i18n: i18nConfig')
    const i18n = await fs.readFile(path.join(process.cwd(), 'src/i18n/index.ts'), 'utf8')
    expect(i18n).toContain('...customEn')
  })
})
