# Database tools plugin

`src/plugins/databaseTools` is a Payload 3 plugin. One call adds a database page to the admin, the
endpoints behind it and a sidebar link; the SQL, the Neon client and the checks live with the
plugin, and the host application decides *who* may use them, *where* audit entries go and *which*
migrations it expects.

It began as a page in this project (see [the admin UI guide](../ui-modernization/admin-ui-guide.md#database-page))
and was packaged the way Payload documents plugins so another Payload project can mount the same
tools. Everything except the components is framework-free TypeScript; the components use Payload's
admin slots and the project's `acn:`-prefixed Tailwind classes.

```ts
// src/payload.config.ts
import { databaseTools } from '@/plugins/databaseTools'

export default buildConfig({
  // …
  plugins: [
    databaseTools({
      access: ({ req }) => hasCapability(req.user, 'manageDatabase'),
      navigation: { visible: ({ user }) => hasCapability(user, 'manageDatabase') },
      audit: ({ payload, req, summary, changes }) =>
        recordAudit(payload, { action: 'update', summary, entity: 'database', changes }, req),
      migrations: migrations.map((migration) => migration.name),
    }),
  ],
})
```

## What the plugin adds

| Piece | Default | Where |
| --- | --- | --- |
| Admin view | `pagePath: '/database'` (the admin shows it at `/admin/database`) | `options.components.view` |
| Sidebar link | On, after the app's own `afterNavLinks` | `options.components.navigation` |
| `GET /api/database/backup` | On | `endpoints.ts` → `server/backup.ts` |
| `POST /api/database/maintenance` | On | `server/maintenance.ts` |
| `POST /api/database/repair` | On | `server/repair.ts` |
| `POST /api/database/restore-inspect` and `…/restore` | On, `restore: false` removes both | `server/restore.ts` |
| `POST /api/database/neon/{backup,restore,delete}` | On, `neon: false` removes them; without `NEON_API_KEY` they answer `501` | `server/neon.ts` |

A plugin is `(options) => (incomingConfig) => Config`: it is applied while the config is built, after
your config is validated and before Payload sanitises it, so the view, the link and the endpoints
are part of the same config the admin server renders. The factory is idempotent in the sense that
[matters](#it-does-not): registering the same `pagePath` twice throws instead of shadowing the first
view.

## Options

Every option is optional; the page works with none. Types and JSDoc live in `options.ts`, and the
resolved object is what the components and the endpoints receive.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `access` | `({ req }) => boolean \| Promise<boolean>` | `req.user.permissions.fullAccess === true` | Who may open the page and call every endpoint. Throwing or rejecting means no. The page, the link and the endpoints must agree, so this is one function, not three. |
| `navigation` | `boolean \| { visible?: ({ user }) => boolean }` | `{ visible: user.permissions.fullAccess === true }` | `false` registers no link (the page stays reachable by URL). `visible` is the link's half of `access`: the nav renders without a request, so it receives the user only. |
| `audit` | `({ payload, req, summary, changes }) => void \| Promise<void>` | none | Called after a restore, a maintenance run, a repair and each Neon change. A failure is logged and does not turn a completed action into an error. |
| `migrations` | `string[]` | `[]` | The migration names the checkout expects, oldest first. The "Migration history" check compares them with `payload_migrations` to say what is pending; without it the check can only report what the database has. |
| `pagePath` | `` `/${string}` `` | `'/database'` | Admin route, relative to the admin route. |
| `apiBasePath` | `` `/${string}` `` | `'/database'` | Endpoint prefix, relative to Payload's API route (`routes.api`, `/api`). |
| `title` | `string` | `'Database'` | Page heading, step nav and the browser tab title. |
| `navLabel` | `string` | `'Database'` | Sidebar label. |
| `neon` | `false \| { apiKey?, projectId?, branchId? }` | `{}` → `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_BRANCH_ID` | Neon control-plane features. `false` removes the card and the three endpoints. Blank environment values count as unset. |
| `backup` | `{ excludeTables?, maxRowsPerTable?, includeInternal? }` | `{ maxRowsPerTable: 100000 }` | What a dump contains. `excludeTables` is a name list, never a pattern. `includeInternal` also copies the rows of Payload's locks/preferences/kv tables (normally their tables are kept but their rows are not). |
| `restore` | `false \| { maxBytes? }` | `{ maxBytes: 25 MB }` | The restore card and its endpoints. `false` leaves inspection and maintenance. |
| `components` | `{ view?, navigation? }` | this repo's `/components/admin/…` paths | Where the two components live — the first thing to change when the plugin is published as a package. |

Options are read once, when the config is built: changing them needs a restart, like any other
Payload config change.

### Access and the sidebar link

The nav is rendered before a request exists, so it cannot call `access`. `navigation.visible`
therefore receives `{ user }` and should repeat the rule against the user. This project uses the
same capability test for both:

```ts
access: ({ req }) => hasCapability(req.user, 'manageDatabase'),
navigation: { visible: ({ user }) => hasCapability(user, 'manageDatabase') },
```

If the two disagree, the link shows for someone the page then answers `404` to. Hiding the link is
also the failure mode when `visible` throws — a nav item is not worth a broken admin page.

A missing capability produces a `404` on the page (it does not reveal that the page exists) and a
`403` from the endpoints.

## The capability

Payload has no concept of a *tool* permission, so the plugin ships the descriptor and the host
grants it. That is one entry in the host's capability list plus whatever its role model already
does. This project's `src/access/permissions.ts` appends it directly:

```ts
import { DATABASE_TOOLS_CAPABILITY } from '@/plugins/databaseTools/options'

export const CAPABILITIES = [
  // …
  DATABASE_TOOLS_CAPABILITY, // name: 'manageDatabase', label: 'Database tools'
] as const
```

The capability is a boolean field on the role, so it needs a migration. This project's is
`src/migrations/20261022_140000_database_tools_capability.ts`:

```ts
import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "capabilities_manage_database" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "roles" DROP COLUMN IF EXISTS "capabilities_manage_database";`)
}
```

(Add the field to the Roles collection's `capabilities` group — one checkbox per capability — and
run `pnpm generate:all` so `payload-types.ts` and the Drizzle schema agree.)

## Endpoints

All of them are mounted under `routes.api` + `apiBasePath` and gated by `access`.

| Method and path | Body / query | Answers |
| --- | --- | --- |
| `GET /api/database/backup` | `?format=sql\|json`, `?tables=a,b`, `?schemaOnly=1` | The dump as a download (`Content-Disposition`, `no-store`). `403` without access. |
| `POST /api/database/maintenance` | `{ action: 'analyze' \| 'vacuum' \| 'vacuum-analyze' \| 'reindex', table?: string }` | `{ ok, statements, durationMs, deadRows? }`. `reindex` rebuilds invalid indexes only. |
| `POST /api/database/repair` | `{ check: 'sequences' \| 'orphans' \| 'indexes' \| 'statistics' \| 'all' }` | `{ ok, fixed, results }`; each result lists the statements it ran. |
| `POST /api/database/restore-inspect` | `{ sql }` | `{ ok, inspection }`: statements, tables, whether it is transactional, whether it would overwrite content. Runs in a rolled-back transaction. |
| `POST /api/database/restore` | `{ sql, confirmation, force? }` | Runs the file. Refuses content unless `confirmation === 'restore'` (`400`), a file over `maxBytes` (`413`), a file with statements that escape the database (`RestoreRefused`, `403`). |
| `POST /api/database/neon/backup` | `{ name?, withEndpoint? }` | `{ ok, branch }` — a branch pinned to now. `501` without a key, `502` on a Neon error. |
| `POST /api/database/neon/restore` | `{ timestamp (ISO 8601), confirmation: 'restore', preserveUnderName? }` | `{ ok, branch, restoredTo }`; the current state is kept as `preserveUnderName` when given. |
| `POST /api/database/neon/delete` | `{ branchId, confirmation: branchId }` | `{ ok, deleted }`. The default and protected branches are refused. |

Every error is one readable sentence (optionally with a `hint`) — never a stack trace, a query or a
connection string. Refusals the admin can fix are `4xx`; database failures are `500`.

## Audit

The plugin calls `audit({ payload, req, summary, changes })` after a restore, a maintenance run, a
repair and each Neon change, with a sentence an admin can read in the audit log
("Restored the database from a .sql file (44 tables)", "Ran ANALYZE on articles", "Created Neon
backup branch backup-2026-10-22-09-30"). `changes` is `{ field, to }[]`; the host's writer decides
the action, the entity and whether to keep it. This project writes an `update` on the `database`
entity through `src/audit/record.ts`.

## Components

The defaults point at this repository's import-map paths:

```ts
components: {
  view: '/components/admin/views/Database#DatabaseView',
  navigation: '/components/admin/nav/DatabaseNavLink#DatabaseNavLink',
}
```

Both are server components, and the plugin passes the resolved options to them as
`serverProps.databaseTools` — the same object the endpoints closed over, so title, path, labels,
migration list and Neon settings cannot drift apart. A host that publishes the plugin as a package
points these at the package's client entry (the object form
`{ path: '@acme/payload-database-tools/client', exportName: 'DatabaseView' }` works too).

The view renders Payload's `DefaultTemplate` (the admin shell, header and sidebar) and reads with
its own `pg` connection; the browser talks to the mounted endpoints, so a client component never
needs a database credential. `serverProps` is only passed to server components: do not replace
either default with a `'use client'` component.

## It does not…

- **Add roles or fields.** A capability checkbox is the host's model. The plugin exports the
  descriptor; the collection, the field and the migration are the host's.
- **Register migrations.** The tools read and write existing tables; the plugin has no schema of
  its own.
- **Edit rows.** A cell editor would skip validation, the audit log and cache revalidation. The
  browser links to the collection instead.
- **Run `VACUUM FULL`, create or drop databases, or need `psql`/`pg_dump`.** The dump is generated
  by Postgres itself; `VACUUM FULL` locks the table for the whole rewrite.
- **Do point-in-time restore without Neon.** Branch history is project storage, not SQL.

## Extracting it to a package

The folder is already laid out as one: `index.ts` (the plugin and its exports), `options.ts` (types,
defaults, `resolveOptions`), `endpoints.ts`, `server/*` (the SQL and the Neon client) and the two
components in this repo's `components/admin`. To publish:

1. Move `src/plugins/databaseTools` to a package root, and the two components under its `client/`
   entry; export `databaseTools`, `DATABASE_TOOLS_CAPABILITY`, the types and `resolveOptions`.
2. `package.json`: `"type": "module"`, `exports` for `.` and `./client`, `"keywords": ["payload-plugin"]`,
   `payload` and `@payloadcms/*` packages as **peer** dependencies, and a major version tied to the
   Payload major (a plugin for Payload 3.x is `1.x` or `3.x`, never a Payload-4 version).
3. Point `components.view` and `components.navigation` at the package's client entry in the docs
   and in this repo's config; the import map needs a rebuild (`pnpm generate:importmap`).
4. Keep a `dev/` Payload project for the tests — the plugin's own tests are the SQL ones in
   `tests/int/database-tools.int.spec.ts` (they need a real Postgres) and the contract ones in
   `tests/int/database-tools-plugin.int.spec.ts`.

Nothing in `server/` imports Next.js or React, and nothing in the components imports a Payload
internal that is not exported from `payload` or `@payloadcms/ui`, so the move is mechanical.

## Tests

| File | Covers |
| --- | --- |
| `tests/int/database-tools.int.spec.ts` | The SQL against this project's PostgreSQL: introspection, dumps, restore inspection and refusal, maintenance, repairs, and the Neon client against a fake `fetch`. |
| `tests/int/database-tools-plugin.int.spec.ts` | The packaging: which view/nav/endpoints a config gets, option defaults and path normalisation, `restore: false` / `neon: false`, the duplicate-view error, the capability descriptor, and `defaultAccess`. |
| `tests/e2e/database.e2e.spec.ts` | `/admin/database` in a browser: the cards, a backup download, and the `404`/hidden-link behaviour for a user without the capability. |

See also [project structure](../project-structure.md) and the
[admin UI guide](../ui-modernization/admin-ui-guide.md#database-page) for the page itself.
