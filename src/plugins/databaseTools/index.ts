import type { Config, CustomComponent, PayloadComponent, Plugin, RawPayloadComponent } from 'payload'

import { databaseToolsEndpoints } from './endpoints'
import {
  DATABASE_TOOLS_CAPABILITY,
  resolveOptions,
  type DatabaseToolsComponent,
  type DatabaseToolsOptions,
  type ResolvedDatabaseToolsOptions,
} from './options'

/**
 * Database tools for the Payload admin.
 *
 * A Payload plugin is a function that takes the incoming config and returns a changed one. This one
 * is a factory so it can take options, which is the shape Payload's own plugins use:
 *
 * ```ts
 * plugins: [databaseTools({ migrations, audit, access })]
 * ```
 *
 * What it adds:
 *
 * - **An admin view** (`options.pagePath`, default `/admin/database`) whose component is resolved
 *   through the import map, like every other custom view. The component is this repository's
 *   `src/components/admin/views/Database`; a packaged copy sets `components.view`.
 * - **A sidebar link** (`options.navigation`, default on) as an `afterNavLinks` component. It is a
 *   separate component on purpose: it needs the signed-in user's permissions, which a server
 *   config function does not have.
 * - **The endpoints** under `options.apiBasePath` (default `/api/database`): backup, maintenance,
 *   repair, restore (unless `restore: false`) and the Neon branch operations (unless `neon: false`).
 *
 * What it deliberately does *not* do:
 *
 * - It does not invent a permission system. `access` decides who may open the page and call the
 *   endpoints; the default accepts a user whose `permissions.fullAccess` is true. The page and the
 *   endpoints use the same function, so they cannot disagree.
 * - It does not add a Roles field. A capability checkbox is an app concern: the app owns the
 *   `roles` collection and its migration. `DATABASE_TOOLS_CAPABILITY` is exported so the host can
 *   append it to its own capability list (this repo does, in `src/access/permissions.ts`).
 * - It does not register migrations. The page reads and writes *existing* tables; it needs no
 *   schema of its own.
 * - It does not touch `onInit`. Nothing runs until an admin opens the page or downloads a backup.
 *
 * Registering it twice would produce two views at one path, so the second registration throws with
 * the key that collided rather than silently shadowing the first.
 */
export const databaseTools =
  (options: DatabaseToolsOptions = {}): Plugin =>
  (incomingConfig: Config): Config => {
    const resolved = resolveOptions(options)
    const config: Config = { ...incomingConfig }

    // The admin view. `admin.components.views` is a record keyed by a name of our choosing; the key
    // only has to be unique, the `path` is what the route uses.
    const existingViews = config.admin?.components?.views ?? {}
    const viewKey = viewKeyFor(resolved.pagePath)
    if (existingViews[viewKey]) {
      throw new Error(
        `[database-tools] The admin already has a view registered as "${viewKey}". Choose another pagePath.`,
      )
    }

    config.admin = {
      ...config.admin,
      components: {
        ...config.admin?.components,
        views: {
          ...existingViews,
          [viewKey]: {
            Component: withServerProps(resolved.components.view, resolved) as PayloadComponent,
            path: resolved.pagePath,
            meta: { title: resolved.title },
          },
        },
        afterNavLinks: resolved.navigation
          ? [
              ...(config.admin?.components?.afterNavLinks ?? []),
              withServerProps(resolved.components.navigation, resolved),
            ]
          : config.admin?.components?.afterNavLinks,
      },
    }

    // The endpoints, after any the app registered itself.
    config.endpoints = [...(config.endpoints ?? []), ...databaseToolsEndpoints(resolved)]

    return config
  }

/**
 * Give a component the resolved options as a `serverProps` entry.
 *
 * `serverProps` is how a server component in the admin receives values the config cannot reach —
 * here, the resolved options (so the view and the link render the same title, path and access rule
 * the endpoints use). The object form is also what the import map understands: a string
 * `'path#export'` becomes `{ path, exportName }`.
 */
const withServerProps = (
  component: DatabaseToolsComponent,
  options: ResolvedDatabaseToolsOptions,
): CustomComponent => {
  const base: RawPayloadComponent =
    typeof component === 'string'
      ? (() => {
          const [path, exportName] = component.split('#')
          return exportName ? { path, exportName } : { path }
        })()
      : component
  return { ...base, serverProps: { ...base.serverProps, databaseTools: options } }
}

/**
 * A valid view key: letters, digits and dashes. `/database` becomes `database`; a nested path keeps
 * its segments separate (`/ops/database` → `ops-database`).
 */
const viewKeyFor = (path: string): string =>
  path
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'database'

export { DATABASE_TOOLS_CAPABILITY }
export type {
  DatabaseToolsAccess,
  DatabaseToolsAudit,
  DatabaseToolsBackupOptions,
  DatabaseToolsNeonOptions,
  DatabaseToolsOptions,
  ResolvedDatabaseToolsOptions,
} from './options'
export { DEFAULTS as DATABASE_TOOLS_DEFAULTS, resolveOptions } from './options'
