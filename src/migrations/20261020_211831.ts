import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roles_levels_articles" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_projects" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_media" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_about" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_experiences" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_educations" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_certificates" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_services" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_skills" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_header" AS ENUM('none', 'read', 'edit', 'full');
  CREATE TYPE "public"."enum_roles_levels_footer" AS ENUM('none', 'read', 'edit');
  CREATE TABLE "users_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"roles_id" integer
  );
  
  CREATE TABLE "roles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"is_default" boolean DEFAULT false,
  	"description" varchar,
  	"full_access" boolean DEFAULT false,
  	"system" boolean DEFAULT false,
  	"levels_articles" "enum_roles_levels_articles" DEFAULT 'none',
  	"levels_projects" "enum_roles_levels_projects" DEFAULT 'none',
  	"levels_media" "enum_roles_levels_media" DEFAULT 'none',
  	"levels_about" "enum_roles_levels_about" DEFAULT 'none',
  	"levels_experiences" "enum_roles_levels_experiences" DEFAULT 'none',
  	"levels_educations" "enum_roles_levels_educations" DEFAULT 'none',
  	"levels_certificates" "enum_roles_levels_certificates" DEFAULT 'none',
  	"levels_services" "enum_roles_levels_services" DEFAULT 'none',
  	"levels_skills" "enum_roles_levels_skills" DEFAULT 'none',
  	"levels_header" "enum_roles_levels_header" DEFAULT 'none',
  	"levels_footer" "enum_roles_levels_footer" DEFAULT 'none',
  	"capabilities_view_analytics" boolean DEFAULT false,
  	"capabilities_view_deployments" boolean DEFAULT false,
  	"capabilities_view_audit_log" boolean DEFAULT false,
  	"capabilities_manage_jobs" boolean DEFAULT false,
  	"capabilities_view_system" boolean DEFAULT false,
  	"capabilities_use_developer_tools" boolean DEFAULT false,
  	"capabilities_use_terminal" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_query_presets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_query_presets_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload_query_presets" CASCADE;
  DROP TABLE "payload_query_presets_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "roles_id" integer;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_rels_order_idx" ON "users_rels" USING btree ("order");
  CREATE INDEX "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
  CREATE INDEX "users_rels_path_idx" ON "users_rels" USING btree ("path");
  CREATE INDEX "users_rels_roles_id_idx" ON "users_rels" USING btree ("roles_id");
  CREATE UNIQUE INDEX "roles_name_idx" ON "roles" USING btree ("name");
  CREATE INDEX "roles_updated_at_idx" ON "roles" USING btree ("updated_at");
  CREATE INDEX "roles_created_at_idx" ON "roles" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_roles_id_idx" ON "payload_locked_documents_rels" USING btree ("roles_id");
  DROP TYPE "public"."enum_payload_query_presets_access_read_constraint";
  DROP TYPE "public"."enum_payload_query_presets_access_update_constraint";
  DROP TYPE "public"."enum_payload_query_presets_access_delete_constraint";
  DROP TYPE "public"."enum_payload_query_presets_related_collection";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payload_query_presets_access_read_constraint" AS ENUM('everyone', 'onlyMe', 'specificUsers');
  CREATE TYPE "public"."enum_payload_query_presets_access_update_constraint" AS ENUM('everyone', 'onlyMe', 'specificUsers');
  CREATE TYPE "public"."enum_payload_query_presets_access_delete_constraint" AS ENUM('everyone', 'onlyMe', 'specificUsers');
  CREATE TYPE "public"."enum_payload_query_presets_related_collection" AS ENUM('articles', 'projects', 'media', 'skills');
  CREATE TABLE "payload_query_presets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"is_shared" boolean DEFAULT false,
  	"access_read_constraint" "enum_payload_query_presets_access_read_constraint" DEFAULT 'onlyMe',
  	"access_update_constraint" "enum_payload_query_presets_access_update_constraint" DEFAULT 'onlyMe',
  	"access_delete_constraint" "enum_payload_query_presets_access_delete_constraint" DEFAULT 'onlyMe',
  	"where" jsonb,
  	"columns" jsonb,
  	"group_by" varchar,
  	"related_collection" "enum_payload_query_presets_related_collection" NOT NULL,
  	"is_temp" boolean,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_query_presets_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  ALTER TABLE "users_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "roles" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_rels" CASCADE;
  DROP TABLE "roles" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_roles_fk";
  
  DROP INDEX "payload_locked_documents_rels_roles_id_idx";
  ALTER TABLE "payload_query_presets_rels" ADD CONSTRAINT "payload_query_presets_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_query_presets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_query_presets_rels" ADD CONSTRAINT "payload_query_presets_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_query_presets_updated_at_idx" ON "payload_query_presets" USING btree ("updated_at");
  CREATE INDEX "payload_query_presets_created_at_idx" ON "payload_query_presets" USING btree ("created_at");
  CREATE INDEX "payload_query_presets_rels_order_idx" ON "payload_query_presets_rels" USING btree ("order");
  CREATE INDEX "payload_query_presets_rels_parent_idx" ON "payload_query_presets_rels" USING btree ("parent_id");
  CREATE INDEX "payload_query_presets_rels_path_idx" ON "payload_query_presets_rels" USING btree ("path");
  CREATE INDEX "payload_query_presets_rels_users_id_idx" ON "payload_query_presets_rels" USING btree ("users_id");
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "roles_id";
  DROP TYPE "public"."enum_roles_levels_articles";
  DROP TYPE "public"."enum_roles_levels_projects";
  DROP TYPE "public"."enum_roles_levels_media";
  DROP TYPE "public"."enum_roles_levels_about";
  DROP TYPE "public"."enum_roles_levels_experiences";
  DROP TYPE "public"."enum_roles_levels_educations";
  DROP TYPE "public"."enum_roles_levels_certificates";
  DROP TYPE "public"."enum_roles_levels_services";
  DROP TYPE "public"."enum_roles_levels_skills";
  DROP TYPE "public"."enum_roles_levels_header";
  DROP TYPE "public"."enum_roles_levels_footer";`)
}
