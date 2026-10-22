import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payload_folders_folder_type" AS ENUM('media');
  CREATE TABLE "payload_folders_folder_type" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_payload_folders_folder_type",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload_folders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"folder_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  DROP INDEX "projects_order_idx";
  DROP INDEX "services_order_idx";
  DROP INDEX "skills_order_idx";
  DROP INDEX "experiences_order_idx";
  DROP INDEX "educations_order_idx";
  ALTER TABLE "articles" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "articles" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "articles" ADD COLUMN "meta_image_id" integer;
  ALTER TABLE "_articles_v" ADD COLUMN "version_meta_title" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_meta_description" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_meta_image_id" integer;
  ALTER TABLE "projects" ADD COLUMN "_order" varchar;
  ALTER TABLE "media" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "media" ADD COLUMN "folder_id" integer;
  ALTER TABLE "services" ADD COLUMN "_order" varchar;
  ALTER TABLE "skills" ADD COLUMN "_order" varchar;
  ALTER TABLE "experiences" ADD COLUMN "_order" varchar;
  ALTER TABLE "educations" ADD COLUMN "_order" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payload_folders_id" integer;
  ALTER TABLE "site_settings" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "meta_image_id" integer;
  ALTER TABLE "payload_folders_folder_type" ADD CONSTRAINT "payload_folders_folder_type_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_folders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_folders" ADD CONSTRAINT "payload_folders_folder_id_payload_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."payload_folders"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "payload_folders_folder_type_order_idx" ON "payload_folders_folder_type" USING btree ("order");
  CREATE INDEX "payload_folders_folder_type_parent_idx" ON "payload_folders_folder_type" USING btree ("parent_id");
  CREATE INDEX "payload_folders_name_idx" ON "payload_folders" USING btree ("name");
  CREATE INDEX "payload_folders_folder_idx" ON "payload_folders" USING btree ("folder_id");
  CREATE INDEX "payload_folders_updated_at_idx" ON "payload_folders" USING btree ("updated_at");
  CREATE INDEX "payload_folders_created_at_idx" ON "payload_folders" USING btree ("created_at");
  ALTER TABLE "articles" ADD CONSTRAINT "articles_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_payload_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."payload_folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_folders_fk" FOREIGN KEY ("payload_folders_id") REFERENCES "public"."payload_folders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "articles_meta_meta_image_idx" ON "articles" USING btree ("meta_image_id");
  CREATE INDEX "_articles_v_version_meta_version_meta_image_idx" ON "_articles_v" USING btree ("version_meta_image_id");
  CREATE INDEX "projects__order_idx" ON "projects" USING btree ("_order");
  CREATE INDEX "media_folder_idx" ON "media" USING btree ("folder_id");
  CREATE INDEX "services__order_idx" ON "services" USING btree ("_order");
  CREATE INDEX "skills__order_idx" ON "skills" USING btree ("_order");
  CREATE INDEX "experiences__order_idx" ON "experiences" USING btree ("_order");
  CREATE INDEX "educations__order_idx" ON "educations" USING btree ("_order");
  CREATE INDEX "payload_locked_documents_rels_payload_folders_id_idx" ON "payload_locked_documents_rels" USING btree ("payload_folders_id");
  CREATE INDEX "site_settings_meta_meta_image_idx" ON "site_settings" USING btree ("meta_image_id");
  ALTER TABLE "projects" DROP COLUMN "order";
  ALTER TABLE "services" DROP COLUMN "order";
  ALTER TABLE "skills" DROP COLUMN "order";
  ALTER TABLE "experiences" DROP COLUMN "order";
  ALTER TABLE "educations" DROP COLUMN "order";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_folders_folder_type" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_folders" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload_folders_folder_type" CASCADE;
  DROP TABLE "payload_folders" CASCADE;
  ALTER TABLE "articles" DROP CONSTRAINT "articles_meta_image_id_media_id_fk";
  
  ALTER TABLE "_articles_v" DROP CONSTRAINT "_articles_v_version_meta_image_id_media_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_folder_id_payload_folders_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payload_folders_fk";
  
  ALTER TABLE "site_settings" DROP CONSTRAINT "site_settings_meta_image_id_media_id_fk";
  
  DROP INDEX "articles_meta_meta_image_idx";
  DROP INDEX "_articles_v_version_meta_version_meta_image_idx";
  DROP INDEX "projects__order_idx";
  DROP INDEX "media_folder_idx";
  DROP INDEX "services__order_idx";
  DROP INDEX "skills__order_idx";
  DROP INDEX "experiences__order_idx";
  DROP INDEX "educations__order_idx";
  DROP INDEX "payload_locked_documents_rels_payload_folders_id_idx";
  DROP INDEX "site_settings_meta_meta_image_idx";
  ALTER TABLE "projects" ADD COLUMN "order" numeric DEFAULT 0;
  ALTER TABLE "services" ADD COLUMN "order" numeric DEFAULT 0;
  ALTER TABLE "skills" ADD COLUMN "order" numeric DEFAULT 0;
  ALTER TABLE "experiences" ADD COLUMN "order" numeric DEFAULT 0;
  ALTER TABLE "educations" ADD COLUMN "order" numeric DEFAULT 0;
  CREATE INDEX "projects_order_idx" ON "projects" USING btree ("order");
  CREATE INDEX "services_order_idx" ON "services" USING btree ("order");
  CREATE INDEX "skills_order_idx" ON "skills" USING btree ("order");
  CREATE INDEX "experiences_order_idx" ON "experiences" USING btree ("order");
  CREATE INDEX "educations_order_idx" ON "educations" USING btree ("order");
  ALTER TABLE "articles" DROP COLUMN "meta_title";
  ALTER TABLE "articles" DROP COLUMN "meta_description";
  ALTER TABLE "articles" DROP COLUMN "meta_image_id";
  ALTER TABLE "_articles_v" DROP COLUMN "version_meta_title";
  ALTER TABLE "_articles_v" DROP COLUMN "version_meta_description";
  ALTER TABLE "_articles_v" DROP COLUMN "version_meta_image_id";
  ALTER TABLE "projects" DROP COLUMN "_order";
  ALTER TABLE "media" DROP COLUMN "_objectkey";
  ALTER TABLE "media" DROP COLUMN "folder_id";
  ALTER TABLE "services" DROP COLUMN "_order";
  ALTER TABLE "skills" DROP COLUMN "_order";
  ALTER TABLE "experiences" DROP COLUMN "_order";
  ALTER TABLE "educations" DROP COLUMN "_order";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payload_folders_id";
  ALTER TABLE "site_settings" DROP COLUMN "meta_title";
  ALTER TABLE "site_settings" DROP COLUMN "meta_description";
  ALTER TABLE "site_settings" DROP COLUMN "meta_image_id";
  DROP TYPE "public"."enum_payload_folders_folder_type";`)
}
