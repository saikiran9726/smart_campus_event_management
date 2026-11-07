ALTER TYPE "question_type" ADD VALUE IF NOT EXISTS 'DROPDOWN';
--> statement-breakpoint
ALTER TYPE "question_type" ADD VALUE IF NOT EXISTS 'RADIO';
--> statement-breakpoint
ALTER TYPE "question_type" ADD VALUE IF NOT EXISTS 'URL';
--> statement-breakpoint
ALTER TYPE "question_type" ADD VALUE IF NOT EXISTS 'YES_NO';
--> statement-breakpoint
ALTER TYPE "question_type" ADD VALUE IF NOT EXISTS 'INSTRUCTION';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "college_name" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "program" text;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "form_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "form_published" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "registration_mode" text DEFAULT 'INDIVIDUAL' NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "approval_required" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cancellation_deadline" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "form_questions" ADD COLUMN IF NOT EXISTS "placeholder" text;
--> statement-breakpoint
ALTER TABLE "form_questions" ADD COLUMN IF NOT EXISTS "default_value" text;
--> statement-breakpoint
ALTER TABLE "form_questions" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'ALWAYS' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"version" integer NOT NULL,
	"schema_snapshot" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "form_versions_event_version_idx" ON "form_versions" ("event_id", "version");
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "form_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT 'APPROVED' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"invited_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"invited_email" text,
	"invited_roll_number" text,
	"invited_user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_team_id_idx" ON "team_invitations" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_event_id_idx" ON "team_invitations" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_invited_user_id_idx" ON "team_invitations" ("invited_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_invited_email_idx" ON "team_invitations" ("invited_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_invited_roll_number_idx" ON "team_invitations" ("invited_roll_number");
