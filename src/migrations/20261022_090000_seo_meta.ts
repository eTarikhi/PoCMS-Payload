import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * SEO metadata (Payload's SEO plugin) on Articles and the Site settings global.
 *
 * The plugin adds one `meta` group per entity with `title`, `description` and an `image` upload
 * relation (plus two admin-only UI fields that are not stored). On Articles, which keep drafts,
 * the version table gets the same three columns with a `version_` prefix, so a draft's metadata is
 * previewable and restored with the document.
 *
 * Written by hand: `migrate:create` still cannot run non-interactively here, because the two
 * orderable migrations renamed `order` to `_order` and the generator asks about that first.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles"
     ADD COLUMN "meta_title" varchar,
     ADD COLUMN "meta_description" varchar,
     ADD COLUMN "meta_image_id" integer;`)

  await db.execute(sql`
   ALTER TABLE "articles" ADD CONSTRAINT "articles_meta_image_id_media_id_fk"
     FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id")
     ON DELETE set null ON UPDATE no action;`)
  await db.execute(sql`
   CREATE INDEX IF NOT EXISTS "articles_meta_meta_image_idx" ON "articles" USING btree ("meta_image_id");`)

  await db.execute(sql`
   ALTER TABLE "_articles_v"
     ADD COLUMN "version_meta_title" varchar,
     ADD COLUMN "version_meta_description" varchar,
     ADD COLUMN "version_meta_image_id" integer;`)

  await db.execute(sql`
   ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_meta_image_id_media_id_fk"
     FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id")
     ON DELETE set null ON UPDATE no action;`)
  await db.execute(sql`
   CREATE INDEX IF NOT EXISTS "_articles_v_version_meta_version_meta_image_idx"
     ON "_articles_v" USING btree ("version_meta_image_id");`)

  await db.execute(sql`
   ALTER TABLE "site_settings"
     ADD COLUMN "meta_title" varchar,
     ADD COLUMN "meta_description" varchar,
     ADD COLUMN "meta_image_id" integer;`)

  await db.execute(sql`
   ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_meta_image_id_media_id_fk"
     FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id")
     ON DELETE set null ON UPDATE no action;`)
  await db.execute(sql`
   CREATE INDEX IF NOT EXISTS "site_settings_meta_meta_image_idx" ON "site_settings" USING btree ("meta_image_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP CONSTRAINT IF EXISTS "site_settings_meta_image_id_media_id_fk";
  DROP INDEX IF EXISTS "site_settings_meta_meta_image_idx";
  ALTER TABLE "site_settings"
    DROP COLUMN IF EXISTS "meta_title",
    DROP COLUMN IF EXISTS "meta_description",
    DROP COLUMN IF EXISTS "meta_image_id";`)

  await db.execute(sql`
   ALTER TABLE "_articles_v" DROP CONSTRAINT IF EXISTS "_articles_v_version_meta_image_id_media_id_fk";
  DROP INDEX IF EXISTS "_articles_v_version_meta_version_meta_image_idx";
  ALTER TABLE "_articles_v"
    DROP COLUMN IF EXISTS "version_meta_title",
    DROP COLUMN IF EXISTS "version_meta_description",
    DROP COLUMN IF EXISTS "version_meta_image_id";`)

  await db.execute(sql`
   ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_meta_image_id_media_id_fk";
  DROP INDEX IF EXISTS "articles_meta_meta_image_idx";
  ALTER TABLE "articles"
    DROP COLUMN IF EXISTS "meta_title",
    DROP COLUMN IF EXISTS "meta_description",
    DROP COLUMN IF EXISTS "meta_image_id";`)
}
