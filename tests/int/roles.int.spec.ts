import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hasRole, isAdmin } from '@/access/roles'
import config from '@/payload.config'
import type { User } from '@/payload-types'

/** Roles and user access (ADR 0008), exercised through the Local API with access control on. */
describe('User roles', () => {
  let payload: Payload
  let admin: User
  let editor: User
  const stamp = Date.now()

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    admin = await payload.create({
      collection: 'users',
      data: { email: `int-admin-${stamp}@example.test`, password: 'int-test-1', roles: ['admin'] },
    })
    editor = await payload.create({
      collection: 'users',
      data: { email: `int-editor-${stamp}@example.test`, password: 'int-test-1' },
    })
  })

  afterAll(async () => {
    await payload.delete({
      collection: 'users',
      where: { email: { like: `-${stamp}@example.test` } },
    })
  })

  it('defaults new users to the editor role', () => {
    expect(editor.roles).toEqual(['editor'])
    expect(isAdmin(editor)).toBe(false)
    expect(hasRole(editor, 'editor')).toBe(true)
    expect(isAdmin(admin)).toBe(true)
  })

  it('does not let an editor promote themselves', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: editor.id,
      data: { roles: ['admin'], name: 'Renamed' },
      overrideAccess: false,
      user: editor,
    })
    expect(updated.roles).toEqual(['editor'])
    expect(updated.name).toBe('Renamed')
  })

  it('shows editors only their own account', async () => {
    const { docs } = await payload.find({ collection: 'users', overrideAccess: false, user: editor })
    expect(docs.map((doc) => doc.id)).toEqual([editor.id])
  })

  it('does not let editors create users', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { email: `int-other-${stamp}@example.test`, password: 'int-test-1' },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
  })

  it('lets admins change roles', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: editor.id,
      data: { roles: ['editor', 'admin'] },
      overrideAccess: false,
      user: admin,
    })
    expect(updated.roles).toEqual(expect.arrayContaining(['admin', 'editor']))
  })
})
