import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import type { Skill } from '@/payload-types'

/**
 * Drag-and-drop ordering (P5.5 pilot on Skills).
 *
 * Payload's `orderable: true` keeps the position in a hidden `_order` fractional index instead of
 * the manual `order` number the other lists carry. What has to hold: a new document goes to the
 * end, the list sorted by `_order` shows creation order, the position is not an editable field, and
 * the frontend query reads the same order.
 */
describe('Orderable Skills', () => {
  let payload: Payload
  const stamp = Date.now()
  const created: number[] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    for (const id of created) {
      await payload.delete({ collection: 'skills', id, overrideAccess: true })
    }
  })

  const createSkill = async (label: string): Promise<Skill> => {
    const doc = await payload.create({
      collection: 'skills',
      data: { label, group: 'backend', value: 50, color: 'info' },
      overrideAccess: true,
    })
    created.push(doc.id)
    return doc
  }

  it('appends new documents and keeps creation order in `_order`', async () => {
    const first = await createSkill(`Orderable first ${stamp}`)
    const second = await createSkill(`Orderable second ${stamp}`)
    const third = await createSkill(`Orderable third ${stamp}`)

    const orders = [first._order, second._order, third._order]
    expect(orders.every((order) => typeof order === 'string' && order.length > 0)).toBe(true)
    // Fractional index keys sort as text, which is how the list and the site read the order.
    expect([...orders].sort()).toEqual(orders)

    const { docs } = await payload.find({
      collection: 'skills',
      pagination: false,
      sort: '_order',
      depth: 0,
    })
    const mine = docs
      .filter((doc) => created.includes(doc.id))
      .map((doc) => doc.id)
    expect(mine).toEqual([first.id, second.id, third.id])
  })

  it('keeps `_order` out of the form, so an editor cannot type a position', () => {
    const field = payload.collections.skills.config.fields.find(
      (candidate) => 'name' in candidate && candidate.name === '_order',
    ) as { admin?: { hidden?: boolean; readOnly?: boolean } } | undefined
    expect(field).toBeDefined()
    expect(field?.admin?.hidden).toBe(true)
    expect(field?.admin?.readOnly).toBe(true)
  })

  it('keeps the collection schema free of the manual order column', () => {
    const fields = payload.collections.skills.config.fields.map((field) => ('name' in field ? field.name : ''))
    expect(fields).toContain('_order')
    expect(fields).not.toContain('order')
  })
})
