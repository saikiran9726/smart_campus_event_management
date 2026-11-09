-- Migration 0019: Event & club ratings, public reviews, and moderation system
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "club_stars" smallint;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "club_comment" text;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "comment" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_club_stars_check') THEN
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_club_stars_check" CHECK ("club_stars" IS NULL OR ("club_stars" >= 1 AND "club_stars" <= 5));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_hidden_at_idx" ON "reviews" USING btree ("hidden_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_club_stars_idx" ON "reviews" USING btree ("club_stars");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL REFERENCES "reviews"("id") ON DELETE CASCADE,
	"reporter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_reports_review_reporter_unique" UNIQUE("review_id", "reporter_user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_reports_review_id_idx" ON "review_reports" USING btree ("review_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_reports_reporter_user_id_idx" ON "review_reports" USING btree ("reporter_user_id");
