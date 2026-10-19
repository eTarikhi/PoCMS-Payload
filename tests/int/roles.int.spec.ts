import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  can,
  governedEntities,
  hasAnyRole,
  hasCapability,
  isAdmin,
  levelAllows,
  levelFor,
  mergeRoles,
} from '@/access/permissions'
import config from '@/payload.config'
import type { Role, User } from '@/payload-types'

/** Pure rules: levels, merging, governed entities (ADR 0011). */
describe('Permissions', () => {
  const entities = governedEntities({
    collections: [
      { slug: 'articles', labels: { plural: 'Articles' }, admin: { group: 'Content' } },
      { slug: 'audit-logs', custom: { permissions: false } },
      { slug: 'users', auth: true },
      { slug: 'payload-jobs' },
    ],
    globals: [{ slug: 'footer', label: 'Footer', admin: { group: 'Site settings' } }],
  })

  it('governs content collections and globals only', () => {
    expect(entities.map((entity) => entity.slug)).toEqual(['articles', 'footer'])
    expect(entities[0]).toMatchObject({ kind: 'collection', field: 'articles', group: 'Content' })
  })

  it('maps levels to operations', () => {
    expect(levelAllows('none', 'read')).toBe(false)
    expect(levelAllows('read', 'read')).toBe(true)
    expect(levelAllows('read', 'update')).toBe(false)
    expect(levelAllows('edit', 'create')).toBe(true)
    expect(levelAllows('edit', 'delete')).toBe(false)
    expect(levelAllows('full', 'delete')).toBe(true)
  })

  it('merges roles: the highest level and every capability win', () => {
    const merged = mergeRoles(
      [
        { name: 'A', levels: { articles: 'read', footer: 'edit' } },
        { name: 'B', levels: { articles: 'full' }, capabilities: { viewAuditLog: true } },
      ],
      entities,
    )
    expect(merged).toMatchObject({
      fullAccess: false,
      roles: ['A', 'B'],
      levels: { articles: 'full', footer: 'edit' },
      capabilities: ['viewAuditLog'],
    })
    const user = { permissions: merged }
    expect(can(user, 'articles', 'delete')).toBe(true)
    expect(hasCapability(user, 'viewAuditLog')).toBe(true)
    expect(hasCapability(user, 'useTerminal')).toBe(false)
    expect(isAdmin(user)).toBe(false)
    expect(hasAnyRole(user)).toBe(true)
  })

  it('gives full access everything', () => {
    const merged = mergeRoles([{ name: 'Administrator', fullAccess: true }], entities)
    expect(merged.levels).toEqual({ articles: 'full', footer: 'edit' })
    expect(isAdmin({ permissions: merged })).toBe(true)
    expect(hasCapability({ permissions: merged }, 'useTerminal')).toBe(true)
    expect(hasAnyRole({ permissions: mergeRoles([], entities) })).toBe(false)
  })
})

/** Roles and user access through the Local API with access control on. */
describe('Roles', () => {
  let payload: Payload
  let administrator: Role
  let viewerRole: Role
  let admin: User
  let editor: User
  let viewer: User
  const stamp = Date.now()

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    administrator = (
      await payload.find({ collection: 'roles', where: { system: { equals: true } }, limit: 1 })
    ).docs[0]
    viewerRole = await payload.create({
      collection: 'roles',
      data: { name: `Viewer ${stamp}`, levels: { skills: 'read' } },
    })
    admin = await payload.create({
      collection: 'users',
      data: {
        email: `int-admin-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [administrator.id],
      },
    })
    editor = await payload.create({
      collection: 'users',
      data: { email: `int-editor-${stamp}@example.test`, password: 'int-test-1' },
    })
    viewer = await payload.create({
      collection: 'users',
      data: {
        email: `int-viewer-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [viewerRole.id],
      },
    })
  })

  afterAll(async () => {
    await payload.delete({
      collection: 'users',
      where: { email: { like: `-${stamp}@example.test` } },
    })
    await payload.delete({ collection: 'roles', id: viewerRole.id })
  })

  it('has the built-in Administrator role', () => {
    expect(administrator).toMatchObject({ name: 'Administrator', fullAccess: true, system: true })
    expect(isAdmin(admin)).toBe(true)
  })

  it('gives new users the default roles and computes their permissions on read', () => {
    expect(editor.permissions).toMatchObject({ fullAccess: false })
    expect(isAdmin(editor)).toBe(false)
    expect(levelFor(editor, 'articles')).toBe('edit')
    expect(levelFor(viewer, 'skills')).toBe('read')
    expect(levelFor(viewer, 'articles')).toBe('none')
  })

  it('applies the levels to collection access', async () => {
    const found = await payload.find({
      collection: 'skills',
      limit: 1,
      overrideAccess: false,
      user: viewer,
    })
    expect(found.docs.length).toBeGreaterThanOrEqual(0)
    await expect(
      payload.create({
        collection: 'skills',
        data: { label: `Denied ${stamp}`, value: 1, group: 'backend', color: 'info' } as never,
        overrideAccess: false,
        user: viewer,
      }),
    ).rejects.toThrow()
  })

  it('does not let a non-admin give themselves roles', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: editor.id,
      data: { roles: [administrator.id], name: 'Renamed' },
      overrideAccess: false,
      user: editor,
    })
    expect(isAdmin(updated)).toBe(false)
    expect(updated.name).toBe('Renamed')
  })

  it('shows non-admins only their own account and none of the roles they lack', async () => {
    const { docs } = await payload.find({
      collection: 'users',
      overrideAccess: false,
      user: editor,
    })
    expect(docs.map((doc) => doc.id)).toEqual([editor.id])
    const roles = await payload.find({ collection: 'roles', overrideAccess: false, user: viewer })
    expect(roles.docs.map((role) => role.id)).toEqual([viewerRole.id])
  })

  it('does not let non-admins create users or roles', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { email: `int-other-${stamp}@example.test`, password: 'int-test-1' },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'roles',
        data: { name: `Sneaky ${stamp}`, fullAccess: true },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
  })

  it('keeps the built-in Administrator role', async () => {
    await expect(
      payload.delete({
        collection: 'roles',
        id: administrator.id,
        overrideAccess: false,
        user: admin,
      }),
    ).rejects.toThrow()
    const updated = await payload.update({
      collection: 'roles',
      id: administrator.id,
      data: { fullAccess: false },
      overrideAccess: false,
      user: admin,
    })
    expect(updated.fullAccess).toBe(true)
  })

  it('lets admins change roles', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: viewer.id,
      data: { roles: [viewerRole.id, administrator.id] },
      overrideAccess: false,
      user: admin,
    })
    expect(isAdmin(updated)).toBe(true)
  })
})
