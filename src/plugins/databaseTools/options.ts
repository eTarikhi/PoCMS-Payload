import type { PayloadComponent, PayloadRequest, ServerProps } from 'payload'

/**
 * The capability this plugin's screens and endpoints need, in the shape the Roles collection
 * stores capabilities (a checkbox per entry of `CAPABILITIES` in `src/access/permissions.ts`).
 *
 * A capability is a *host application* concept: Payload has no opinion about why a user may open an
 * admin view, only whether they may open the admin at all. So the plugin ships the descriptor and
 * the host decides how to grant it — see `docs/plugins/database-tools.md` for the two-line change to
 * the capability list and the migration that adds the checkbox column.
 */
export const DATABASE_TOOLS_CAPABILITY = {
  name: 'manageDatabase',
  label: 'Database tools',
  description:
    'Inspect tables, back up and restore, run VACUUM/ANALYZE/REINDEX, repair sequences and orphans, and manage Neon branches.',
} as const

export type DatabaseToolsCapability = typeof DATABASE_TOOLS_CAPABILITY

/** The admin route, the API prefix and the component paths the plugin registers by default. */
export const DEFAULTS = {
  pagePath: '/database',
  apiBasePath: '/database',
  title: 'Database',
  navLabel: 'Database',
  viewComponent: '/components/admin/views/Database#DatabaseView',
  navComponent: '/components/admin/nav/DatabaseNavLink#DatabaseNavLink',
} as const

/** Whether this request may open the page and call the endpoints. May be async. */
export type DatabaseToolsAccess = (args: { req: PayloadRequest }) => boolean | Promise<boolean>

/**
 * Who sees the sidebar link. It receives the user and nothing else: the admin renders the nav
 * before a request exists, so `access` (which needs `req`) cannot answer for it. The default is the
 * same rule as `defaultAccess`; a host with its own permission model passes the same test it gives
 * `access`, written against the user.
 */
export type DatabaseToolsNavVisible = (args: {
  user: ServerProps['user']
}) => boolean | Promise<boolean>

/** One audit entry per action. The host decides where (or whether) to record it. */
export type DatabaseToolsAudit = (args: {
  payload: PayloadRequest['payload']
  req: PayloadRequest
  summary: string
  changes?: { field: string; to?: unknown }[]
}) => void | Promise<void>

/** A component reference: an import-map path (with an optional `#export`) or the object form. */
export type DatabaseToolsComponent = Exclude<PayloadComponent, false>

export type DatabaseToolsBackupOptions = {
  /**
   * Tables that never belong in a dump, in addition to Payload's own bookkeeping (locks,
   * preferences, the key/value store, whose *rows* are already left out). Names, not patterns.
   */
  excludeTables?: string[]
  /**
   * Row cap per table. A larger table is written up to the cap and named in the file's header.
   * @default 100000
   */
  maxRowsPerTable?: number
  /** Also copy the rows of Payload's bookkeeping tables (document locks, preferences, kv). */
  includeInternal?: boolean
}

export type DatabaseToolsNeonOptions = {
  /** The API key. @default process.env.NEON_API_KEY */
  apiKey?: string
  /** The project id; discovered from the connection endpoint when omitted. */
  projectId?: string
  /** The branch id; the project's default branch when omitted. */
  branchId?: string
}

export type DatabaseToolsOptions = {
  /**
   * Who may open `/admin/database` and call its endpoints. Required in practice: the default only
   * allows a user whose `permissions.fullAccess` is true (this app's Administrator).
   */
  access?: DatabaseToolsAccess
  /** Record an audit entry for every restore, maintenance run and Neon change. */
  audit?: DatabaseToolsAudit
  /**
   * The migration names this checkout expects, oldest first. They are compared with the database's
   * `payload_migrations` history by the "Migration history" check. Without it the check reports what
   * the database has but cannot say what is pending.
   */
  migrations?: string[]
  /** Admin route. @default '/database' */
  pagePath?: string
  /** Prefix of the endpoints, mounted under `/api`. @default '/database' */
  apiBasePath?: string
  /** Page and navigation title. @default 'Database' */
  title?: string
  /** Sidebar label. @default 'Database' */
  navLabel?: string
  /**
   * Add the link to the admin sidebar, and who should see it. `false` keeps the page reachable by
   * URL only, for a host that places its own link.
   * @default { visible: only users with `permissions.fullAccess` }
   */
  navigation?: boolean | { visible?: DatabaseToolsNavVisible }
  /**
   * Neon control-plane features (branch backup, point-in-time restore, branch deletion).
   * `false` removes the card and the endpoints. Defaults to reading `NEON_API_KEY`,
   * `NEON_PROJECT_ID` and `NEON_BRANCH_ID` from the environment.
   */
  neon?: DatabaseToolsNeonOptions | false
  /** What a backup includes. */
  backup?: DatabaseToolsBackupOptions
  /**
   * The live sessions card: connections, long-running statements, idle-in-transaction sessions and
   * who blocks whom, plus the two guarded actions (`pg_cancel_backend`,
   * `pg_terminate_backend`). `false` removes the card and those three endpoints.
   * @default true
   */
  sessions?: boolean
  /**
   * The CSV export button and its endpoint. `false` removes both; `maxRows` caps one download.
   * @default { maxRows: 10000 } (never more than 100000, whatever this says)
   */
  export?: false | { maxRows?: number }
  /**
   * The restore card and its two endpoints. `false` leaves the page as read-only inspection plus
   * maintenance; `maxBytes` caps the file the browser may upload. @default { maxBytes: 25 MB }
   */
  restore?: false | { maxBytes?: number }
  /**
   * The two generated files: a Payload migration written from the connected database's catalogs
   * (the Neon branch, when that is what the app points at), and a content seed for a local
   * database. Generating either only reads. `false` removes the card and the endpoints;
   * `maxRowsPerTable` caps one seed table; `apply` keeps the endpoint that loads a seed file into
   * the connected database (it deletes the rows of the tables the file names first).
   * @default { maxRowsPerTable: 5000, apply: true }
   */
  snapshots?: false | { maxRowsPerTable?: number; apply?: boolean }
  /**
   * Where the admin components live. Override these when the plugin is packaged and its components
   * are imported from a package specifier rather than this app's `/components` alias.
   */
  components?: {
    view?: DatabaseToolsComponent
    navigation?: DatabaseToolsComponent
  }
}

