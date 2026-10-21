import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

/**
 * Drag-and-drop ordering (P5.5).
 *
 * Payload's `orderable: true` keeps the position in a hidden `_order` fractional index instead of
 * the manual `order` number the lists used to carry. Skills was the pilot; Educations,
 * Experiences, Projects and Services followed, and the manual field is gone from all five.
 *
 * What has to hold for every orderable collection: a new document goes to the end, the list sorted
 * by `_order` shows creation order, the fields carry no editable `order` number, the frontend reads
 * the same key, and the collection's schema has the hidden `_order` field.
 */
const ORDERABLE = ['skills', 'educations', 'experiences', 'projects', 'services'] as const

type Collection = (typeof ORDERABLE)[number]

describe('Orderable collections', () => {
  let payload: Payload
  const stamp = Date.now()
  const created: { collection: Collection; id: number | string }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    for (const { collection, id } of created) {
      await payload.delete({ collection, id, overrideAccess: true })
    }
  })

  /** The smallest valid document per collection, so the test is about ordering, not content. */
  const dataFor = (collection: Collection, title: string): Record<string, unknown> => {
    switch (collection) {
      case 'skills':
        return { label: title, group: 'backend', value: 50, color: 'info' }
      case 'educations':
        return { title, institution: 'Test University', location: 'Test', date: '2020 - 2024' }
      case 'experiences':
        return { title, company: 'Test Co', date: '2020 - Present' }
      case 'projects':
        return { title, categories: ['front-end'], url: 'https://example.com' }
      case 'services':
        return { category: title, iconFont: 'faCode', descriptions: ['One'] }
    }
  }

  const create = async (collection: Collection, title: string) => {
    const doc = await payload.create({
      collection,
      // The per-collection data types are unioned; the Local API accepts the matching shape.
      data: dataFor(collection, title) as never,
      overrideAccess: true,
    })
    created.push({ collection, id: doc.id })
    return doc as unknown as { id: number | string; _order?: string | null }
  }

  for (const collection of ORDERABLE) {
    describe(collection, () => {
      it('appends new documents and keeps creation order in `_order`', async () => {
        const first = await create(collection, `Orderable first ${stamp}`)
        const second = await create(collection, `Orderable second ${stamp}`)
        const third = await create(collection, `Orderable third ${stamp}`)

        const orders = [first._order, second._order, third._order]
        expect(orders.every((order) => typeof order === 'string' && order.length > 0)).toBe(true)
        // Fractional index keys sort as text, which is how the list and the site read the order.
        expect([...orders].sort()).toEqual(orders)

        const { docs } = await payload.find({
          collection,
          pagination: false,
          sort: '_order',
          depth: 0,
        })
        const mine = docs
          .filter((doc) => created.some((entry) => entry.collection === collection && entry.id === doc.id))
          .map((doc) => doc.id)
        expect(mine).toEqual([first.id, second.id, third.id])
      })

      it('keeps `_order` out of the form, so an editor cannot type a position', () => {
        const field = payload.collections[collection].config.fields.find(
          (candidate) => 'name' in candidate && candidate.name === '_order',
        ) as { admin?: { hidden?: boolean; readOnly?: boolean } } | undefined
        expect(field).toBeDefined()
        expect(field?.admin?.hidden).toBe(true)
        expect(field?.admin?.readOnly).toBe(true)
      })

      it('keeps the collection schema free of the manual order column', () => {
        const fields = payload.collections[collection].config.fields.map((field) =>
          'name' in field ? field.name : '',
        )
        expect(fields).toContain('_order')
        expect(fields).not.toContain('order')
      })

      it('is orderable and sorts by `_order` by default', () => {
        const config = payload.collections[collection].config
        expect(config.orderable).toBe(true)
        expect(config.defaultSort).toBe('_order')
      })
    })
  }

  it('the frontend reads the same key for every ordered list', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile('src/app/(frontend)/lib/payload-source.ts', 'utf8'),
    )
    for (const collection of ORDERABLE) {
      expect(source, `${collection} must sort by _order`).toContain(
        `collection: '${collection}'`,
      )
    }
    // No ordered query may still sort by the removed column.
    expect(source).not.toContain("sort: 'order'")
  })
})
