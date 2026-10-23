import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_job_runs_task" ADD VALUE 'database-upkeep';
  ALTER TABLE "roles" ADD COLUMN "capabilities_manage_database" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "job_runs" ALTER COLUMN "task" SET DATA TYPE text;
  DROP TYPE "public"."enum_job_runs_task";
  CREATE TYPE "public"."enum_job_runs_task" AS ENUM('trash-cleanup', 'pagespeed-report', 'publish-scheduled', 'broken-links');
  ALTER TABLE "job_runs" ALTER COLUMN "task" SET DATA TYPE "public"."enum_job_runs_task" USING "task"::"public"."enum_job_runs_task";
  ALTER TABLE "roles" DROP COLUMN "capabilities_manage_database";`)
}
