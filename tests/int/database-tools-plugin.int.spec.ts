import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

import { CAPABILITIES } from '@/access/permissions'
import {
  DATABASE_TOOLS_CAPABILITY,
  databaseTools,
  DATABASE_TOOLS_DEFAULTS,
  resolveOptions,
} from '@/plugins/databaseTools'
import { defaultAccess } from '@/plugins/databaseTools/options'

/**
 * The plugin contract, without a database: what `databaseTools(options)` adds to a config, what it
 * leaves alone, and what the options mean. The SQL behind the endpoints is tested live in
 * `database-tools.int.spec.ts`; this file is about the packaging — the part another Payload project
 * would rely on.
 */

/** The smallest config the plugin touches: admin views, nav components and endpoints. */
const baseConfig = (): Config =>
  ({
    admin: {
      components: {
        afterNavLinks: ['/components/admin/nav/NavExtraLinks#NavExtraLinks'],
        views: {
          gallery: { Component: '/components/admin/views/Gallery#GalleryView', path: '/gallery' },
        },
      },
    },
    collections: [],
    endpoints: [{ handler: async () => Response.json({ ok: true }), method: 'get', path: '/ping' }],
    globals: [],
  }) as unknown as Config

/** The plugin's signature allows a promise (Payload's own `Plugin` type does); ours is sync. */
const plugin = async (options: Parameters<typeof databaseTools>[0] = {}) =>
  (await databaseTools(options)(baseConfig())) as Config

const views = (config: Config) => config.admin?.components?.views ?? {}
const nav = (config: Config) => config.admin?.components?.afterNavLinks ?? []
const paths = (config: Config) => (config.endpoints ?? []).map((endpoint) => endpoint.path)

