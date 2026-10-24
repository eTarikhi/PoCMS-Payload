import { getPayload, type CollectionConfig, type Field, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isAdmin } from '@/access/permissions'
import {
  PRESET_COLLECTIONS,
  presetConstraintOptions,
  presetLabels,
  roleIdsOf,
} from '@/access/queryPresets'
import config from '@/payload.config'
import type { Role, User } from '@/payload-types'

/**
 * Saved views (Payload's query presets): the list view's filters, columns and sort order stored as a
 * document, private by default and shareable — including with a role, which is the option this
 * project adds on top of Payload's three.
 *
 * Exercised through the Local API with access control on, because that is where the two levels of
 * access (collection level from `presetAccess`, document level from each view's sharing settings)
 * actually combine.
 */

/**
 * Payload's `Field` is a union of ~25 shapes and `in` narrowing does not survive it, so the walk
 * below reads the few properties it cares about through one widened view instead.
 */
type AnyField = Field & {
  fields?: Field[]
  hasMany?: boolean
  name?: string
  options?: { label: string; value: string }[]
  relationTo?: string | string[]
  tabs?: { fields?: Field[] }[]
}

/** Every field in a tree, walking through the layout-only containers. */
const allFields = (fields: Field[]): AnyField[] =>
  fields.flatMap((raw) => {
    const field = raw as AnyField
    const nested = [
      ...(field.fields ?? []),
      ...(field.tabs ?? []).flatMap((tab) => tab.fields ?? []),
    ]
    return nested.length ? [field, ...allFields(nested)] : [field]
  })

/** The sharing group Payload builds for one operation (`read`, `update`, `delete`). */
const sharingGroup = (collection: CollectionConfig, operation: string): AnyField[] => {
  const access = allFields(collection.fields).find((field) => field.name === 'access')
  expect(access, 'the preset collection has an access group').toBeDefined()
  const group = allFields(access!.fields ?? []).find((field) => field.name === operation)
  expect(group, `the access group has an ${operation} group`).toBeDefined()
  return (group!.fields ?? []) as AnyField[]
}

