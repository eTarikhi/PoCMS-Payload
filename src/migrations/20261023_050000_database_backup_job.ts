import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * The `database-backup` job (`src/jobs/tasks/databaseBackup.ts`).
 *
 * `job_runs.task` is a Postgres enum generated from the task registry, so a new task needs its value
 * added before the runner can record a run of it — and before the runner can even *query* the
 * collection, because a `where` on that column with an unknown value fails at the type, not at the
 * row. `IF NOT EXISTS` keeps a re-run harmless; Postgres appends the value, and its position in the
 * type does not matter here.
 *
 * `down` is deliberately empty, as it is for every enum value this project adds: Postgres has no
 * `DROP VALUE`, and removing one would mean rewriting the type and every existing run that used it.
 * A leftover enum value is inert — the registry decides which tasks can run.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_job_runs_task" ADD VALUE IF NOT EXISTS 'database-backup';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // See above: an enum value cannot be removed without recreating the type and its column.
}
