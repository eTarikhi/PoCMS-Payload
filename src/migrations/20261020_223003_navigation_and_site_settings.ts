import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roles_levels_navigation" AS ENUM('none', 'read', 'edit');
  CREATE TYPE "public"."enum_roles_levels_site_settings" AS ENUM('none', 'read', 'edit');
  CREATE TABLE "navigation_primary_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"new_tab" boolean DEFAULT false
  );
  
  CREATE TABLE "navigation_secondary_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"new_tab" boolean DEFAULT false
  );
  
  CREATE TABLE "navigation" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"brand" varchar DEFAULT 'eTarikhi',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_name" varchar DEFAULT 'eTarikhi',
  	"support_email" varchar,
  	"maintenance_enabled" boolean DEFAULT false,
  	"maintenance_title" varchar DEFAULT 'Back soon',
  	"maintenance_message" varchar DEFAULT 'The site is being updated. Everything will be back shortly — thanks for your patience.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "roles" ADD COLUMN "levels_navigation" "enum_roles_levels_navigation" DEFAULT 'none';
  ALTER TABLE "roles" ADD COLUMN "levels_site_settings" "enum_roles_levels_site_settings" DEFAULT 'none';
  ALTER TABLE "navigation_primary_links" ADD CONSTRAINT "navigation_primary_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navigation_secondary_links" ADD CONSTRAINT "navigation_secondary_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "navigation_primary_links_order_idx" ON "navigation_primary_links" USING btree ("_order");
  CREATE INDEX "navigation_primary_links_parent_id_idx" ON "navigation_primary_links" USING btree ("_parent_id");
  CREATE INDEX "navigation_secondary_links_order_idx" ON "navigation_secondary_links" USING btree ("_order");
  CREATE INDEX "navigation_secondary_links_parent_id_idx" ON "navigation_secondary_links" USING btree ("_parent_id");
  ALTER TABLE "media" DROP COLUMN "_objectkey";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "navigation_primary_links" CASCADE;
  DROP TABLE "navigation_secondary_links" CASCADE;
  DROP TABLE "navigation" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  ALTER TABLE "media" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "roles" DROP COLUMN "levels_navigation";
  ALTER TABLE "roles" DROP COLUMN "levels_site_settings";
  DROP TYPE "public"."enum_roles_levels_navigation";
  DROP TYPE "public"."enum_roles_levels_site_settings";`)
}
