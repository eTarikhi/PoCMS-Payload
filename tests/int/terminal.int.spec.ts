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
