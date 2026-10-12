import { describe, expect, it } from 'vitest'
import type { SanitizedPermissions } from 'payload'

import { ATTENTION_CHECKS, attentionListUrl } from '@/admin/lib/content-attention'
import { isActionAllowed, QUICK_ACTIONS, type QuickAction } from '@/admin/lib/quick-actions'
import { canReadCollection, canReadGlobal } from '@/admin/lib/permissions'

describe('content-attention checks', () => {
  it('only targets articles and projects', () => {
    for (const check of ATTENTION_CHECKS) {
      expect(['articles', 'projects']).toContain(check.collection)
    }
  })

  it('has a unique label per check', () => {
    const labels = ATTENTION_CHECKS.map((check) => check.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('uses an exists/equals where clause for every check', () => {
    for (const check of ATTENTION_CHECKS) {
      const json = JSON.stringify(check.where)
      expect(json).toMatch(/exists/)
    }
  })

  it('covers both cover-image sources for articles', () => {
    const covers = ATTENTION_CHECKS.find((check) => check.label.includes('cover image'))
    expect(covers?.where).toMatchObject({
      and: [{ image: { exists: false } }, { imageUrl: { exists: false } }],
    })
  })

  it('covers upload, image URL, and placeholder for projects', () => {
    const images = ATTENTION_CHECKS.find((check) => check.label.includes('any image'))
    expect(images?.where).toMatchObject({
      and: [{ image: { exists: false } }, { src: { exists: false } }, { placeHolder: { exists: false } }],
    })
  })
})

describe('attentionListUrl', () => {
  it('points at the collection list view', () => {
    expect(attentionListUrl('articles', { image: { exists: false } })).toContain(
      '/admin/collections/articles?',
    )
  })

  it('serialises the where filter into the query string', () => {
    const url = attentionListUrl('projects', {
      and: [{ image: { exists: false } }, { src: { exists: false } }],
    })
    expect(url).toContain('where[and][0][image][exists]=false')
    expect(url).toContain('where[and][1][src][exists]=false')
  })
})

describe('quick actions', () => {
  const permissions = {
    collections: {
      articles: { create: true, read: true, fields: {} },
      projects: { read: true, fields: {} },
      media: { fields: {} },
    },
    globals: {
      footer: { update: true, fields: {} },
    },
  } as unknown as SanitizedPermissions

  it('keeps every action on an admin or site URL', () => {
    for (const action of QUICK_ACTIONS) {
      expect(action.href === '/' || action.href.startsWith('/admin/')).toBe(true)
    }
  })

  it('has unique hrefs', () => {
    const hrefs = QUICK_ACTIONS.map((action) => action.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('allows actions without a permission rule', () => {
    const open: QuickAction = { href: '/', label: 'Open', newTab: true }
    expect(isActionAllowed(undefined, open)).toBe(true)
    expect(isActionAllowed({}, open)).toBe(true)
  })

  it('hides create actions the user cannot perform', () => {
    const newArticle = QUICK_ACTIONS.find((action) => action.label === 'New article')!
    const newProject = QUICK_ACTIONS.find((action) => action.label === 'New project')!
    expect(isActionAllowed(permissions, newArticle)).toBe(true)
    expect(isActionAllowed(permissions, newProject)).toBe(false)
  })

  it('honours read-only collection permissions', () => {
    const openMedia = QUICK_ACTIONS.find((action) => action.label === 'Open media library')!
    expect(isActionAllowed(permissions, openMedia)).toBe(false)
    const review = QUICK_ACTIONS.find((action) => action.label === 'Review articles')!
    expect(isActionAllowed(permissions, review)).toBe(true)
  })

  it('honours global permissions', () => {
    const footer = QUICK_ACTIONS.find((action) => action.label === 'Edit site footer')!
    expect(isActionAllowed(permissions, footer)).toBe(true)
    expect(isActionAllowed({}, footer)).toBe(false)
  })
})

describe('permissions helpers', () => {
  it('reads collection and global flags from sanitized permissions', () => {
    const permissions = {
      collections: { articles: { read: true, fields: {} }, media: { fields: {} } },
      globals: { footer: { read: true, update: true, fields: {} } },
    } as unknown as SanitizedPermissions

    expect(canReadCollection(permissions, 'articles')).toBe(true)
    expect(canReadCollection(permissions, 'media')).toBe(false)
    expect(canReadCollection(permissions, 'missing')).toBe(false)
    expect(canReadCollection(undefined, 'articles')).toBe(false)
    expect(canReadGlobal(permissions, 'footer')).toBe(true)
    expect(canReadGlobal(permissions, 'missing')).toBe(false)
  })
})
