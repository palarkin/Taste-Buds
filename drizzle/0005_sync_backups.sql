CREATE TABLE "location_tombstones" (
	"external_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"error" text,
	"snapshot" text,
	"snapshot_bytes" integer
);
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "source_last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "location_tombstones" ADD CONSTRAINT "location_tombstones_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_syncs" ADD CONSTRAINT "source_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Pins already synced count as seen now.
UPDATE "locations" SET "source_last_seen_at" = now() WHERE "external_id" LIKE 'rbmap:%';
