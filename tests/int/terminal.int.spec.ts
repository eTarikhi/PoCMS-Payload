import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  TERMINAL_SCRIPTS,
  commandFor,
  isTerminalEnabled,
  optionsFor,
  scriptBySlug,
} from '@/terminal/scripts'

/** The terminal's allow-list (CR-12 E7): fixed commands, development only, no user input. */
describe('Terminal allow-list', () => {
  it('is enabled in development and tests, never in production', () => {
    expect(isTerminalEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(isTerminalEnabled({ NODE_ENV: 'test' })).toBe(true)
    expect(isTerminalEnabled({})).toBe(true)
    expect(isTerminalEnabled({ NODE_ENV: 'production' })).toBe(false)
  })

  it('has unique slugs and only pnpm run invocations', () => {
    const slugs = TERMINAL_SCRIPTS.map((script) => script.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const script of TERMINAL_SCRIPTS) {
      const { command, args } = commandFor(script)
      expect(command).toBe('pnpm')
      expect(args[0]).toBe('run')
      // Every argument comes from this file: only the declared script name may follow.
      expect(args).toHaveLength(2)
      expect(args[1]).toMatch(/^[a-z0-9:-]+$/)
      expect(script.timeoutMs).toBeGreaterThan(0)
      expect(script.timeoutMs).toBeLessThanOrEqual(15 * 60_000)
    }
  })

  it('names package.json scripts only, and never passes arguments of its own', () => {
    const { scripts } = JSON.parse(
      readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf-8'),
    ) as { scripts: Record<string, string> }

    for (const script of TERMINAL_SCRIPTS) {
      const name = commandFor(script).args[1]
      expect(Object.prototype.hasOwnProperty.call(scripts, name)).toBe(true)
      // A command that needs a flag gets a package.json script with the flag baked in,
      // so the browser only ever sends a slug: even when the endpoint runs it through a
      // shell, every argument on the command line is a literal from this file.
      expect(commandFor(script).shell).toBe(script.shell === true)
    }
  })

  it('marks the commands that touch the database', () => {
    const database = TERMINAL_SCRIPTS.filter((script) => script.database).map((s) => s.slug)
    expect(database).toEqual(['seed-load'])
    for (const script of TERMINAL_SCRIPTS) {
      // Changing rows is also a write: the console warns about both, the stronger first.
      if (script.database) expect(script.writes).toBe(true)
    }
    expect(optionsFor().find((option) => option.slug === 'seed-load')?.database).toBe(true)
    expect(optionsFor().find((option) => option.slug === 'lint')?.database).toBe(false)
    // The shell is an implementation detail of the endpoint, not of the client.
    expect(Object.keys(optionsFor()[0] ?? {})).not.toContain('shell')
  })

  it('offers the neon database commands on the allow-list', () => {
    expect(scriptBySlug('schema-from')?.label).toBe('Migration from this database')
    expect(scriptBySlug('seed-pull')?.label).toBe('Seed from this database')
    expect(scriptBySlug('seed-load')?.label).toBe('Load that seed into the local database')
    expect(commandFor(scriptBySlug('schema-from')!).args[1]).toBe('db:schema-from:neon')
    expect(commandFor(scriptBySlug('seed-pull')!).args[1]).toBe('db:seed-from:neon')
    expect(commandFor(scriptBySlug('seed-load')!).args[1]).toBe('db:seed-load')
  })

  it('does not expose the dev server, the build or destructive commands', () => {
    const slugs = TERMINAL_SCRIPTS.map((script) => script.slug)
    for (const forbidden of ['dev', 'start', 'build', 'seed', 'migrate', 'shell']) {
      expect(slugs).not.toContain(forbidden)
    }
  })

  it('resolves slugs, rejects everything else and marks writing commands', () => {
    expect(scriptBySlug('contrast')?.label).toBe('Contrast check')
    expect(scriptBySlug('rm -rf /')).toBeUndefined()
    expect(scriptBySlug('')).toBeUndefined()
    expect(scriptBySlug(null)).toBeUndefined()
    const options = optionsFor()
    expect(options.find((option) => option.slug === 'generate')?.writes).toBe(true)
    expect(options.find((option) => option.slug === 'lint')?.writes).toBe(false)
    // The timeout is expressed in seconds for the client.
    expect(options.every((option) => option.timeoutSeconds > 0)).toBe(true)
  })
})
