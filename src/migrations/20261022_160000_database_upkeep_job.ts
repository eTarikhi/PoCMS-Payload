import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * The `database-upkeep` job (`src/jobs/tasks/databaseUpkeep.ts`).
 *
 * `jobs.task` is a Postgres enum generated from the registry, so a new task needs its value added
 * before the runner can record a run. `IF NOT EXISTS` keeps a re-run harmless; Postgres appends the
 * value, and order does not matter here.
 *
 * `down` is deliberately empty: Postgres has no `DROP VALUE`, and dropping the value would first
 * mean rewriting the type and every existing run that used it. A leftover enum value is inert — the
 * registry is what decides which tasks can run.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_job_runs_task" ADD VALUE IF NOT EXISTS 'database-upkeep';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // See above: an enum value cannot be removed without recreating the type and its column.
}
