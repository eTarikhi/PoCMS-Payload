import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * Media folders (Payload's beta folders feature).
 *
 * `folders: true` on Media makes Payload add the `payload-folders` collection, the hidden `folder`
 * relationship on Media, and the `folder_type` join that records which collections a folder may
 * hold (here: `media`). The admin's folder browser at `/admin/browse-by-folder` and the folder
 * column in the media list read these tables.
 *
 * Written by hand because the schema diff cannot be generated non-interactively: the two orderable
 * migrations changed `order` to `_order` on four tables, and the generator asks whether that was a
 * rename or a drop (it cannot know). The statements below mirror `src/payload-generated-schema.ts`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payload_folders_folder_type" AS ENUM('media');`)

  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "payload_folders" (
     "id" serial PRIMARY KEY NOT NULL,
     "name" varchar NOT NULL,
     "folder_id" integer,
     "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
     "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
   );`)

  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "payload_folders_folder_type" (
     "order" integer NOT NULL,
     "parent_id" integer NOT NULL,
     "value" "public"."enum_payload_folders_folder_type",
     "id" serial PRIMARY KEY NOT NULL
   );`)

  await db.execute(sql`
   ALTER TABLE "payload_folders" ADD CONSTRAINT "payload_folders_folder_fk"
     FOREIGN KEY ("folder_id") REFERENCES "public"."payload_folders"("id")
     ON DELETE set null ON UPDATE no action;`)
  await db.execute(sql`
   ALTER TABLE "payload_folders_folder_type" ADD CONSTRAINT "payload_folders_folder_type_parent_fk"
     FOREIGN KEY ("parent_id") REFERENCES "public"."payload_folders"("id")
     ON DELETE cascade ON UPDATE no action;`)

  await db.execute(sql`
   CREATE INDEX IF NOT EXISTS "payload_folders_name_idx" ON "payload_folders" USING btree ("name");
  CREATE INDEX IF NOT EXISTS "payload_folders_folder_idx" ON "payload_folders" USING btree ("folder_id");
  CREATE INDEX IF NOT EXISTS "payload_folders_updated_at_idx" ON "payload_folders" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_folders_created_at_idx" ON "payload_folders" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_folders_folder_type_order_idx" ON "payload_folders_folder_type" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "payload_folders_folder_type_parent_idx" ON "payload_folders_folder_type" USING btree ("parent_id");`)

  // The hidden relationship on Media, and the lock-row column Payload adds for every collection.
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "folder_id" integer;
  ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_payload_folders_id_fk"
    FOREIGN KEY ("folder_id") REFERENCES "public"."payload_folders"("id")
    ON DELETE set null ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "media_folder_idx" ON "media" USING btree ("folder_id");`)

  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payload_folders_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_folders_fk"
    FOREIGN KEY ("payload_folders_id") REFERENCES "public"."payload_folders"("id")
    ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_payload_folders_id_idx"
    ON "payload_locked_documents_rels" USING btree ("payload_folders_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_payload_folders_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_payload_folders_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "payload_folders_id";`)

  await db.execute(sql`
   ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_folder_id_payload_folders_id_fk";
  DROP INDEX IF EXISTS "media_folder_idx";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "folder_id";`)

  await db.execute(sql`
   DROP TABLE IF EXISTS "payload_folders_folder_type" CASCADE;
  DROP TABLE IF EXISTS "payload_folders" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_payload_folders_folder_type";`)
}
