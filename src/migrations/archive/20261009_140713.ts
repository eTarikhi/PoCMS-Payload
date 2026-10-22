import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_services_icon_font" AS ENUM('faCode', 'faCropAlt', 'faLaptopCode', 'faCodeBranch');
  CREATE TYPE "public"."enum_footer_social_links_icon_name" AS ENUM('faFacebookF', 'faXTwitter', 'faInstagram', 'faLinkedin', 'faGithub', 'faWhatsapp', 'faWhatsappc', 'faGem', 'faHome', 'faEnvelope', 'faPhoneFlip');
  CREATE TYPE "public"."enum_footer_contact_info_icon_name" AS ENUM('faFacebookF', 'faXTwitter', 'faInstagram', 'faLinkedin', 'faGithub', 'faWhatsapp', 'faWhatsappc', 'faGem', 'faHome', 'faEnvelope', 'faPhoneFlip');
  ALTER TABLE "services" ALTER COLUMN "icon_font" SET DATA TYPE "public"."enum_services_icon_font" USING "icon_font"::"public"."enum_services_icon_font";
  ALTER TABLE "footer_social_links" ALTER COLUMN "icon_name" SET DATA TYPE "public"."enum_footer_social_links_icon_name" USING "icon_name"::"public"."enum_footer_social_links_icon_name";
  ALTER TABLE "footer_contact_info" ALTER COLUMN "icon_name" SET DATA TYPE "public"."enum_footer_contact_info_icon_name" USING "icon_name"::"public"."enum_footer_contact_info_icon_name";
  ALTER TABLE "articles" ADD COLUMN "slug" varchar;
  ALTER TABLE "media" ADD COLUMN "_objectkey" varchar;
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_slug_idx";
  ALTER TABLE "services" ALTER COLUMN "icon_font" SET DATA TYPE varchar;
  ALTER TABLE "footer_social_links" ALTER COLUMN "icon_name" SET DATA TYPE varchar;
  ALTER TABLE "footer_contact_info" ALTER COLUMN "icon_name" SET DATA TYPE varchar;
  ALTER TABLE "articles" DROP COLUMN "slug";
  ALTER TABLE "media" DROP COLUMN "_objectkey";
  DROP TYPE "public"."enum_services_icon_font";
  DROP TYPE "public"."enum_footer_social_links_icon_name";
  DROP TYPE "public"."enum_footer_contact_info_icon_name";`)
}
