CREATE TABLE "root_beer_barcodes" (
	"barcode" text PRIMARY KEY NOT NULL,
	"root_beer_id" uuid NOT NULL,
	"source" text DEFAULT 'member' NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "root_beers" ADD COLUMN "source" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "root_beers" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "root_beer_barcodes" ADD CONSTRAINT "root_beer_barcodes_root_beer_id_root_beers_id_fk" FOREIGN KEY ("root_beer_id") REFERENCES "public"."root_beers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_beer_barcodes" ADD CONSTRAINT "root_beer_barcodes_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;