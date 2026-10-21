import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * Orderable Skills (P5.5 pilot).
 *
 * Payload's `orderable: true` keeps the list order in a hidden `_order` text column holding a
 * fractional index, so a drag-and-drop only rewrites the moved document. The collection's own
 * numeric `order` field goes away with this migration.
 *
 * Backfill: existing rows are keyed from (order, id), zero-padded so the strings sort like the
 * numbers, with a trailing `1`. Fractional index keys must not end in `0`, and this keeps the
 * current on-site order exactly. `generateKeyBetween` can insert between these keys and after the
 * last one, which is all the list needs.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "skills" ADD COLUMN "_order" varchar;
  UPDATE "skills"
     SET "_order" = lpad(((coalesce("order", 0)::int * 100000) + "id")::text, 11, '0') || '1'
   WHERE "_order" IS NULL;
  ALTER TABLE "skills" DROP COLUMN "order";
  CREATE INDEX "skills__order_idx" ON "skills" USING btree ("_order");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "skills" ADD COLUMN "order" numeric DEFAULT 0;
  UPDATE "skills"
     SET "order" = (("_order"::bigint / 10) / 100000)
   WHERE "_order" ~ '^[0-9]+$';
  DROP INDEX "skills__order_idx";
  ALTER TABLE "skills" DROP COLUMN "_order";`)
}
