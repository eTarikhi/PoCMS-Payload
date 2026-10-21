import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * Orderable Educations, Experiences, Projects and Services (P5.5, after the Skills pilot).
 *
 * Same shape as `20261021_001500_skills_orderable`: each collection gets Payload's hidden `_order`
 * text column (a fractional index) with the same index, the manual `order` number is dropped, and
 * existing rows are keyed from (order, id) so the on-site order does not change.
 *
 * Backfill keys are `lpad((order * 100000 + id), 11, '0') || '1'`: zero-padded so they sort like
 * the numbers did, with a trailing `1` because a fractional-index key must not end in `0`.
 * `generateKeyBetween` can then insert anywhere between them and after the last one.
 */
const TABLES = ['educations', 'experiences', 'projects', 'services'] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const table of TABLES) {
    await db.execute(sql`
     ALTER TABLE ${sql.identifier(table)} ADD COLUMN "_order" varchar;
    UPDATE ${sql.identifier(table)}
       SET "_order" = lpad(((coalesce("order", 0)::int * 100000) + "id")::text, 11, '0') || '1'
     WHERE "_order" IS NULL;
    ALTER TABLE ${sql.identifier(table)} DROP COLUMN "order";`)
    await db.execute(
      sql`CREATE INDEX ${sql.identifier(`${table}__order_idx`)} ON ${sql.identifier(table)} USING btree ("_order");`,
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const table of TABLES) {
    await db.execute(sql`
     ALTER TABLE ${sql.identifier(table)} ADD COLUMN "order" numeric DEFAULT 0;
    UPDATE ${sql.identifier(table)}
       SET "order" = (("_order"::bigint / 10) / 100000)
     WHERE "_order" ~ '^[0-9]+$';`)
    await db.execute(sql`DROP INDEX ${sql.identifier(`${table}__order_idx`)};`)
    await db.execute(sql`ALTER TABLE ${sql.identifier(table)} DROP COLUMN "_order";`)
  }
}
