ALTER TABLE "purchase_links" ADD COLUMN "source" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_links" ADD COLUMN "in_stock" boolean;