/** The same options after defaults are applied, as the components and endpoints receive them. */
export type ResolvedDatabaseToolsOptions = {
  access: DatabaseToolsAccess
  audit?: DatabaseToolsAudit
  migrations: string[]
  pagePath: `/${string}`
  apiBasePath: `/${string}`
  title: string
  navLabel: string
  navigation: false | { visible: DatabaseToolsNavVisible }
  neon: DatabaseToolsNeonOptions | false
  backup: Required<Pick<DatabaseToolsBackupOptions, 'maxRowsPerTable'>> &
    Omit<DatabaseToolsBackupOptions, 'maxRowsPerTable'>
  sessions: boolean
  export: false | { maxRows: number }
  restore: false | { maxBytes: number }
  snapshots: false | { maxRowsPerTable: number; apply: boolean }
  components: { view: DatabaseToolsComponent; navigation: DatabaseToolsComponent }
}

export const MAX_RESTORE_BYTES = 25 * 1024 * 1024

/** A seed is content, not a dump: 5 000 rows per table is a portfolio's whole life, several times over. */
export const MAX_SEED_ROWS = 5_000

/**
 * Deny by default. Payload only lets a user into `/admin` if the `users` collection allows it, but
 * "may sign in" is not "may drop a table": the default requires the app's full-access marker (this
 * repo's Administrator role) and a host with another permission model passes its own `access`.
 */
export const defaultAccess: DatabaseToolsAccess = ({ req }) => {
  const permissions = (
    req.user as { permissions?: { fullAccess?: boolean } | null } | null | undefined
  )?.permissions
  return permissions?.fullAccess === true
}

/** The nav's half of `defaultAccess`: the same rule, from the user alone. */
export const defaultNavigationVisible: DatabaseToolsNavVisible = ({ user }) =>
  (user as { permissions?: { fullAccess?: boolean } | null } | null | undefined)?.permissions
    ?.fullAccess === true

const normalisePath = (path: string): `/${string}` => {
  const trimmed = `/${path.trim().replace(/^\/+|\/+$/g, '')}`
  return (trimmed === '/' ? '/database' : trimmed) as `/${string}`
}

const normaliseApiPath = (path: string): `/${string}` => {
  const trimmed = normalisePath(path)
  return trimmed === '/' ? '/database' : trimmed
}

export const resolveOptions = (
  options: DatabaseToolsOptions = {},
): ResolvedDatabaseToolsOptions => ({
  access: options.access ?? defaultAccess,
  audit: options.audit,
  migrations: [...(options.migrations ?? [])],
  pagePath: normalisePath(options.pagePath ?? DEFAULTS.pagePath),
  apiBasePath: normaliseApiPath(options.apiBasePath ?? DEFAULTS.apiBasePath),
  title: options.title ?? DEFAULTS.title,
  navLabel: options.navLabel ?? DEFAULTS.navLabel,
  navigation:
    options.navigation === false
      ? false
      : {
          visible:
            (options.navigation === true ? undefined : options.navigation?.visible) ??
            defaultNavigationVisible,
        },
  neon: options.neon === false ? false : { ...options.neon },
  backup: {
    ...options.backup,
    maxRowsPerTable: options.backup?.maxRowsPerTable ?? 100_000,
  },
  sessions: options.sessions !== false,
  export:
    options.export === false
      ? false
      : { maxRows: Math.min(Math.max(1, options.export?.maxRows ?? 10_000), 100_000) },
  snapshots:
    options.snapshots === false
      ? false
      : {
          maxRowsPerTable: Math.max(1, options.snapshots?.maxRowsPerTable ?? MAX_SEED_ROWS),
          apply: options.snapshots?.apply !== false,
        },
  restore:
    options.restore === false
      ? false
      : { maxBytes: options.restore?.maxBytes ?? MAX_RESTORE_BYTES },
  components: {
    view: options.components?.view ?? DEFAULTS.viewComponent,
    navigation: options.components?.navigation ?? DEFAULTS.navComponent,
  },
})

/** The Neon client options, with the environment as the fallback (never a secret in the page). */
export const neonOptions = (options: ResolvedDatabaseToolsOptions): DatabaseToolsNeonOptions => ({
  apiKey: options.neon === false ? undefined : options.neon.apiKey,
  projectId: options.neon === false ? undefined : options.neon.projectId,
  branchId: options.neon === false ? undefined : options.neon.branchId,
})
