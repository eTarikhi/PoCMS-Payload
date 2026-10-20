import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_job_runs_task" AS ENUM('trash-cleanup', 'pagespeed-report', 'broken-links');
  CREATE TYPE "public"."enum_job_runs_status" AS ENUM('queued', 'running', 'done', 'failed', 'cancelled');
  CREATE TYPE "public"."enum_job_runs_trigger" AS ENUM('manual', 'cron');
  CREATE TYPE "public"."enum_pagespeed_reports_scores_rating" AS ENUM('good', 'average', 'poor');
  CREATE TYPE "public"."enum_pagespeed_reports_metrics_rating" AS ENUM('good', 'average', 'poor');
  CREATE TYPE "public"."enum_pagespeed_reports_strategy" AS ENUM('mobile', 'desktop');
  CREATE TABLE "job_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"task" "enum_job_runs_task" NOT NULL,
  	"status" "enum_job_runs_status" DEFAULT 'queued' NOT NULL,
  	"trigger" "enum_job_runs_trigger" DEFAULT 'manual' NOT NULL,
  	"started_by_id" integer,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"duration_ms" numeric,
  	"summary" varchar,
  	"error" varchar,
  	"log" varchar,
  	"details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pagespeed_reports_scores" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"score" numeric,
  	"rating" "enum_pagespeed_reports_scores_rating"
  );
  
  CREATE TABLE "pagespeed_reports_metrics" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"display" varchar,
  	"value" numeric,
  	"rating" "enum_pagespeed_reports_metrics_rating"
  );
  
  CREATE TABLE "pagespeed_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"final_url" varchar,
  	"strategy" "enum_pagespeed_reports_strategy" NOT NULL,
  	"fetched_at" timestamp(3) with time zone NOT NULL,
  	"lighthouse_version" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "job_runs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pagespeed_reports_id" integer;
  ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pagespeed_reports_scores" ADD CONSTRAINT "pagespeed_reports_scores_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pagespeed_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pagespeed_reports_metrics" ADD CONSTRAINT "pagespeed_reports_metrics_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pagespeed_reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "job_runs_task_idx" ON "job_runs" USING btree ("task");
  CREATE INDEX "job_runs_status_idx" ON "job_runs" USING btree ("status");
  CREATE INDEX "job_runs_started_by_idx" ON "job_runs" USING btree ("started_by_id");
  CREATE INDEX "job_runs_updated_at_idx" ON "job_runs" USING btree ("updated_at");
  CREATE INDEX "job_runs_created_at_idx" ON "job_runs" USING btree ("created_at");
  CREATE INDEX "pagespeed_reports_scores_order_idx" ON "pagespeed_reports_scores" USING btree ("_order");
  CREATE INDEX "pagespeed_reports_scores_parent_id_idx" ON "pagespeed_reports_scores" USING btree ("_parent_id");
  CREATE INDEX "pagespeed_reports_metrics_order_idx" ON "pagespeed_reports_metrics" USING btree ("_order");
  CREATE INDEX "pagespeed_reports_metrics_parent_id_idx" ON "pagespeed_reports_metrics" USING btree ("_parent_id");
  CREATE INDEX "pagespeed_reports_url_idx" ON "pagespeed_reports" USING btree ("url");
  CREATE INDEX "pagespeed_reports_strategy_idx" ON "pagespeed_reports" USING btree ("strategy");
  CREATE INDEX "pagespeed_reports_fetched_at_idx" ON "pagespeed_reports" USING btree ("fetched_at");
  CREATE INDEX "pagespeed_reports_updated_at_idx" ON "pagespeed_reports" USING btree ("updated_at");
  CREATE INDEX "pagespeed_reports_created_at_idx" ON "pagespeed_reports" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_job_runs_fk" FOREIGN KEY ("job_runs_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pagespeed_reports_fk" FOREIGN KEY ("pagespeed_reports_id") REFERENCES "public"."pagespeed_reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_job_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("job_runs_id");
  CREATE INDEX "payload_locked_documents_rels_pagespeed_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("pagespeed_reports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "job_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pagespeed_reports_scores" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pagespeed_reports_metrics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pagespeed_reports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "job_runs" CASCADE;
  DROP TABLE "pagespeed_reports_scores" CASCADE;
  DROP TABLE "pagespeed_reports_metrics" CASCADE;
  DROP TABLE "pagespeed_reports" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_job_runs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pagespeed_reports_fk";
  
  DROP INDEX "payload_locked_documents_rels_job_runs_id_idx";
  DROP INDEX "payload_locked_documents_rels_pagespeed_reports_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "job_runs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pagespeed_reports_id";
  DROP TYPE "public"."enum_job_runs_task";
  DROP TYPE "public"."enum_job_runs_status";
  DROP TYPE "public"."enum_job_runs_trigger";
  DROP TYPE "public"."enum_pagespeed_reports_scores_rating";
  DROP TYPE "public"."enum_pagespeed_reports_metrics_rating";
  DROP TYPE "public"."enum_pagespeed_reports_strategy";`)
}
