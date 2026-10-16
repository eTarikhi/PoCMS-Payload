import { describe, expect, it } from 'vitest'

import { articlePagePath } from '@/app/(frontend)/lib/article-page'
import { formatDisplayDate, formatReadTime } from '@/app/(frontend)/lib/format'
import { DEFAULT_LOCALE, isLocale, localizePath } from '@/i18n/locales'

describe('locale utilities', () => {
  it('keeps English URLs unprefixed and scopes Persian URLs below /fa', () => {
    expect(DEFAULT_LOCALE).toBe('en')
    expect(localizePath('en')).toBe('/')
    expect(localizePath('en', '/articles/payload-localization')).toBe(
      '/articles/payload-localization',
    )
    expect(localizePath('fa')).toBe('/fa')
    expect(articlePagePath('payload-localization', 'fa')).toBe('/fa/articles/payload-localization')
  })

  it('accepts only the configured locale identifiers', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('fa')).toBe(true)
    expect(isLocale('en-US')).toBe(false)
    expect(isLocale('ja')).toBe(false)
  })

  it('formats dates and read-time values in the requested locale', () => {
    expect(formatDisplayDate('2025-02-02T12:00:00.000Z', 'en')).toBe('February 2, 2025')
    expect(formatReadTime(3, 'en')).toBe('3 min')
    expect(formatReadTime(3, 'fa')).toContain('دقیقه')
    expect(formatReadTime(3, 'fa')).not.toBe('3 min')
  })
})
