import { describe, expect, it } from 'vitest'

import { mapFooter } from '@/app/(frontend)/lib/mappers'
import type { Footer } from '@/payload-types'

/** The Footer global before anyone saves it: the home page must still render. */
describe('mapFooter on an unsaved Footer global', () => {
  it('maps empty groups (what Payload returns before the first save) without an undefined link', () => {
    const footer = mapFooter({ id: 1, roles: {}, copyRight: { url: null } } as unknown as Footer)
    expect(footer?.copyright.url).toBe('')
    expect(footer?.copyright.website).toBe('')
    expect(footer?.copyright.year).toBe(new Date().getFullYear())
  })

  it('maps a document without the group at all', () => {
    const footer = mapFooter({ id: 1 } as unknown as Footer)
    expect(footer?.copyright.url).toBe('')
    expect(footer?.socialLinks).toEqual([])
  })
})
