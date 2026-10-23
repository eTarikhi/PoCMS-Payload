import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * The email log (`src/collections/EmailLogs.ts`) and the capability that guards it.
 *
 * Started from what `pnpm migrate:create` generated, then corrected by hand, because the generator
 * diffs the config against its own last snapshot rather than against the database — and this
 * project has hand-written migrations it does not know about. Three of the statements it produced
 * describe changes that are already in every database built from `src/migrations`:
 *
 *   - `ALTER TYPE "enum_job_runs_task" ADD VALUE 'database-upkeep'` and `'database-backup'`, added by
 *     `20261022_160000_database_upkeep_job` and `20261023_050000_database_backup_job`. A bare
 *     `ADD VALUE` on an existing value fails, so the file would not have run at all.
 *   - `ALTER TABLE "roles" ADD COLUMN "capabilities_manage_database"`, added by
 *     `20261022_140000_database_tools_capability`.
 *   - `ALTER TABLE "media" DROP COLUMN "_objectkey"`, a column no migration here ever created and
 *     no database has: an artefact of the blob storage plugin's shape in the snapshot. Dropping it
 *     would fail on a fresh database and, on one that somehow had it, would delete a column nobody
 *     asked this migration to touch.
 *
 * The generated `down` rebuilt `enum_job_runs_task` from its four original values, which would have
 * destroyed every run record of the two tasks this project added. The `down` below undoes this
 * migration and nothing else.
 *
 * What is genuinely new: two enum types, the `email_logs` table with its indexes, the relationship
 * column Payload's document-locking table needs for the new collection, and the role column for the
 * `manageEmails` capability.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_logs_status" AS ENUM('sent', 'redirected', 'skipped', 'failed');`)
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_logs_template" AS ENUM('forgot-password', 'verify-email', 'welcome', 'test', 'digest', 'payload');`)

  await db.execute(sql`
   CREATE TABLE "email_logs" (
   	"id" serial PRIMARY KEY NOT NULL,
   	"status" "public"."enum_email_logs_status" NOT NULL,
   	"template" "public"."enum_email_logs_template",
   	"to" varchar NOT NULL,
   	"redirected_from" varchar,
   	"from" varchar,
   	"subject" varchar NOT NULL,
   	"error" varchar,
   	"provider" varchar,
   	"message_id" varchar,
   	"bytes" numeric,
   	"duration_ms" numeric,
   	"triggered_by" varchar,
   	"context" jsonb,
   	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
   );`)

  await db.execute(sql`
   ALTER TABLE "roles" ADD COLUMN "capabilities_manage_emails" boolean DEFAULT false;`)

  // Payload's document-locking table points at every collection that can be edited, so a new one
  // needs its relationship column, foreign key and index.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_logs_id" integer;`)
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_logs_fk"
     FOREIGN KEY ("email_logs_id") REFERENCES "public"."email_logs"("id")
     ON DELETE cascade ON UPDATE no action;`)
  await db.execute(sql`
   CREATE INDEX "payload_locked_documents_rels_email_logs_id_idx"
     ON "payload_locked_documents_rels" USING btree ("email_logs_id");`)

  await db.execute(sql`
   CREATE INDEX "email_logs_status_idx" ON "email_logs" USING btree ("status");
   CREATE INDEX "email_logs_template_idx" ON "email_logs" USING btree ("template");
   CREATE INDEX "email_logs_to_idx" ON "email_logs" USING btree ("to");
   CREATE INDEX "email_logs_updated_at_idx" ON "email_logs" USING btree ("updated_at");
   CREATE INDEX "email_logs_created_at_idx" ON "email_logs" USING btree ("created_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "email_logs_created_at_idx";
   DROP INDEX "email_logs_updated_at_idx";
   DROP INDEX "email_logs_to_idx";
   DROP INDEX "email_logs_template_idx";
   DROP INDEX "email_logs_status_idx";`)

  await db.execute(sql`
   DROP INDEX "payload_locked_documents_rels_email_logs_id_idx";`)
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_logs_fk";`)
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_logs_id";`)

  await db.execute(sql`
   ALTER TABLE "roles" DROP COLUMN "capabilities_manage_emails";`)
  await db.execute(sql`
   DROP TABLE "email_logs" CASCADE;`)

  await db.execute(sql`
   DROP TYPE "public"."enum_email_logs_template";`)
  await db.execute(sql`
   DROP TYPE "public"."enum_email_logs_status";`)
}