describe('Saved views (query presets)', () => {
  let payload: Payload
  let resolved: Awaited<typeof config>
  let presets: CollectionConfig
  let administrator: Role
  let editor: Role
  let admin: User
  let firstEditor: User
  let secondEditor: User
  const stamp = Date.now()
  const created: (number | string)[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    resolved = payload.config as Awaited<typeof config>
    const found = resolved.collections.find(
      (collection) => collection.slug === 'payload-query-presets',
    )
    expect(found, 'Payload registers the saved-views collection').toBeDefined()
    presets = found!

    // Both roles are looked up by what makes them *these* roles rather than by elimination: other
    // specs create roles of their own, and "the first one without full access" is whoever ran first.
    const { docs: systemRoles } = await payload.find({
      collection: 'roles',
      where: { system: { equals: true } },
      depth: 0,
      limit: 5,
    })
    administrator = systemRoles.find((role) => role.fullAccess)!
    const { docs: defaultRoles } = await payload.find({
      collection: 'roles',
      where: { isDefault: { equals: true } },
      depth: 0,
      limit: 5,
    })
    editor = defaultRoles.find((role) => !role.fullAccess)!
    expect(administrator, 'the built-in Administrator role exists').toBeDefined()
    expect(editor, 'the default Editor role exists').toBeDefined()

    // The signed-in user an access rule sees carries the virtual `permissions` field (ADR 0011), so
    // `isAdmin` works on it without another query.
    admin = await payload.create({
      collection: 'users',
      data: {
        email: `presets-admin-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [administrator.id],
      },
    })
    firstEditor = await payload.create({
      collection: 'users',
      data: {
        email: `presets-one-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [editor.id],
      },
    })
    secondEditor = await payload.create({
      collection: 'users',
      data: {
        email: `presets-two-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [editor.id],
      },
    })
  })

  afterAll(async () => {
    for (const id of created) {
      await payload.delete({ collection: 'payload-query-presets', id, overrideAccess: true })
    }
    await payload.delete({
      collection: 'users',
      where: { email: { like: `-${stamp}@example.test` } },
    })
  })

  describe('configuration', () => {
    it('turns saved views on for exactly the collections the list promises', () => {
      const enabled = resolved.collections
        .filter((collection) => collection.enableQueryPresets === true)
        .map((collection) => collection.slug)
        .sort()
      expect(enabled).toEqual([...PRESET_COLLECTIONS].sort())
      expect(enabled.length).toBeGreaterThan(10)
    })

    it('leaves the singletons and the roles collection out', () => {
      const enabled = new Set<string>(
        resolved.collections
          .filter((collection) => collection.enableQueryPresets === true)
          .map((collection) => collection.slug),
      )
      for (const slug of ['about', 'header', 'roles']) {
        expect(enabled.has(slug), `${slug} should not offer saved views`).toBe(false)
      }
    })

    it('keeps the saved-views collection out of the sidebar', () => {
      expect(presets.admin?.hidden).toBe(true)
    })

    it('offers role-based sharing next to Payload’s own three options', () => {
      const select = sharingGroup(presets, 'read').find((field) => field.name === 'constraint')
      expect(select?.options, 'the constraint select exists').toBeDefined()
      const values = (select!.options ?? []).map((option) => option.value)
      expect(values).toEqual(['everyone', 'onlyMe', 'specificUsers', 'specificRoles'])
    })

    it('puts the roles picker inside each operation’s sharing group', () => {
      for (const operation of ['delete', 'read', 'update']) {
        const roles = sharingGroup(presets, operation).find((field) => field.name === 'roles')
        expect(roles, `${operation} has a roles field`).toBeDefined()
        expect(roles?.relationTo).toBe('roles')
        expect(roles?.hasMany).toBe(true)
      }
    })

    it('names a preset a saved view in the admin’s own words', () => {
      const translate = (key: string) =>
        ({ 'savedViews:plural': 'Saved views', 'savedViews:singular': 'Saved view' })[key] ?? key
      const singular = presetLabels?.singular
      const plural = presetLabels?.plural
      expect(typeof singular).toBe('function')
      expect(typeof plural).toBe('function')
      // The label functions take Payload's `t`; the catalogue test in i18n.int.spec.ts proves the
      // keys resolve, this proves they are wired to the collection.
      expect((singular as unknown as (args: { t: typeof translate }) => string)({ t: translate })).toBe(
        'Saved view',
      )
      expect((plural as unknown as (args: { t: typeof translate }) => string)({ t: translate })).toBe(
        'Saved views',
      )
    })

    it('only offers “Everyone” to a user with full access', () => {
      const options = [
        { label: 'Everyone', value: 'everyone' },
        { label: 'Only Me', value: 'onlyMe' },
        { label: 'Specific Users', value: 'specificUsers' },
        { label: 'Specific Roles', value: 'specificRoles' },
      ]
      expect(isAdmin(admin), 'the administrator user carries full access').toBe(true)
      expect(isAdmin(firstEditor), 'an editor does not').toBe(false)
      const forAdmin = presetConstraintOptions?.({ options, req: { user: admin } } as never)
      const forEditor = presetConstraintOptions?.({ options, req: { user: firstEditor } } as never)
      expect(forAdmin).toEqual(options)
      expect((forEditor as { value: string }[]).map((option) => option.value)).toEqual([
        'onlyMe',
        'specificUsers',
        'specificRoles',
      ])
    })

    it('reads role IDs whether they arrive as IDs or as populated documents', () => {
      expect(roleIdsOf({ roles: [1, 2] })).toEqual([1, 2])
      expect(roleIdsOf({ roles: [{ id: 3 }, { id: '4' }] })).toEqual([3, '4'])
      expect(roleIdsOf({ roles: [null, undefined, 'x', { noId: true }] })).toEqual(['x'])
      expect(roleIdsOf({})).toEqual([])
      expect(roleIdsOf(null)).toEqual([])
      expect(roleIdsOf(undefined)).toEqual([])
    })
  })

  describe('access', () => {
    it('refuses a signed-out request', async () => {
      await expect(
        payload.find({
          collection: 'payload-query-presets',
          overrideAccess: false,
          user: null,
        }),
      ).rejects.toThrow()
    })

    it('stores a view with its filters, columns and sort, and gives them back', async () => {
      const view = await payload.create({
        collection: 'payload-query-presets',
        data: {
          title: `Unpublished articles ${stamp}`,
          relatedCollection: 'articles',
          where: { _status: { equals: 'draft' } },
          columns: [{ path: 'title' }, { path: 'publishAt' }],
          groupBy: 'category',
        } as never,
        overrideAccess: false,
        user: firstEditor,
      })
      created.push(view.id)

      const read = await payload.findByID({
        collection: 'payload-query-presets',
        id: view.id,
        overrideAccess: false,
        user: firstEditor,
        depth: 0,
      })
      expect(read.title).toBe(`Unpublished articles ${stamp}`)
      expect(read.relatedCollection).toBe('articles')
      // Payload normalizes the filters it stores into its canonical or/and shape, so this asserts on
      // what the collection keeps rather than on the object the admin sent.
      expect(read.where).toEqual({ or: [{ and: [{ _status: { equals: 'draft' } }] }] })
      expect(read.columns).toEqual([{ path: 'title' }, { path: 'publishAt' }])
      expect(read.groupBy).toBe('category')
      // Private by default: Payload's own hook puts the author in the users list, and `isShared`
      // stays false while every operation is "only me".
      expect(read.isShared).toBe(false)
      expect(read.access?.read?.constraint).toBe('onlyMe')
      expect(read.access?.read?.users).toEqual([firstEditor.id])
    })

    it('keeps a private view from another editor', async () => {
      const [id] = created
      expect(id, 'the previous test stored a view').toBeDefined()
      const seen = await payload.find({
        collection: 'payload-query-presets',
        where: { id: { equals: id } },
        overrideAccess: false,
        user: secondEditor,
      })
      expect(seen.totalDocs).toBe(0)
    })

    it('shares a view with a role, and only holders of that role see it', async () => {
      const [id] = created
      expect(id, 'the previous test stored a view').toBeDefined()
      // The whole test rests on who holds which role, so say it out loud before asserting on it.
      expect(roleIdsOf(secondEditor)).toContain(editor.id)
      expect(roleIdsOf(admin)).not.toContain(editor.id)
      await payload.update({
        collection: 'payload-query-presets',
        id,
        data: {
          access: {
            read: { constraint: 'specificRoles', roles: [editor.id] },
          },
        } as never,
        overrideAccess: false,
        user: firstEditor,
      })

      // The second editor holds the Editor role, so the shared view is theirs to use.
      const byRole = await payload.find({
        collection: 'payload-query-presets',
        where: { id: { equals: id } },
        overrideAccess: false,
        user: secondEditor,
      })
      expect(byRole.totalDocs).toBe(1)

      // The author still sees it: they hold the same role.
      const byAuthor = await payload.find({
        collection: 'payload-query-presets',
        where: { id: { equals: id } },
        overrideAccess: false,
        user: firstEditor,
      })
      expect(byAuthor.totalDocs).toBe(1)

      // An administrator who does not hold that role does not: sharing is per view, and full access
      // is not one of the rules that opens it.
      const byAdmin = await payload.find({
        collection: 'payload-query-presets',
        where: { id: { equals: id } },
        overrideAccess: false,
        user: admin,
      })
      expect(byAdmin.totalDocs).toBe(0)
    })

    it('refuses to save a view its author could no longer open', async () => {
      const view = await payload.create({
        collection: 'payload-query-presets',
        data: { title: `Lockout probe ${stamp}`, relatedCollection: 'media' } as never,
        overrideAccess: false,
        user: firstEditor,
      })
      created.push(view.id)
      await expect(
        payload.update({
          collection: 'payload-query-presets',
          id: view.id,
          data: {
            access: {
              read: { constraint: 'specificRoles', roles: [administrator.id] },
            },
          } as never,
          overrideAccess: false,
          user: firstEditor,
        }),
      ).rejects.toThrow()
    })

    it('will not store a view for a collection that has not turned saved views on', async () => {
      await expect(
        payload.create({
          collection: 'payload-query-presets',
          data: { title: `Not enabled ${stamp}`, relatedCollection: 'roles' } as never,
          overrideAccess: false,
          user: firstEditor,
        }),
      ).rejects.toThrow()
    })
  })
})
