import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { migrations } from '@/migrations'

/**
 * The migration registry against the files on disk.
 *
 * `src/migrations/index.ts` is generated: `payload migrate:create` rewrites it from every `.ts`
 * file in the folder. That makes two failures possible, and both have happened:
 *
 * - the index references a migration the repository does not contain (committed alone while the
 *   folder was in `.gitignore`), so `pnpm typecheck`, `pnpm migrate` and the build all fail;
 * - the folder contains a migration the index does not register, which compiles but never runs —
 *   or, after the next generate, runs twice (`20261022_000244` and the hand-written media-folders
 *   migration create the same tables).
 *
 * Keeping the two lists equal is the invariant. Archived migrations live in `src/migrations/archive`
 * and are deliberately outside it.
 */
const dir = path.join(process.cwd(), 'src', 'migrations')

const files = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .map((file) => file.replace(/\.ts$/, ''))
  .sort()

const registered = migrations.map((migration) => migration.name)

describe('the migration registry', () => {
  it('registers every migration file at the top level', () => {
    expect(files.filter((file) => !registered.includes(file))).toEqual([])
  })

  it('has a file for every registered migration', () => {
    expect(registered.filter((name) => !files.includes(name))).toEqual([])
  })

  it('lists them once each, oldest first', () => {
    expect(new Set(registered).size).toBe(registered.length)
    expect([...registered].sort()).toEqual(registered)
  })

  it('keeps the archived migrations out of the registry', () => {
    const archived = fs.readdirSync(path.join(dir, 'archive')).filter((file) => file.endsWith('.ts'))
    expect(archived.length).toBeGreaterThan(0)
    for (const file of archived) {
      expect(registered, file).not.toContain(file.replace(/\.ts$/, ''))
    }
  })

  it('gives every migration an up and a down', () => {
    for (const migration of migrations) {
      expect(typeof migration.up, migration.name).toBe('function')
      expect(typeof migration.down, migration.name).toBe('function')
    }
  })
})
