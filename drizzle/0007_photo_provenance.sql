ALTER TABLE "root_beers" ADD COLUMN "image_source" text;--> statement-breakpoint
ALTER TABLE "root_beers" ADD COLUMN "image_product_title" text;--> statement-breakpoint
ALTER TABLE "root_beers" ADD COLUMN "image_source_url" text;--> statement-breakpoint
ALTER TABLE "root_beers" ADD COLUMN "image_locked" boolean DEFAULT false NOT NULL;