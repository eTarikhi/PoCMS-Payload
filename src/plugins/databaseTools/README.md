# databaseTools

A Payload 3 plugin that adds a database page to the admin: tables and a read-only row browser, a
logical SQL/JSON backup, a guarded restore, `VACUUM`/`ANALYZE`/`REINDEX`, narrow repairs (sequences,
orphan relation rows, invalid indexes, missing statistics) and — on Neon — branch backup,
point-in-time restore and branch deletion. The page, its eight endpoints and its sidebar link are
registered by one call; the host keeps the decisions that are its own.

```ts
import { databaseTools } from '@/plugins/databaseTools'

buildConfig({
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

## Layout

| File | What it is |
| --- | --- |
| `index.ts` | The `Plugin` factory, `withServerProps`, and the exports a host imports |
| `options.ts` | Option types with JSDoc, `DEFAULTS`, `resolveOptions`, `defaultAccess`, the capability descriptor |
| `endpoints.ts` | The endpoints, one per action, all behind `access`, all with readable errors |
| `server/connection.ts` | The `pg` client, the connection string and its failure messages |
| `server/introspection.ts` | Tables, columns, indexes, constraints, rows |
| `server/backup.ts` | SQL and JSON dumps rendered by Postgres |
| `server/restore.ts` | Inspection, refusals and the runner |
| `server/maintenance.ts` | `ANALYZE`, `VACUUM`, `VACUUM ANALYZE`, `REINDEX` |
| `server/repair.ts` | Checks and their narrow, idempotent fixes |
| `server/neon.ts` | The Neon API client (branches, PITR, deletion) |
| `server/selection.ts` | Which table names a request may ask for |

The components live outside the folder, in this app's admin slots:
`src/components/admin/views/Database` (the page, a server component) and
`src/components/admin/nav/DatabaseNavLink` (the link). Both receive the resolved options as
`serverProps.databaseTools`; `options.components` points elsewhere when the plugin is packaged.

## Notes

- `access`, `navigation.visible` and the host's capability must agree. The nav renders without a
  request, so it only gets `{ user }`.
- `audit` failures are logged and swallowed: a completed restore must not become an error because
  the log write failed.
- `NEON_API_KEY`, `NEON_PROJECT_ID` and `NEON_BRANCH_ID` are the defaults; a blank value in `.env`
  counts as unset.
- The plugin adds no fields and no migrations: the capability column and its migration belong to the
  host.

Full documentation: [`docs/plugins/database-tools.md`](../../../docs/plugins/database-tools.md).
