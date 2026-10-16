import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-vercel-postgres'

/**
 * Moves the existing, single-language values into English locale records before their legacy columns
 * are removed. Run this migration before deploying the localized field configuration to a database
 * that contains portfolio content.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "_locales" AS ENUM ('en', 'fa');

    CREATE TABLE "about_locales" (
      "title" varchar NOT NULL,
      "experience_title" varchar NOT NULL,
      "experience_description" varchar NOT NULL,
      "work_permit_title" varchar NOT NULL,
      "work_permit_description" varchar NOT NULL,
      "interests_title" varchar NOT NULL,
      "interests_description" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE TABLE "articles_locales" (
      "title" varchar NOT NULL,
      "excerpt" varchar NOT NULL,
      "description" varchar,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE TABLE "certificates_locales" (
      "title" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE TABLE "educations_locales" (
      "title" varchar NOT NULL,
      "location" varchar,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE TABLE "experiences_locales" (
      "title" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE TABLE "services_locales" (
      "category" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE TABLE "skills_locales" (
      "label" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE TABLE "media_locales" (
      "alt" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE TABLE "footer_social_links_locales" (
      "aria_label" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" varchar NOT NULL
    );
    CREATE TABLE "footer_contact_info_locales" (
      "content" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" varchar NOT NULL
    );
    CREATE TABLE "footer_locales" (
      "hiring_cta_label" varchar,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );

    ALTER TABLE "about_texts" ADD COLUMN "locale" "_locales";
    ALTER TABLE "header_texts" ADD COLUMN "locale" "_locales";
    ALTER TABLE "services_texts" ADD COLUMN "locale" "_locales";
    ALTER TABLE "footer_texts" ADD COLUMN "locale" "_locales";

    ALTER TABLE "about_locales" ADD CONSTRAINT "about_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "about"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "articles_locales" ADD CONSTRAINT "articles_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "articles"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "certificates_locales" ADD CONSTRAINT "certificates_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "certificates"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "educations_locales" ADD CONSTRAINT "educations_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "educations"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "experiences_locales" ADD CONSTRAINT "experiences_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "experiences"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "services_locales" ADD CONSTRAINT "services_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "services"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "skills_locales" ADD CONSTRAINT "skills_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "skills"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "media"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "footer_social_links_locales" ADD CONSTRAINT "footer_social_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "footer_social_links"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "footer_contact_info_locales" ADD CONSTRAINT "footer_contact_info_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "footer_contact_info"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "footer_locales" ADD CONSTRAINT "footer_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "footer"("id") ON DELETE cascade ON UPDATE no action;

    CREATE UNIQUE INDEX "about_locales_locale_parent_id_unique" ON "about_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "articles_locales_locale_parent_id_unique" ON "articles_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "certificates_locales_locale_parent_id_unique" ON "certificates_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "educations_locales_locale_parent_id_unique" ON "educations_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "experiences_locales_locale_parent_id_unique" ON "experiences_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "services_locales_locale_parent_id_unique" ON "services_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "skills_locales_locale_parent_id_unique" ON "skills_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "footer_social_links_locales_locale_parent_id_unique" ON "footer_social_links_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "footer_contact_info_locales_locale_parent_id_unique" ON "footer_contact_info_locales" USING btree ("_locale", "_parent_id");
    CREATE UNIQUE INDEX "footer_locales_locale_parent_id_unique" ON "footer_locales" USING btree ("_locale", "_parent_id");
    CREATE INDEX "about_texts_locale_parent" ON "about_texts" USING btree ("locale", "parent_id");
    CREATE INDEX "header_texts_locale_parent" ON "header_texts" USING btree ("locale", "parent_id");
    CREATE INDEX "services_texts_locale_parent" ON "services_texts" USING btree ("locale", "parent_id");
    CREATE INDEX "footer_texts_locale_parent" ON "footer_texts" USING btree ("locale", "parent_id");

    INSERT INTO "about_locales" ("title", "experience_title", "experience_description", "work_permit_title", "work_permit_description", "interests_title", "interests_description", "_locale", "_parent_id")
      SELECT "title", "experience_title", "experience_description", "work_permit_title", "work_permit_description", "interests_title", "interests_description", 'en', "id" FROM "about";
    INSERT INTO "articles_locales" ("title", "excerpt", "description", "_locale", "_parent_id")
      SELECT "title", "excerpt", "description", 'en', "id" FROM "articles";
    INSERT INTO "certificates_locales" ("title", "_locale", "_parent_id")
      SELECT "title", 'en', "id" FROM "certificates";
    INSERT INTO "educations_locales" ("title", "location", "_locale", "_parent_id")
      SELECT "title", "location", 'en', "id" FROM "educations";
    INSERT INTO "experiences_locales" ("title", "_locale", "_parent_id")
      SELECT "title", 'en', "id" FROM "experiences";
    INSERT INTO "services_locales" ("category", "_locale", "_parent_id")
      SELECT "category", 'en', "id" FROM "services";
    INSERT INTO "skills_locales" ("label", "_locale", "_parent_id")
      SELECT "label", 'en', "id" FROM "skills";
    INSERT INTO "media_locales" ("alt", "_locale", "_parent_id")
      SELECT "alt", 'en', "id" FROM "media";
    INSERT INTO "footer_social_links_locales" ("aria_label", "_locale", "_parent_id")
      SELECT "aria_label", 'en', "id" FROM "footer_social_links";
    INSERT INTO "footer_contact_info_locales" ("content", "_locale", "_parent_id")
      SELECT "content", 'en', "id" FROM "footer_contact_info";
    INSERT INTO "footer_locales" ("hiring_cta_label", "_locale", "_parent_id")
      SELECT "hiring_cta_label", 'en', "id" FROM "footer";

    UPDATE "about_texts" SET "locale" = 'en' WHERE "locale" IS NULL;
    UPDATE "header_texts" SET "locale" = 'en' WHERE "locale" IS NULL;
    UPDATE "services_texts" SET "locale" = 'en' WHERE "locale" IS NULL;
    UPDATE "footer_texts" SET "locale" = 'en' WHERE "locale" IS NULL;

    ALTER TABLE "about" DROP COLUMN "title";
    ALTER TABLE "about" DROP COLUMN "experience_title";
    ALTER TABLE "about" DROP COLUMN "experience_description";
    ALTER TABLE "about" DROP COLUMN "work_permit_title";
    ALTER TABLE "about" DROP COLUMN "work_permit_description";
    ALTER TABLE "about" DROP COLUMN "interests_title";
    ALTER TABLE "about" DROP COLUMN "interests_description";
    ALTER TABLE "articles" DROP COLUMN "title";
    ALTER TABLE "articles" DROP COLUMN "excerpt";
    ALTER TABLE "articles" DROP COLUMN "description";
    ALTER TABLE "certificates" DROP COLUMN "title";
    ALTER TABLE "educations" DROP COLUMN "title";
    ALTER TABLE "educations" DROP COLUMN "location";
    ALTER TABLE "experiences" DROP COLUMN "title";
    ALTER TABLE "services" DROP COLUMN "category";
    ALTER TABLE "skills" DROP COLUMN "label";
    ALTER TABLE "media" DROP COLUMN "alt";
    ALTER TABLE "footer_social_links" DROP COLUMN "aria_label";
    ALTER TABLE "footer_contact_info" DROP COLUMN "content";
    ALTER TABLE "footer" DROP COLUMN "hiring_cta_label";
  `)
}

/**
 * Restores the pre-localization columns from English values. Persian-only values created after this
 * migration are intentionally not representable by the former single-language schema and are lost.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "about" ADD COLUMN "title" varchar;
    ALTER TABLE "about" ADD COLUMN "experience_title" varchar;
    ALTER TABLE "about" ADD COLUMN "experience_description" varchar;
    ALTER TABLE "about" ADD COLUMN "work_permit_title" varchar;
    ALTER TABLE "about" ADD COLUMN "work_permit_description" varchar;
    ALTER TABLE "about" ADD COLUMN "interests_title" varchar;
    ALTER TABLE "about" ADD COLUMN "interests_description" varchar;
    ALTER TABLE "articles" ADD COLUMN "title" varchar;
    ALTER TABLE "articles" ADD COLUMN "excerpt" varchar;
    ALTER TABLE "articles" ADD COLUMN "description" varchar;
    ALTER TABLE "certificates" ADD COLUMN "title" varchar;
    ALTER TABLE "educations" ADD COLUMN "title" varchar;
    ALTER TABLE "educations" ADD COLUMN "location" varchar;
    ALTER TABLE "experiences" ADD COLUMN "title" varchar;
    ALTER TABLE "services" ADD COLUMN "category" varchar;
    ALTER TABLE "skills" ADD COLUMN "label" varchar;
    ALTER TABLE "media" ADD COLUMN "alt" varchar;
    ALTER TABLE "footer_social_links" ADD COLUMN "aria_label" varchar;
    ALTER TABLE "footer_contact_info" ADD COLUMN "content" varchar;
    ALTER TABLE "footer" ADD COLUMN "hiring_cta_label" varchar;

    UPDATE "about" AS parent SET
      "title" = localized."title",
      "experience_title" = localized."experience_title",
      "experience_description" = localized."experience_description",
      "work_permit_title" = localized."work_permit_title",
      "work_permit_description" = localized."work_permit_description",
      "interests_title" = localized."interests_title",
      "interests_description" = localized."interests_description"
      FROM "about_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "articles" AS parent SET "title" = localized."title", "excerpt" = localized."excerpt", "description" = localized."description"
      FROM "articles_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "certificates" AS parent SET "title" = localized."title"
      FROM "certificates_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "educations" AS parent SET "title" = localized."title", "location" = localized."location"
      FROM "educations_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "experiences" AS parent SET "title" = localized."title"
      FROM "experiences_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "services" AS parent SET "category" = localized."category"
      FROM "services_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "skills" AS parent SET "label" = localized."label"
      FROM "skills_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "media" AS parent SET "alt" = localized."alt"
      FROM "media_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "footer_social_links" AS parent SET "aria_label" = localized."aria_label"
      FROM "footer_social_links_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "footer_contact_info" AS parent SET "content" = localized."content"
      FROM "footer_contact_info_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';
    UPDATE "footer" AS parent SET "hiring_cta_label" = localized."hiring_cta_label"
      FROM "footer_locales" AS localized WHERE localized."_parent_id" = parent."id" AND localized."_locale" = 'en';

    ALTER TABLE "about" ALTER COLUMN "title" SET NOT NULL;
    ALTER TABLE "about" ALTER COLUMN "experience_title" SET NOT NULL;
    ALTER TABLE "about" ALTER COLUMN "experience_description" SET NOT NULL;
    ALTER TABLE "about" ALTER COLUMN "work_permit_title" SET NOT NULL;
    ALTER TABLE "about" ALTER COLUMN "work_permit_description" SET NOT NULL;
    ALTER TABLE "about" ALTER COLUMN "interests_title" SET NOT NULL;
    ALTER TABLE "about" ALTER COLUMN "interests_description" SET NOT NULL;
    ALTER TABLE "articles" ALTER COLUMN "title" SET NOT NULL;
    ALTER TABLE "articles" ALTER COLUMN "excerpt" SET NOT NULL;
    ALTER TABLE "certificates" ALTER COLUMN "title" SET NOT NULL;
    ALTER TABLE "educations" ALTER COLUMN "title" SET NOT NULL;
    ALTER TABLE "experiences" ALTER COLUMN "title" SET NOT NULL;
    ALTER TABLE "services" ALTER COLUMN "category" SET NOT NULL;
    ALTER TABLE "skills" ALTER COLUMN "label" SET NOT NULL;
    ALTER TABLE "media" ALTER COLUMN "alt" SET NOT NULL;
    ALTER TABLE "footer_social_links" ALTER COLUMN "aria_label" SET NOT NULL;
    ALTER TABLE "footer_contact_info" ALTER COLUMN "content" SET NOT NULL;

    DELETE FROM "about_texts" WHERE "locale" <> 'en';
    DELETE FROM "header_texts" WHERE "locale" <> 'en';
    DELETE FROM "services_texts" WHERE "locale" <> 'en';
    DELETE FROM "footer_texts" WHERE "locale" <> 'en';

    DROP TABLE "about_locales" CASCADE;
    DROP TABLE "articles_locales" CASCADE;
    DROP TABLE "certificates_locales" CASCADE;
    DROP TABLE "educations_locales" CASCADE;
    DROP TABLE "experiences_locales" CASCADE;
    DROP TABLE "services_locales" CASCADE;
    DROP TABLE "skills_locales" CASCADE;
    DROP TABLE "media_locales" CASCADE;
    DROP TABLE "footer_social_links_locales" CASCADE;
    DROP TABLE "footer_contact_info_locales" CASCADE;
    DROP TABLE "footer_locales" CASCADE;

    ALTER TABLE "about_texts" DROP COLUMN "locale";
    ALTER TABLE "header_texts" DROP COLUMN "locale";
    ALTER TABLE "services_texts" DROP COLUMN "locale";
    ALTER TABLE "footer_texts" DROP COLUMN "locale";
    DROP TYPE "_locales";
  `)
}