describe('databaseTools plugin', () => {
  it('adds the view at /database, next to the ones already registered', async () => {
    const config = await plugin()
    expect(Object.keys(views(config))).toEqual(['gallery', 'database'])
    expect(views(config).database).toMatchObject({
      path: '/database',
      meta: { title: 'Database' },
    })
  })

  it('hands the resolved options to the view as server props', async () => {
    const access = () => true
    const config = await plugin({ access, migrations: ['a', 'b'], title: 'DB' })
    const component = views(config).database?.Component

    expect(typeof component).toBe('object')
    if (!component || typeof component !== 'object') throw new Error('expected an object component')
    expect(component.path).toBe(DATABASE_TOOLS_DEFAULTS.viewComponent.split('#')[0])
    expect(component.exportName).toBe('DatabaseView')

    const serverProps = component.serverProps as
      | { databaseTools?: ReturnType<typeof resolveOptions> }
      | undefined
    const resolved = serverProps?.databaseTools as ReturnType<typeof resolveOptions>
    expect(resolved.access).toBe(access)
    expect(resolved.migrations).toEqual(['a', 'b'])
    expect(resolved.title).toBe('DB')
    expect(resolved.components.view).toBe(DATABASE_TOOLS_DEFAULTS.viewComponent)
  })

  it('registers its own endpoints after the app’s, under the API path', async () => {
    expect(paths(await plugin())).toEqual([
      '/ping',
      '/database/backup',
      '/database/maintenance',
      '/database/repair',
      '/database/table',
      '/database/sessions',
      '/database/sessions/cancel',
      '/database/sessions/terminate',
      '/database/restore-inspect',
      '/database/restore',
      '/database/neon/backup',
      '/database/neon/restore',
      '/database/neon/delete',
    ])
  })

  it('honours apiBasePath, restore: false and neon: false', async () => {
    expect(paths(await plugin({ apiBasePath: '/ops/db' }))).toContain('/ops/db/maintenance')

    const readOnly = paths(await plugin({ restore: false, neon: false, sessions: false }))
    expect(readOnly).toEqual([
      '/ping',
      '/database/backup',
      '/database/maintenance',
      '/database/repair',
      '/database/table',
    ])
  })

  it('adds the sidebar link after the nav links already registered', async () => {
    const config = await plugin()
    expect(nav(config)).toHaveLength(2)
    expect(nav(config)[1]).toMatchObject({
      path: DATABASE_TOOLS_DEFAULTS.navComponent.split('#')[0],
      exportName: 'DatabaseNavLink',
    })
    expect(nav(await plugin({ navigation: false }))).toEqual(nav(baseConfig()))
  })

  it('appends to afterNavLinks without replacing a host’s own list', async () => {
    const config = baseConfig()
    config.admin!.components!.afterNavLinks = [
      '/components/admin/nav/NavExtraLinks#NavExtraLinks',
      '/components/admin/nav/HiddenLogout#HiddenLogout',
    ]
    const next = (await databaseTools({})(config)) as Config
    expect(nav(next)).toHaveLength(3)
    expect(nav(next)[0]).toBe('/components/admin/nav/NavExtraLinks#NavExtraLinks')
  })

  it('refuses a second view at the same key instead of shadowing the first', async () => {
    const once = await plugin()
    expect(() => databaseTools({})(once)).toThrow(/already has a view registered as "database"/)
  })

  it('keeps the fallback defaults when no options are given', () => {
    const resolved = resolveOptions()
    expect(resolved.pagePath).toBe('/database')
    expect(resolved.apiBasePath).toBe('/database')
    expect(resolved.navigation).not.toBe(false)
    expect(resolved.restore).toEqual({ maxBytes: 25 * 1024 * 1024 })
    expect(resolved.sessions).toBe(true)
    expect(resolved.export).toEqual({ maxRows: 10_000 })
    expect(resolved.backup.maxRowsPerTable).toBe(100_000)
    expect(resolved.neon).toEqual({})
  })

  it('caps the CSV and restore limits whatever the host passes', () => {
    expect(resolveOptions({ export: { maxRows: 10_000_000 } }).export).toEqual({ maxRows: 100_000 })
    expect(resolveOptions({ export: { maxRows: 0 } }).export).toEqual({ maxRows: 1 })
    expect(resolveOptions({ export: false }).export).toBe(false)
    expect(resolveOptions({ restore: { maxBytes: 1024 } }).restore).toEqual({ maxBytes: 1024 })
  })

  it('normalises paths so a host can write "database" or "/database/"', async () => {
    expect(resolveOptions({ pagePath: 'database' }).pagePath).toBe('/database')
    expect(resolveOptions({ pagePath: '/ops/db/' }).pagePath).toBe('/ops/db')
    expect(resolveOptions({ apiBasePath: 'ops/db' }).apiBasePath).toBe('/ops/db')
    const config = await plugin({ pagePath: '/ops/backups' })
    expect(views(config)['ops-backups']?.path).toBe('/ops/backups')
  })

  it('lets a host point at its own components (the packaged case)', async () => {
    const config = await plugin({
      components: {
        view: { path: '@acme/payload-database-tools/client', exportName: 'DatabaseView' },
        navigation: '@acme/payload-database-tools/client#DatabaseNavLink',
      },
    })
    expect(views(config).database?.Component).toMatchObject({
      path: '@acme/payload-database-tools/client',
      exportName: 'DatabaseView',
    })
    expect(nav(config)[1]).toMatchObject({
      path: '@acme/payload-database-tools/client',
      exportName: 'DatabaseNavLink',
    })
  })
})

describe('plugin defaults', () => {
  it('exposes the capability the host should grant', () => {
    expect(DATABASE_TOOLS_CAPABILITY.name).toBe('manageDatabase')
    expect(CAPABILITIES.find((capability) => capability.name === 'manageDatabase')).toMatchObject({
      label: DATABASE_TOOLS_CAPABILITY.label,
      description: DATABASE_TOOLS_CAPABILITY.description,
    })
  })

  it('denies by default, and only full access passes', async () => {
    const req = (user: unknown) => ({ req: { user } }) as never
    expect(await defaultAccess(req(undefined))).toBe(false)
    expect(await defaultAccess(req({ permissions: null }))).toBe(false)
    expect(await defaultAccess(req({ permissions: { fullAccess: false } }))).toBe(false)
    expect(await defaultAccess(req({ permissions: { fullAccess: true } }))).toBe(true)
  })
})
