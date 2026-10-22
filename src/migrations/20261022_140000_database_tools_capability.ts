import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * "Database tools" capability (`manageDatabase`).
 *
 * The page at /admin/database can read every table, take a backup and run maintenance, so it is its
 * own permission rather than a widening of `viewSystem` (which only reads). `CAPABILITIES` in
 * `src/access/permissions.ts` is the source of the Roles checkbox; this migration adds the column
 * that stores it, matching the naming the group already uses (`capabilities_<snake_case>`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "capabilities_manage_database" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "roles" DROP COLUMN IF EXISTS "capabilities_manage_database";`)
}
