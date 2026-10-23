import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * The `database-upkeep` task and the `manageDatabase` capability, as the generator wrote them.
 *
 * Both statements are guarded now, and the reason is worth keeping visible: this file was generated
 * by `pnpm migrate:create`, which diffs the config against its own last snapshot rather than against
 * a database, so it did not know that two hand-written migrations had already made these changes —
 * `20261022_160000_database_upkeep_job` added the enum value and
 * `20261022_140000_database_tools_capability` added the column. Un-guarded, the file failed on any
 * database built from `src/migrations`: `ADD VALUE` on an existing label and `ADD COLUMN` on an
 * existing column are both errors, and a migration that cannot run is a fresh environment that
 * cannot be built.
 *
 * `IF NOT EXISTS` and the catalog check make this file what it should have been: a record of the two
 * changes that is harmless on a database which already has them, and sufficient on one that does not
 * (a database restored from a dump taken before those migrations, say).
 *
 * `down` is deliberately empty. Both objects belong to the earlier migrations, so undoing them here
 * would remove work this file did not do — and on any database where the guarded `up` was a no-op, a
 * `down` that dropped the column would leave the schema in a state no migration sequence produces.
 * Postgres has no `DROP VALUE` for the enum either; the two files that own these objects explain the
 * same choice.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_job_runs_task" ADD VALUE IF NOT EXISTS 'database-upkeep';`)

  await db.execute(sql`
   DO $do$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'roles'
          AND column_name = 'capabilities_manage_database'
     ) THEN
       ALTER TABLE "roles" ADD COLUMN "capabilities_manage_database" boolean DEFAULT false;
     END IF;
   END $do$;`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // See above: both objects are created by earlier migrations, and an enum value cannot be removed
  // without recreating the type and every row that uses it.
}
