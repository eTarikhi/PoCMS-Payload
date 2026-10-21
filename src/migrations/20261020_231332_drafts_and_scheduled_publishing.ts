import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * Drafts, versions and scheduled publishing on articles.
 *
 * `_status` defaults to `draft` for new documents, which is what editors want. The rows that exist
 * before this migration are backfilled to `published`; without that they would disappear from the
 * public site. Title, excerpt, publishedAt and link stop being `NOT NULL` because a draft is allowed
 * to be incomplete.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_category" AS ENUM('articles', 'others');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  ALTER TYPE "public"."enum_job_runs_task" ADD VALUE 'publish-scheduled' BEFORE 'broken-links';
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_excerpt" varchar,
  	"version_slug" varchar,
  	"version_description" varchar,
  	"version_featured" boolean,
  	"version_category" "enum__articles_v_version_category",
  	"version_published_at" timestamp(3) with time zone,
  	"version_publish_at" timestamp(3) with time zone,
  	"version_read_time" numeric,
  	"version_image_id" integer,
  	"version_image_url" varchar,
  	"version_link" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "articles" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "excerpt" DROP NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "published_at" DROP NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "link" DROP NOT NULL;
  ALTER TABLE "articles" ADD COLUMN "publish_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "_status" "enum_articles_status" DEFAULT 'draft';
  -- Every article that exists when drafts arrive was live before: mark it published, otherwise the
  -- public site would lose all of them (public reads return published documents only).
  UPDATE "articles" SET "_status" = 'published';
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_category_idx" ON "_articles_v" USING btree ("version_category");
  CREATE INDEX "_articles_v_version_version_published_at_idx" ON "_articles_v" USING btree ("version_published_at");
  CREATE INDEX "_articles_v_version_version_publish_at_idx" ON "_articles_v" USING btree ("version_publish_at");
  CREATE INDEX "_articles_v_version_version_image_idx" ON "_articles_v" USING btree ("version_image_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version_deleted_at_idx" ON "_articles_v" USING btree ("version_deleted_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "articles_publish_at_idx" ON "articles" USING btree ("publish_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "_articles_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "_articles_v" CASCADE;
  ALTER TABLE "job_runs" ALTER COLUMN "task" SET DATA TYPE text;
  DROP TYPE "public"."enum_job_runs_task";
  CREATE TYPE "public"."enum_job_runs_task" AS ENUM('trash-cleanup', 'pagespeed-report', 'broken-links');
  ALTER TABLE "job_runs" ALTER COLUMN "task" SET DATA TYPE "public"."enum_job_runs_task" USING "task"::"public"."enum_job_runs_task";
  DROP INDEX "articles_publish_at_idx";
  DROP INDEX "articles__status_idx";
  ALTER TABLE "articles" ALTER COLUMN "title" SET NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "excerpt" SET NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "published_at" SET NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "link" SET NOT NULL;
  ALTER TABLE "articles" DROP COLUMN "publish_at";
  ALTER TABLE "articles" DROP COLUMN "_status";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_category";
  DROP TYPE "public"."enum__articles_v_version_status";`)
}
