ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "team_payment_policy" text DEFAULT 'PER_MEMBER' NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "allow_member_replacement" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "allow_late_joining" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_invitations" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_status_idx" ON "team_invitations" ("status");
