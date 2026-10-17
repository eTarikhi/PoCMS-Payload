import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import type { Skill, User } from '@/payload-types'

/**
 * Trash on content collections: editors move documents to the trash and restore them; only admins
 * delete permanently (access `trashOrAdmin`). Exercised through the Local API with access control on.
 */
describe('Trash', () => {
  let payload: Payload
  let admin: User
  let editor: User
  let skill: Skill
  const stamp = Date.now()

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    admin = await payload.create({
      collection: 'users',
      data: {
        email: `trash-admin-${stamp}@example.test`,
        password: 'int-test-1',
        roles: ['admin'],
      },
    })
    editor = await payload.create({
      collection: 'users',
      data: { email: `trash-editor-${stamp}@example.test`, password: 'int-test-1' },
    })
    skill = await payload.create({
      collection: 'skills',
      data: { label: `Trash test ${stamp}`, value: 50, group: 'backend', color: 'info' } as never,
    })
  })

  afterAll(async () => {
    await payload.delete({
      collection: 'skills',
      where: { label: { like: `${stamp}` } },
      trash: true,
    })
    await payload.delete({
      collection: 'users',
      where: { email: { like: `-${stamp}@example.test` } },
    })
  })

  it('lets an editor move a document to the trash and hides it from normal queries', async () => {
    await payload.update({
      collection: 'skills',
      id: skill.id,
      data: { deletedAt: new Date().toISOString() },
      user: editor,
      overrideAccess: false,
    })
    const visible = await payload.find({
      collection: 'skills',
      where: { id: { equals: skill.id } },
    })
    expect(visible.totalDocs).toBe(0)
    const trashed = await payload.find({
      collection: 'skills',
      trash: true,
      where: { and: [{ id: { equals: skill.id } }, { deletedAt: { exists: true } }] },
    })
    expect(trashed.totalDocs).toBe(1)
  })

  it('does not let an editor delete permanently', async () => {
    await expect(
      payload.delete({
        collection: 'skills',
        id: skill.id,
        trash: true,
        user: editor,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('lets an editor restore a document from the trash', async () => {
    await payload.update({
      collection: 'skills',
      id: skill.id,
      data: { deletedAt: null },
      trash: true,
      user: editor,
      overrideAccess: false,
    })
    const visible = await payload.find({
      collection: 'skills',
      where: { id: { equals: skill.id } },
    })
    expect(visible.totalDocs).toBe(1)
  })

  it('lets an admin delete permanently', async () => {
    await payload.delete({
      collection: 'skills',
      id: skill.id,
      trash: true,
      user: admin,
      overrideAccess: false,
    })
    const all = await payload.find({
      collection: 'skills',
      trash: true,
      where: { id: { equals: skill.id } },
    })
    expect(all.totalDocs).toBe(0)
  })
})
