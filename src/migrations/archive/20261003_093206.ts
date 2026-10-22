import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_category" AS ENUM('articles', 'others');
  CREATE TYPE "public"."enum_projects_categories" AS ENUM('front-end', 'back-end', 'cms-crm');
  CREATE TYPE "public"."enum_skills_group" AS ENUM('frontend', 'backend');
  CREATE TYPE "public"."enum_skills_color" AS ENUM('primary', 'secondary', 'success', 'info', 'warning', 'danger');
  CREATE TYPE "public"."enum_footer_social_links_platform" AS ENUM('facebook', 'twitter', 'instagram', 'linkedin', 'github', 'whatsapp');
  CREATE TYPE "public"."enum_footer_contact_info_type" AS ENUM('address', 'email', 'phone', 'whatsapp');
  CREATE TYPE "public"."enum_footer_contact_info_class_name" AS ENUM('text-white', 'text-primary', 'text-secondary', 'text-success', 'text-info', 'text-warning', 'text-danger');
  CREATE TABLE "about_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_url" varchar NOT NULL
  );
  
  CREATE TABLE "header" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"sure_name" varchar NOT NULL,
  	"profile_image_id" integer,
  	"image_url" varchar,
  	"request_c_v" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "header_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"excerpt" varchar NOT NULL,
  	"description" varchar,
  	"featured" boolean,
  	"category" "enum_articles_category",
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"read_time" numeric,
  	"image_id" integer,
  	"image_url" varchar,
  	"link" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "certificates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"issuer" varchar NOT NULL,
  	"issued_at" timestamp(3) with time zone NOT NULL,
  	"image_id" integer,
  	"image_url" varchar,
  	"link" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "educations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" numeric DEFAULT 0,
  	"title" varchar NOT NULL,
  	"institution" varchar NOT NULL,
  	"location" varchar,
  	"date" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" numeric DEFAULT 0,
  	"title" varchar NOT NULL,
  	"date" varchar NOT NULL,
  	"company" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "projects_categories" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_projects_categories",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "projects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" numeric DEFAULT 0,
  	"title" varchar NOT NULL,
  	"image_id" integer,
  	"src" varchar,
  	"place_holder" varchar,
  	"url" varchar,
  	"read_more_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "services" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" numeric DEFAULT 0,
  	"category" varchar NOT NULL,
  	"icon_font" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "services_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "skills" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" numeric DEFAULT 0,
  	"label" varchar NOT NULL,
  	"group" "enum_skills_group" DEFAULT 'frontend' NOT NULL,
  	"value" numeric NOT NULL,
  	"color" "enum_skills_color" DEFAULT 'primary' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "footer_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_footer_social_links_platform" NOT NULL,
  	"url" varchar NOT NULL,
  	"icon_name" varchar NOT NULL,
  	"aria_label" varchar NOT NULL
  );
  
  CREATE TABLE "footer_profiles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "footer_contact_info" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_footer_contact_info_type" NOT NULL,
  	"icon_name" varchar NOT NULL,
  	"content" varchar NOT NULL,
  	"is_link" boolean,
  	"url" varchar,
  	"class_name" "enum_footer_contact_info_class_name" DEFAULT 'text-white'
  );
  
  CREATE TABLE "footer" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"roles_full_name" varchar NOT NULL,
  	"hiring_cta_label" varchar,
  	"hiring_cta_url" varchar,
  	"copy_right_year" numeric NOT NULL,
  	"copy_right_website" varchar,
  	"copy_right_url" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "footer_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "about_sessions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "about_sessions" CASCADE;
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_about_fk";
  
  DROP INDEX "about_email_idx";
  DROP INDEX "payload_preferences_rels_about_id_idx";
  ALTER TABLE "about" ADD COLUMN "title" varchar NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "header_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "articles_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "certificates_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "educations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiences_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "projects_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "services_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "skills_id" integer;
  ALTER TABLE "about_images" ADD CONSTRAINT "about_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."about"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "header" ADD CONSTRAINT "header_profile_image_id_media_id_fk" FOREIGN KEY ("profile_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "header_texts" ADD CONSTRAINT "header_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projects_categories" ADD CONSTRAINT "projects_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects" ADD CONSTRAINT "projects_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "services_texts" ADD CONSTRAINT "services_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_social_links" ADD CONSTRAINT "footer_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_profiles" ADD CONSTRAINT "footer_profiles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_contact_info" ADD CONSTRAINT "footer_contact_info_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_texts" ADD CONSTRAINT "footer_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "about_images_order_idx" ON "about_images" USING btree ("_order");
  CREATE INDEX "about_images_parent_id_idx" ON "about_images" USING btree ("_parent_id");
  CREATE INDEX "header_profile_image_idx" ON "header" USING btree ("profile_image_id");
  CREATE INDEX "header_updated_at_idx" ON "header" USING btree ("updated_at");
  CREATE INDEX "header_created_at_idx" ON "header" USING btree ("created_at");
  CREATE INDEX "header_texts_order_parent" ON "header_texts" USING btree ("order","parent_id");
  CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category");
  CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");
  CREATE INDEX "articles_image_idx" ON "articles" USING btree ("image_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "certificates_issued_at_idx" ON "certificates" USING btree ("issued_at");
  CREATE INDEX "certificates_image_idx" ON "certificates" USING btree ("image_id");
  CREATE INDEX "certificates_updated_at_idx" ON "certificates" USING btree ("updated_at");
  CREATE INDEX "certificates_created_at_idx" ON "certificates" USING btree ("created_at");
  CREATE INDEX "educations_order_idx" ON "educations" USING btree ("order");
  CREATE INDEX "educations_updated_at_idx" ON "educations" USING btree ("updated_at");
  CREATE INDEX "educations_created_at_idx" ON "educations" USING btree ("created_at");
  CREATE INDEX "experiences_order_idx" ON "experiences" USING btree ("order");
  CREATE INDEX "experiences_updated_at_idx" ON "experiences" USING btree ("updated_at");
  CREATE INDEX "experiences_created_at_idx" ON "experiences" USING btree ("created_at");
  CREATE INDEX "projects_categories_order_idx" ON "projects_categories" USING btree ("order");
  CREATE INDEX "projects_categories_parent_idx" ON "projects_categories" USING btree ("parent_id");
  CREATE INDEX "projects_order_idx" ON "projects" USING btree ("order");
  CREATE INDEX "projects_image_idx" ON "projects" USING btree ("image_id");
  CREATE INDEX "projects_updated_at_idx" ON "projects" USING btree ("updated_at");
  CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");
  CREATE INDEX "services_order_idx" ON "services" USING btree ("order");
  CREATE INDEX "services_updated_at_idx" ON "services" USING btree ("updated_at");
  CREATE INDEX "services_created_at_idx" ON "services" USING btree ("created_at");
  CREATE INDEX "services_texts_order_parent" ON "services_texts" USING btree ("order","parent_id");
  CREATE INDEX "skills_order_idx" ON "skills" USING btree ("order");
  CREATE INDEX "skills_group_idx" ON "skills" USING btree ("group");
  CREATE INDEX "skills_updated_at_idx" ON "skills" USING btree ("updated_at");
  CREATE INDEX "skills_created_at_idx" ON "skills" USING btree ("created_at");
  CREATE INDEX "footer_social_links_order_idx" ON "footer_social_links" USING btree ("_order");
  CREATE INDEX "footer_social_links_parent_id_idx" ON "footer_social_links" USING btree ("_parent_id");
  CREATE INDEX "footer_profiles_order_idx" ON "footer_profiles" USING btree ("_order");
  CREATE INDEX "footer_profiles_parent_id_idx" ON "footer_profiles" USING btree ("_parent_id");
  CREATE INDEX "footer_contact_info_order_idx" ON "footer_contact_info" USING btree ("_order");
  CREATE INDEX "footer_contact_info_parent_id_idx" ON "footer_contact_info" USING btree ("_parent_id");
  CREATE INDEX "footer_texts_order_parent" ON "footer_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_header_fk" FOREIGN KEY ("header_id") REFERENCES "public"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_certificates_fk" FOREIGN KEY ("certificates_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_educations_fk" FOREIGN KEY ("educations_id") REFERENCES "public"."educations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiences_fk" FOREIGN KEY ("experiences_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_projects_fk" FOREIGN KEY ("projects_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_skills_fk" FOREIGN KEY ("skills_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_header_id_idx" ON "payload_locked_documents_rels" USING btree ("header_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_certificates_id_idx" ON "payload_locked_documents_rels" USING btree ("certificates_id");
  CREATE INDEX "payload_locked_documents_rels_educations_id_idx" ON "payload_locked_documents_rels" USING btree ("educations_id");
  CREATE INDEX "payload_locked_documents_rels_experiences_id_idx" ON "payload_locked_documents_rels" USING btree ("experiences_id");
  CREATE INDEX "payload_locked_documents_rels_projects_id_idx" ON "payload_locked_documents_rels" USING btree ("projects_id");
  CREATE INDEX "payload_locked_documents_rels_services_id_idx" ON "payload_locked_documents_rels" USING btree ("services_id");
  CREATE INDEX "payload_locked_documents_rels_skills_id_idx" ON "payload_locked_documents_rels" USING btree ("skills_id");
  ALTER TABLE "about" DROP COLUMN "email";
  ALTER TABLE "about" DROP COLUMN "reset_password_token";
  ALTER TABLE "about" DROP COLUMN "reset_password_expiration";
  ALTER TABLE "about" DROP COLUMN "salt";
  ALTER TABLE "about" DROP COLUMN "hash";
  ALTER TABLE "about" DROP COLUMN "reset_password_requested_at";
  ALTER TABLE "about" DROP COLUMN "login_attempts";
  ALTER TABLE "about" DROP COLUMN "lock_until";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "about_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "about_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  ALTER TABLE "about_images" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "header" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "header_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "articles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "certificates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "educations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "projects_categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "projects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "skills" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_social_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_profiles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_contact_info" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "about_images" CASCADE;
  DROP TABLE "header" CASCADE;
  DROP TABLE "header_texts" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "certificates" CASCADE;
  DROP TABLE "educations" CASCADE;
  DROP TABLE "experiences" CASCADE;
  DROP TABLE "projects_categories" CASCADE;
  DROP TABLE "projects" CASCADE;
  DROP TABLE "services" CASCADE;
  DROP TABLE "services_texts" CASCADE;
  DROP TABLE "skills" CASCADE;
  DROP TABLE "footer_social_links" CASCADE;
  DROP TABLE "footer_profiles" CASCADE;
  DROP TABLE "footer_contact_info" CASCADE;
  DROP TABLE "footer" CASCADE;
  DROP TABLE "footer_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_header_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_articles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_certificates_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_educations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_projects_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_services_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_skills_fk";
  
  DROP INDEX "payload_locked_documents_rels_header_id_idx";
  DROP INDEX "payload_locked_documents_rels_articles_id_idx";
  DROP INDEX "payload_locked_documents_rels_certificates_id_idx";
  DROP INDEX "payload_locked_documents_rels_educations_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiences_id_idx";
  DROP INDEX "payload_locked_documents_rels_projects_id_idx";
  DROP INDEX "payload_locked_documents_rels_services_id_idx";
  DROP INDEX "payload_locked_documents_rels_skills_id_idx";
  ALTER TABLE "about" ADD COLUMN "email" varchar NOT NULL;
  ALTER TABLE "about" ADD COLUMN "reset_password_token" varchar;
  ALTER TABLE "about" ADD COLUMN "reset_password_expiration" timestamp(3) with time zone;
  ALTER TABLE "about" ADD COLUMN "salt" varchar;
  ALTER TABLE "about" ADD COLUMN "hash" varchar;
  ALTER TABLE "about" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;
  ALTER TABLE "about" ADD COLUMN "login_attempts" numeric DEFAULT 0;
  ALTER TABLE "about" ADD COLUMN "lock_until" timestamp(3) with time zone;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "about_id" integer;
  ALTER TABLE "about_sessions" ADD CONSTRAINT "about_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."about"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "about_sessions_order_idx" ON "about_sessions" USING btree ("_order");
  CREATE INDEX "about_sessions_parent_id_idx" ON "about_sessions" USING btree ("_parent_id");
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_about_fk" FOREIGN KEY ("about_id") REFERENCES "public"."about"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "about_email_idx" ON "about" USING btree ("email");
  CREATE INDEX "payload_preferences_rels_about_id_idx" ON "payload_preferences_rels" USING btree ("about_id");
  ALTER TABLE "about" DROP COLUMN "title";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "header_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "articles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "certificates_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "educations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "projects_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "services_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "skills_id";
  DROP TYPE "public"."enum_articles_category";
  DROP TYPE "public"."enum_projects_categories";
  DROP TYPE "public"."enum_skills_group";
  DROP TYPE "public"."enum_skills_color";
  DROP TYPE "public"."enum_footer_social_links_platform";
  DROP TYPE "public"."enum_footer_contact_info_type";
  DROP TYPE "public"."enum_footer_contact_info_class_name";`)
}
