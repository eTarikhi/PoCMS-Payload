# Archived migrations

These migrations were generated on a different line of work and are **not** part of the schema
history in `../index.ts`. They are kept for reference only.

Why they are not registered:

- `20261001…` to `20261017…` predate `20261020_125655_baseline` and create the whole schema
  themselves. Running one and then the baseline would fail with "relation already exists".
- `20261020_211831`, `20261020_220112_admin_ui` and `20261020_221922_admin_changes` are alternative
  full-schema generations of the roles work.
- `20261022_000244` is the generated duplicate of the hand-written
  `../20261021_163000_media_folders` (the folders feature).

`pnpm migrate:create` regenerates `../index.ts` from every `.ts` file in `src/migrations`, so
leaving these at the top level would put them back into the registry on the next generate — and a
fresh database would then run two migrations that create the same tables. Moving them here keeps
them out of that scan.

Their `.json` snapshots stay in `src/migrations` on purpose: `migrate:create` diffs the schema
against the newest snapshot by file name, and `20261022_000244.json` describes the newest schema
(including folders). Removing it would make the next generated migration re-create tables that
already exist.

`tests/int/migrations.int.spec.ts` asserts that the registry and the `.ts` files in
`src/migrations` match, so this cannot drift again.
