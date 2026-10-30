ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "show_name" boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "od_letters_event_user_idx" ON "od_letters" ("event_id", "user_id");--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD COLUMN IF NOT EXISTS "title" text NOT NULL DEFAULT 'General Allocation';--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'GENERAL';--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD COLUMN IF NOT EXISTS "spent_paise" integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"resource_key" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_resources" ADD CONSTRAINT "event_resources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
