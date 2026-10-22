import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "projects" ADD COLUMN "slug" varchar;
  CREATE UNIQUE INDEX "projects_slug_idx" ON "projects" USING btree ("slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "projects_slug_idx";
  ALTER TABLE "projects" DROP COLUMN "slug";`)
}
