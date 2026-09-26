CREATE TYPE "public"."import_status" AS ENUM('committed', 'undone');--> statement-breakpoint
CREATE TYPE "public"."location_source" AS ENUM('seed', 'member');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."tasting_source" AS ENUM('manual', 'import');--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"root_beer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_root_beer_id_pk" PRIMARY KEY("user_id","root_beer_id")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "import_status" DEFAULT 'committed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_root_beers" (
	"location_id" uuid NOT NULL,
	"root_beer_id" uuid NOT NULL,
	"price_cents" integer,
	"last_seen_on" date NOT NULL,
	"reported_by" uuid,
	CONSTRAINT "location_root_beers_location_id_root_beer_id_pk" PRIMARY KEY("location_id","root_beer_id")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"source" "location_source" DEFAULT 'member' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tasting_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"taken_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"root_beer_id" uuid NOT NULL,
	"retailer" text NOT NULL,
	"url" text NOT NULL,
	"price_cents" integer NOT NULL,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"shipping_note" text,
	"last_checked_on" date NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "root_beers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"brand" text NOT NULL,
	"name" text DEFAULT 'Root Beer' NOT NULL,
	"maker" text,
	"style" text,
	"sweetener" text,
	"origin" text,
	"description" text,
	"image_url" text,
	"discontinued" boolean DEFAULT false NOT NULL,
	"search_key" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "root_beers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tastings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"root_beer_id" uuid NOT NULL,
	"rating" numeric(3, 1) NOT NULL,
	"notes" text,
	"tasted_on" date,
	"location_id" uuid,
	"purchased_from" text,
	"source" "tasting_source" DEFAULT 'manual' NOT NULL,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tastings_user_root_beer" UNIQUE("user_id","root_beer_id"),
	CONSTRAINT "tastings_rating_range" CHECK ("tastings"."rating" >= 0 AND "tastings"."rating" <= 10)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"color" text DEFAULT '#8b4513' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_root_beer_id_root_beers_id_fk" FOREIGN KEY ("root_beer_id") REFERENCES "public"."root_beers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_root_beers" ADD CONSTRAINT "location_root_beers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_root_beers" ADD CONSTRAINT "location_root_beers_root_beer_id_root_beers_id_fk" FOREIGN KEY ("root_beer_id") REFERENCES "public"."root_beers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_root_beers" ADD CONSTRAINT "location_root_beers_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_tasting_id_tastings_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_links" ADD CONSTRAINT "purchase_links_root_beer_id_root_beers_id_fk" FOREIGN KEY ("root_beer_id") REFERENCES "public"."root_beers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_links" ADD CONSTRAINT "purchase_links_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_beers" ADD CONSTRAINT "root_beers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_root_beer_id_root_beers_id_fk" FOREIGN KEY ("root_beer_id") REFERENCES "public"."root_beers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_lat_lng" ON "locations" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "root_beers_search_trgm" ON "root_beers" USING gin ("search_key" gin_trgm_ops);