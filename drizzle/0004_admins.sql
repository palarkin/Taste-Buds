ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The club founder (first member) starts as admin.
UPDATE "users" SET "is_admin" = true WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1);
