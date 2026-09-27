CREATE TABLE "duplicate_dismissals" (
	"kind" text NOT NULL,
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"dismissed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_dismissals_kind_a_id_b_id_pk" PRIMARY KEY("kind","a_id","b_id")
);
--> statement-breakpoint
CREATE TABLE "root_beer_aliases" (
	"search_key" text PRIMARY KEY NOT NULL,
	"slug" text,
	"root_beer_id" uuid NOT NULL,
	"merged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "root_beer_aliases_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "location_tombstones" ADD COLUMN "merged_into" uuid;--> statement-breakpoint
ALTER TABLE "duplicate_dismissals" ADD CONSTRAINT "duplicate_dismissals_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_beer_aliases" ADD CONSTRAINT "root_beer_aliases_root_beer_id_root_beers_id_fk" FOREIGN KEY ("root_beer_id") REFERENCES "public"."root_beers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_beer_aliases" ADD CONSTRAINT "root_beer_aliases_merged_by_users_id_fk" FOREIGN KEY ("merged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_tombstones" ADD CONSTRAINT "location_tombstones_merged_into_locations_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;