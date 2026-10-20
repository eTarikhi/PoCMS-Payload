import { describe, expect, it } from 'vitest'

import { DEFAULT_NAVIGATION, mapNavigation, mapSiteSettings } from '@/app/(frontend)/lib/mappers'
import { navigationData } from '@/seed/navigation'
import type { Navigation, SiteSetting } from '@/payload-types'

/** The Navigation global: a fresh database must still show the original bar. */
describe('mapNavigation', () => {
  it('falls back to the original links when the global was never saved', () => {
    const navigation = mapNavigation({ id: 1 } as unknown as Navigation)
    expect(navigation).toEqual(DEFAULT_NAVIGATION)
  })

  it('falls back per side, so saving only one side keeps the other', () => {
    const navigation = mapNavigation({
      id: 1,
      brand: 'Acme',
      primaryLinks: [{ label: 'Home', href: '/#home', newTab: false }],
    } as unknown as Navigation)
    expect(navigation.brand).toBe('Acme')
    expect(navigation.primaryLinks).toEqual([{ label: 'Home', href: '/#home', newTab: false }])
    expect(navigation.secondaryLinks).toEqual(DEFAULT_NAVIGATION.secondaryLinks)
  })

  it('keeps a blank brand on the default', () => {
    expect(mapNavigation({ id: 1, brand: '   ' } as unknown as Navigation).brand).toBe('eTarikhi')
  })

  it('maps external links with their new-tab flag', () => {
    const navigation = mapNavigation({
      id: 1,
      secondaryLinks: [{ label: 'GitHub', href: 'https://github.com/eTarikhi', newTab: true }],
    } as unknown as Navigation)
    expect(navigation.secondaryLinks[0]).toMatchObject({ newTab: true })
  })

  /**
   * The seed and the fallback describe the same bar. If they drift, a seeded database looks
   * different from an unseeded one — exactly the kind of bug nobody notices until a deploy.
   */
  it('matches the seeded navigation', () => {
    const seeded = navigationData()
    expect(seeded.brand).toBe(DEFAULT_NAVIGATION.brand)
    expect(seeded.primaryLinks).toEqual(DEFAULT_NAVIGATION.primaryLinks)
    expect(seeded.secondaryLinks).toEqual(DEFAULT_NAVIGATION.secondaryLinks)
  })
})

/** Site settings: maintenance defaults to off, with copy the page can render without a save. */
describe('mapSiteSettings', () => {
  it('keeps an unsaved global online with usable copy', () => {
    const settings = mapSiteSettings({ id: 1 } as unknown as SiteSetting)
    expect(settings.maintenance.enabled).toBe(false)
    expect(settings.siteName).toBe('eTarikhi')
    expect(settings.supportEmail).toBeNull()
    expect(settings.maintenance.title.length).toBeGreaterThan(0)
    expect(settings.maintenance.message.length).toBeGreaterThan(0)
  })

  it('maps the switch and the support address', () => {
    const settings = mapSiteSettings({
      id: 1,
      siteName: 'Portfolio',
      supportEmail: 'hi@example.com',
      maintenance: { enabled: true, title: 'Down for upgrades', message: 'Back at noon.' },
    } as unknown as SiteSetting)
    expect(settings).toMatchObject({
      siteName: 'Portfolio',
      supportEmail: 'hi@example.com',
      maintenance: { enabled: true, title: 'Down for upgrades', message: 'Back at noon.' },
    })
  })
})
