# Database tools plugin

`src/plugins/databaseTools` is a Payload 3 plugin. One call adds a database page to the admin, the
endpoints behind it and a sidebar link; the SQL, the Neon client and the checks live with the
plugin, and the host application decides *who* may use them, *where* audit entries go and *which*
migrations it expects.

It began as a page in this project (see [the admin UI guide](../ui-modernization/admin-ui-guide.md#database-page))
and was packaged the way Payload documents plugins so another Payload project can mount the same
tools. Everything except the components is framework-free TypeScript; the components use Payload's
admin slots and the project's `acn:`-prefixed Tailwind classes.

In one line per card: the database’s size and connection state; a logical SQL/JSON backup and a
guarded restore; a read-only table browser with filters, sorting and CSV export; the maintenance
Postgres can do itself; the repairs that are safe to automate; the live sessions and locks, with
cancel/terminate for a runaway query; and, on Neon, branches and point-in-time restore.

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
| `GET /api/database/table` | On (filtered rows as JSON, or CSV) | `server/introspection.ts` |
| `GET /api/database/sessions` | On, `sessions: false` removes it with its two actions | `server/sessions.ts` |
| `POST /api/database/sessions/cancel` and `…/terminate` | On, `sessions: false` removes both | `server/sessions.ts` |
| `POST /api/database/maintenance` | On | `server/maintenance.ts` |
| `POST /api/database/repair` | On | `server/repair.ts` |
| `POST /api/database/restore-inspect` and `…/restore` | On, `restore: false` removes both | `server/restore.ts` |
| `GET /api/database/migration` and `…/seed` | On, `snapshots: false` removes both | `server/schemaMigration.ts`, `server/seedSnapshot.ts` |
| `POST /api/database/diff` | On, `snapshots: false` removes it | `server/diff.ts` |
| `POST /api/database/seed/apply` | On, `snapshots: false` or `snapshots.apply: false` removes it | `server/seedSnapshot.ts` |
| `GET /api/database/settings` | On | `server/settings.ts` |
| `GET /api/database/bloat` | On | `server/bloat.ts` |
| `GET /api/database/statements` | On; answers with the reason when the server lacks the extension | `server/statements.ts` |
| `GET /api/database/drift` | On, `drift: false` removes it with its card | `server/drift.ts`, `server/migrationSources.ts` |
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
| `sessions` | `boolean` | `true` | The live sessions card and its three endpoints: connections, long statements, idle-in-transaction sessions, who blocks whom, and the guarded `pg_cancel_backend` / `pg_terminate_backend` actions. |
| `export` | `false \| { maxRows? }` | `{ maxRows: 10000 }` | The "Export CSV" button and `GET /table?format=csv`. `maxRows` is capped at 100,000 whatever it says. |
| `snapshots` | `false \| { maxRowsPerTable?, apply? }` | `{ maxRowsPerTable: 5000, apply: true }` | The files this page writes and reads: the generated migration, the content seed, the schema comparison, and the endpoint that loads a seed. `apply: false` keeps the read-only three and removes the write. |
| `drift` | `false \| { readSources? }` | reads `src/migrations/<name>.ts` for every name in `migrations` | The migration drift guard: its card and `GET /drift`. `readSources` returns `{ sources, unreadable }`, so a host whose migrations are compiled into a bundle (and has no files to read) passes its own reader — or `false` and the card goes. |
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
| `GET /api/database/table` | `?table=…&format=json\|csv\|ddl\|plan`, `?limit=&offset=&sort=&dir=asc\|desc`, and `f=column:operator:value` repeated | JSON: `{ ok, page: { rows, total, filters, sort, direction, ignoredFilters } }`. CSV: a download, with `X-Rows-Exported` and `X-Rows-Truncated` headers. DDL: the table's `CREATE TABLE`, constraints and indexes as `application/sql`. Operators: `eq`, `neq`, `contains`, `starts`, `gt`, `gte`, `lt`, `lte`, `isnull`, `notnull`. |
| `GET /api/database/sessions` | — | `{ ok, sessions: { role, isSuperuser, canSeeAllQueries, sessions: [{ pid, user, state, query, seconds, blockedBy, own }], active, idle, idleInTransaction, blocked, longest } }`. |
| `POST /api/database/sessions/cancel` | `{ pid }` | `{ ok, pid }` — `pg_cancel_backend`: stops the running statement, keeps the connection. Refused for its own session, for a background process, and for a session that is not running a statement (`400`). |
| `POST /api/database/sessions/terminate` | `{ pid, confirmation: pid }` | `{ ok, pid }` — `pg_terminate_backend`: ends the session and rolls its transaction back. The typed id is required. |
| `POST /api/database/maintenance` | `{ action: 'analyze' \| 'vacuum' \| 'vacuum-analyze' \| 'reindex', table?: string }` | `{ ok, statements, durationMs, deadRows? }`. `reindex` rebuilds invalid indexes only. |
| `POST /api/database/repair` | `{ check: 'sequences' \| 'orphans' \| 'indexes' \| 'statistics' \| 'all' }` | `{ ok, fixed, results }`; each result lists the statements it ran. |
| `POST /api/database/restore-inspect` | `{ sql }` | `{ ok, inspection }`: statements, tables, whether it is transactional, whether it would overwrite content. Runs in a rolled-back transaction. |
| `POST /api/database/restore` | `{ sql, confirmation, force? }` | Runs the file. Refuses content unless `confirmation === 'restore'` (`400`), a file over `maxBytes` (`413`), a file with statements that escape the database (`RestoreRefused`, `403`). |
| `GET /api/database/migration` | `?mode=guarded\|fresh`, `?tables=a,b` | A Payload migration file as a download (`text/typescript`, `no-store`), written from this database's catalogs. |
| `GET /api/database/seed` | `?collections=a,b`, `?tables=a,b`, `?maxRows=` | A content seed as a download (`application/json`): the collections this config defines, parents first, with the sequence values to set afterwards. |
| `POST /api/database/diff` | `{ json }` | `{ ok, diff }` — a JSON backup from another database compared with this one: missing tables and columns (with the `ALTER TABLE` that would add them), types, nullability and defaults that differ, what only exists here, and row counts. Read-only. |
| `POST /api/database/seed/apply` | `{ json, confirmation: 'seed' }`, or `{ json, dryRun: true }` (`?dryRun=1` works too) | `{ ok, tables, rows, sequences, warnings }` — deletes the rows of the tables the file names, inserts its rows, sets the sequences. One transaction; the typed word is required (`400`), a file over the restore limit is `413`, a file that is not a seed or names a missing table is `400`. A dry run needs no confirmation and writes nothing: `{ ok, dryRun: true, plan: { tables: [{ name, willDelete, willInsert, estimated }], rows, sequences, warnings } }`, and it refuses a seed this database cannot load, which is the point of asking first. |
| `GET /api/database/settings` | — | `{ ok, settings }`: the server version and uptime, where the connection goes (host, port, database, pooled or direct, which environment variable), the settings that cancel work (`statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`) and the ones that size it (`max_connections`, `shared_buffers`, `work_mem`, `maintenance_work_mem`, `effective_cache_size`, the autovacuum family) with each value in units a person reads, the sessions of this database by state, user and application against the ceiling, and the cumulative counters since `stats_reset`. Read-only; `absent` names the settings this server does not report. |
| `GET /api/database/bloat` | `?limit=` (≤ 500, default 60) | `{ ok, bloat }`: per table the live and dead tuples, the dead ratio, table/index/total size, an **estimated** bloat in bytes (dead tuples × the table's own average row width — `pgstattuple` is not available on most managed servers), the last vacuum/autovacuum/analyze and their counts, writes since the last analyze, the dead-tuple count at which autovacuum would fire (this table's own `reloptions` winning over the server setting), and whether it is due. Plus the server's autovacuum configuration and totals. Read-only. |
| `GET /api/database/statements` | `?limit=` (≤ 100, default 15) | `{ ok, statements }`: `pg_stat_statements` ranked three ways — total time, mean time, calls — with rows, cache-hit ratio and the role, plus the extension's state and when counting started. When the extension is absent, or present but not in `shared_preload_libraries`, `available` is `false` and `hint` says which of those it is and who can change it. Query text arrives normalised by Postgres (literals are already `$1`) and is truncated to one line. Read-only. |
| `GET /api/database/drift` | — | `{ ok, clean, drift: [{ kind, table, object? }], pending: […], counts, unreadable }`. `kind` is `undeclared-table`/`-column`/`-index`/`-type` for what the database has and no migration declares, `missing-table`/`-column` for the reverse. `501` when no migration source could be read. Read-only. |
| `POST /api/database/neon/backup` | `{ name?, withEndpoint? }` | `{ ok, branch }` — a branch pinned to now. `501` without a key, `502` on a Neon error. |
| `POST /api/database/neon/restore` | `{ timestamp (ISO 8601), confirmation: 'restore', preserveUnderName? }` | `{ ok, branch, restoredTo }`; the current state is kept as `preserveUnderName` when given. |
| `POST /api/database/neon/delete` | `{ branchId, confirmation: branchId }` | `{ ok, deleted }`. The default and protected branches are refused. |

Every error is one readable sentence (optionally with a `hint`) — never a stack trace, a query or a
connection string. Refusals the admin can fix are `4xx`; database failures are `500`.

### Filters and sorting

The table browser's filter bar writes `f=column:operator:value` into the URL, so a filtered view is
a link that can be bookmarked, shared or opened from the API. `server/filters.ts` parses the value
(the first two colons separate; the rest belong to the value) and builds a parameterised `where`:

- the column must exist in the catalog — anything else is reported as ignored, never interpolated;
- every value is a parameter, cast to the column's own type (`$1::integer`), so numbers, dates,
  uuids and enums compare as their type instead of as strings;
- `contains`/`starts` compare the column's text form case-insensitively, which is the only reading
  that works for `jsonb` and enums;
- a value that does not parse as the column's type is a Postgres error the page shows as a sentence.

Sorting is the same idea: the column must exist, and `ctid` breaks ties so paging never repeats or
skips a row when the sort key is not unique.

### DDL and where the bytes are

The table card opens a **Schema (DDL)** panel: `CREATE TABLE` with the columns, defaults, primary and
unique constraints, then `ALTER TABLE … ADD CONSTRAINT` for the checks and foreign keys and each
index's own `CREATE INDEX` definition. Every line is Postgres's deparsing (`format_type`,
`pg_get_expr`, `pg_get_constraintdef`, `pg_get_indexdef`), not a guess from the Payload config, so it
shows the database as it is. It is a description, not a migration: enum and domain types are named
but not created, and ownership, grants and the referencing table's foreign keys are not included.
`GET /table?format=ddl` downloads the same text.

The header also splits the table's size into heap and indexes (`pg_table_size` and
`pg_indexes_size`), which is the number to look at before choosing between `VACUUM` and `REINDEX`.

### Indexes

The page counts every user index and ranks them by size, then asks three questions of the catalog:
an index that has **never been scanned** (zero scans since the counters last started, on a table that
has been read, and not backing a constraint — a unique index earns its space by refusing duplicates),
two indexes with the **same definition** (same key columns, operator classes and options, neither
partial nor expression-based), and an index left **invalid** by a failed `CREATE INDEX
CONCURRENTLY`.

Everything is read-only. Dropping an index is a schema change with a migration behind it, so the
card names the index and its size and stops there; invalid indexes point at the maintenance card,
which rebuilds them. "Never scanned" is presented as a hint rather than a verdict, with the moment
the counters started, because a small site scans little and an index that serves one admin query a
week still earns its space.

### The query plan

The table card opens **Query plan**: `EXPLAIN (FORMAT JSON)` of the page's own query — the same
`where`, the same `order by … , ctid`, the same `limit`/`offset` — with the nodes flattened, each
node's estimated rows and total cost, and a few sentences saying what the plan does ("Seq Scan on
articles: the whole table is read and the condition applied to every row, so the filter has no index
it can use"). `format=plan` returns the same as JSON.

It is `EXPLAIN` **without** `ANALYZE`: the statement is planned, never executed, so opening the panel
cannot load the database or hold a lock. The numbers are the planner's estimates, and the panel says
so — a sequential scan of a 40-row table is the correct plan, and the notes describe it instead of
calling it a problem.

### Exporting a table

`GET /table?format=csv` writes the filtered table as CSV, capped by `export.maxRows`; the page's
"Export CSV" button points at the same URL, so what downloads is exactly what is on screen. Values
are Postgres's own text form, objects are JSON, null is an empty cell, and a value containing a
comma, a quote or a newline is quoted by RFC 4180 rules. This is for reading — the `.sql` backup
remains the thing that restores.

### The generated migration

`GET /migration` writes a Payload migration file from the connected database — on a deployment that
is the Neon branch, so this is how a branch that drifted ahead of the repository gets a migration
again. Every statement is Postgres's own deparsing (`format_type`, `pg_get_expr`,
`pg_get_constraintdef`, `pg_get_indexdef`), grouped in the order a restore needs: types, sequences,
tables, keys, indexes, foreign keys.

