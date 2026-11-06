ALTER TYPE "notification_channel" ADD VALUE IF NOT EXISTS 'IN_APP';
--> statement-breakpoint
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'REGISTRATION_APPROVED';
--> statement-breakpoint
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'REGISTRATION_REJECTED';
--> statement-breakpoint
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'PAYMENT_SUCCESS';
--> statement-breakpoint
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
--> statement-breakpoint
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'TEAM_INVITATION';
--> statement-breakpoint
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'REGISTRATION_CANCELLED';
--> statement-breakpoint
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'ORGANIZER_ALERT';
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registrations_approval_status_idx" ON "registrations" ("approval_status");
