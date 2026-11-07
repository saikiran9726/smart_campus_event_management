DO $$ BEGIN
 CREATE TYPE "public"."volunteer_status" AS ENUM('ACTIVE', 'REVOKED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_volunteers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"gate" text DEFAULT 'Main Gate' NOT NULL,
	"role" text DEFAULT 'SCANNER' NOT NULL,
	"assigned_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"status" "volunteer_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "volunteer_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"gate" text DEFAULT 'Main Gate' NOT NULL,
	"role" text DEFAULT 'SCANNER' NOT NULL,
	"invited_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"token" text NOT NULL UNIQUE,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_volunteers_event_user_idx" ON "event_volunteers" ("event_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_volunteers_user_id_idx" ON "event_volunteers" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_volunteers_event_id_idx" ON "event_volunteers" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_volunteers_status_idx" ON "event_volunteers" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "volunteer_invitations_email_idx" ON "volunteer_invitations" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "volunteer_invitations_event_id_idx" ON "volunteer_invitations" ("event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "volunteer_invitations_token_idx" ON "volunteer_invitations" ("token");