Two modes, and the difference is whether the file may be run against a database that already has the
schema:

- **`guarded`** (the default, and the one to commit): `CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, and — because neither `CREATE TYPE` nor `ADD CONSTRAINT` has an
  `IF NOT EXISTS` — a `DO $do$ … END $do$;` block that checks `pg_type`/`pg_constraint` first. Run
  against the database it came from it changes nothing; run against an empty database it builds the
  schema. Its `down` is a documented no-op: a snapshot never drops anything.
- **`fresh`**: plain `CREATE` statements with a `down` that drops the tables (children first) and the
  types. For a file that defines a database on its own; committing it beside the baseline would put
  two migrations in charge of the same tables.

Enum types are always the database's whole set, not only the ones the selected tables use, because a
column's type is not visible in the table's own definition. Rows, ownership, grants, extensions and
the `payload_migrations` history are not included — `pnpm migrate:adopt` is the command that records
an existing schema as migrated, and the two are meant to be used together.

The CLI writes the same file into the checkout and registers it:

```bash
pnpm db:schema-from --from neon                     # src/migrations/<stamp>_schema_snapshot.ts
pnpm db:schema-from:neon                            # the same thing, no arguments to get wrong
pnpm db:schema-from --from neon --mode fresh --out /tmp
pnpm db:schema-from --tables articles,_articles_v --no-register
```

### The content seed

`GET /seed` writes the content of the connected database as one JSON file that a *local* database can
load — the way development gets the real articles instead of fixtures. It is not a dump:

- only the collections this config defines, plus the globals, and their `_rels`, array and `_…_v`
  version tables; never `users`, `roles`, `job_runs`, `pagespeed_reports`, `audit_logs` or Payload's
  own tables (`seedableCollections` in `server/seedSnapshot.ts` is the list, and a host's
  `excludeTables`-style narrowing is the `?collections=` parameter);
- rows are read by Postgres (`row_to_json`) and written back with `jsonb_populate_recordset`, so
  enums, `timestamptz`, `jsonb`, arrays, `bytea` and `numeric` keep their own textual form instead of
  JavaScript's idea of them;
- tables are ordered by their foreign keys (parents first) from `pg_constraint`, because Payload's
  keys are not deferrable; a cycle is broken where it closes and named in `warnings`;
- each table's sequence value is recorded, and `apply` sets it past the highest id, so the next
  insert does not collide with a seeded row.

`POST /seed/apply` (and `pnpm db:seed-apply <file> --yes`) deletes the rows of the tables the file
names, inserts the file's rows and sets the sequences, in one transaction — a seed replaces, it does
not merge, and a failure leaves the database as it was. It refuses a file that is not a seed (a
backup is not a seed) and one that names a table this database does not have.

```bash
pnpm db:seed-from --from neon                          # write src/seed/snapshot.json
pnpm db:seed-from:neon                                 # the same thing, no arguments to get wrong
pnpm db:seed-from --from neon --apply --yes            # …and load it into the local database
pnpm db:seed-from --collections articles,projects --max-rows 200
pnpm db:seed-apply src/seed/snapshot.json --yes        # a file that is already on disk
pnpm db:seed-load                                      # = the line above, for the default path
```

The three argument-free spellings (`db:schema-from:neon`, `db:seed-from:neon`, `db:seed-load`) exist
because the admin **Terminal** may only run `pnpm run <script>` — no arguments, ever — so a command
that needs a flag needs a script with the flag baked in. On `/admin/database`'s sibling page
`/admin/terminal` (development builds only, `useTerminal`) they are the entries *Migration from this
database*, *Seed from this database* and *Load that seed into the local database*; the last is
flagged `database` and warns in red that it replaces rows before it runs.

`--from neon` uses `DATABASE_DIRECT_URL`, then `POSTGRES_URL`; `--from local` always uses
`POSTGRES_URL`; `--from <url>` connects wherever the URL points. Credentials are never printed.
Review the file before committing it: it holds whatever the source database holds, including content
that may not be public yet. Media *rows* are included and their `url` still points at the blob store,
so images keep working locally without copying any file.

### Comparing two databases

`POST /diff` takes a **JSON backup** — the file the Backup card already writes — and compares its
schema with the connected database. That is the whole trick: the JSON backup records every column as
Postgres names it (`format_type`, `pg_get_expr`), so a file downloaded from the Neon branch's admin
page compares against a local database with no second connection string and no second credential.

The report is ordered by what it costs you: **missing here** (a table or column the other database
has, which is what breaks a query), then **different here** (type, nullability, default), then **only
here** (a column or table this database has and the file does not). Row counts come with it, because
"same shape, no content" and "missing column" are different problems with different fixes.

Two rules keep it honest:

- it suggests, it never runs. A missing column comes with the `ALTER TABLE … ADD COLUMN` that would
  add it and a caution when that is not enough (`NOT NULL` needs a default or an empty table; a type
  change may need `USING` and always takes a lock). Nothing on the page can execute it.
- it never proposes a `DROP`. A table or column that only exists here may be newer than the file, so
  it is reported and left alone.

A file that named tables (`?tables=…` when it was downloaded, recorded as `selection` in the JSON) is
taken at its word: what it left out is a choice, not drift, so the "only here" findings are skipped
and the card says why. A missing table is not offered as a statement at all — that is a migration's
job, and `pnpm db:schema-from` writes one from the other database.

### Migration drift

`push: false` makes `src/migrations` the only writer of this schema, so every table, column, index
and enum type in the database should be traceable to a statement in one of them. The drift guard
checks exactly that, from both sides:

- **declared** — the `up()` of every migration the host lists in `options.migrations`, with the SQL
  lifted out of its `sql` template literals and parsed statement by statement: `CREATE TABLE` bodies
  (columns told apart from table constraints), multi-action `ALTER TABLE … ADD COLUMN a, ADD COLUMN b`,
  `CREATE INDEX`, `CREATE TYPE`, the `DO $do$` blocks a guarded snapshot wraps its catalog checks in,
  and the `DROP`s that cancel an earlier `CREATE`. `down()` is never read: it drops what `up()` made.
- **live** — `pg_class`, `pg_attribute`, `pg_indexes` and `pg_type` for `public`.

A live object no migration declares is **drift** (`undeclared-*`): somebody changed the database by
hand, and the next environment built from the migrations will not have it. The fix is a migration
(`pnpm db:schema-from` writes one from the catalogs) or dropping the object. A declared object this
database lacks is reported separately as **pending** (`missing-*`), which is normally a migration
that has not run here — `pnpm migrate:status` names it — so it warns rather than fails.

Migrations are TypeScript, and some build their SQL in a loop
(`ALTER TABLE ${sql.identifier(table)} ADD COLUMN "_order" …`). The table name in such a statement
cannot be known statically, so the parser keeps the *shape*: the column excuses any table's
`_order`, a runtime-built index name is matched by its literal tail (`__order_idx`), and a column
dropped from a runtime-named table cancels it everywhere. `counts.wildcards` says how many
statements were matched that way, so the report is honest about how much of it was exact.

The same check runs as `pnpm db:drift` (exit code 1 on drift, `--json` for a machine) and as the
read-only Terminal entry *Migration drift check*. Types, nullability, defaults and constraints are
not compared — that is `POST /api/database/diff` (two databases) or `GET /api/database/migration`
(one database's whole shape).

### Server settings, bloat and statement history

Three read-only cards answer the questions the rest of the page cannot:

- **Server settings and connections** — *why did my query get cancelled* (`statement_timeout`),
  *why does the pool refuse new clients* (`max_connections` against the sessions actually open, with
  the superuser-reserved slots taken out), *why did a sort spill to disk* (`work_mem`, and the
  temp-file counter that says it happened), and *is this the pooled endpoint or the direct one*.
  Values arrive the way Postgres stores them (`shared_buffers` in 8 kB blocks, timeouts in
  milliseconds) and `formatSetting` renders them; a `0` timeout reads as "off (no limit)", which is
  what Postgres means by it. Nothing here is changeable: `ALTER SYSTEM` belongs to whoever operates
  the server, and a web page is the wrong place for it.
- **Bloat and vacuum health** — dead tuples per table, when each was last vacuumed and analyzed, and
  the autovacuum trigger (`threshold + scale_factor × rows`, with a table's own `reloptions` winning)
  so "is this table due?" is arithmetic rather than a guess. The bloat column is an **estimate**: dead
  tuples times the table's average row width. Measuring it exactly needs `pgstattuple`, a
  superuser-only extension most managed servers (Neon included) do not offer, and the card says which
  kind of number it is showing. The `Vacuum` button on a row is the existing maintenance endpoint
  scoped to that table; `VACUUM FULL` stays absent, because it locks the table for the whole rewrite.
- **Slowest statements** — `pg_stat_statements` ranked by total time, mean time and call count. It is
  an extension that only records when loaded at server start, so the first query finds out whether it
  can answer at all and, when it cannot, says why in one sentence instead of showing an empty table
  that reads like a quiet database. PostgreSQL 13 renamed its time columns, so the `SELECT` is built
  from the columns the view actually has.

All three fetch on the client, each with the moment it was read beside it: they are snapshots of a
moment, not part of the page's identity, and a number that says when it was read is a number you can
trust.

## Audit

The plugin calls `audit({ payload, req, summary, changes })` after a restore, an applied seed, a
maintenance run, a repair and each Neon change, with a sentence an admin can read in the audit log
("Restored the database from a .sql file (44 tables)", "Applied a seed file (26 tables, 139 rows)",
"Ran ANALYZE on articles", "Created Neon backup branch backup-2026-10-22-09-30"). `changes` is `{ field, to }[]`; the host's writer decides
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
- **Apply a generated migration.** The file is written to `src/migrations` and registered in
  `src/migrations/index.ts`; running it is `pnpm migrate`, after a human has read it. Generating
  schema and applying schema stay two steps, because the second one is a deploy.
- **Copy media files, secrets or accounts into a seed.** A seed carries content rows only: the
  `media` rows keep their blob URLs, and `users`, `roles`, sessions and the audit log are never in
  one, so a seed from production cannot hand a local database a production password hash.

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
| `tests/int/database-tools-plugin.int.spec.ts` | The packaging: which view/nav/endpoints a config gets, option defaults and path normalisation, `restore: false` / `neon: false` / `sessions: false`, the export cap, the duplicate-view error, the capability descriptor, and `defaultAccess`. |
| `tests/int/database-rows.int.spec.ts` | Filters and sorting (including the injection attempt, the type cast and a value that is not the column's type), CSV quoting and caps, the index advisor, the query plan, and the session list — against real backends for the blocker, the cancel and the terminate. |
| `tests/int/database-snapshots.int.spec.ts` | The two generated files and the comparison, against scratch tables: guarded statements that run twice and rebuild the same columns in an empty database, from-scratch mode's `down`, the parsed TypeScript being valid, foreign-key order, a broken cycle, exact enum/timestamp/`jsonb`/array/`bytea`/`numeric` values through the seed round trip, sequences left past the highest id, the row cap and its warning, the refusals, and a diff that finds a dropped column, a widened type, a
lost `NOT NULL`, a changed default and a new row while refusing to propose a `DROP`. |
| `tests/e2e/database.e2e.spec.ts` | `/admin/database` in a browser: the cards, a backup download, and the `404`/hidden-link behaviour for a user without the capability. |

See also [project structure](../project-structure.md) and the
[admin UI guide](../ui-modernization/admin-ui-guide.md#database-page) for the page itself.
