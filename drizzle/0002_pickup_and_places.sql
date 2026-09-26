ALTER TABLE "location_root_beers" ALTER COLUMN "last_seen_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "tastings" ADD COLUMN "purchased_on" date;--> statement-breakpoint
ALTER TABLE "tastings" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_external_id_unique" UNIQUE("external_id");