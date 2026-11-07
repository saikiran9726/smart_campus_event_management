-- Migration 0018: Notification delivery tracking & notification preferences
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "provider_message_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_provider_message_id_idx" ON "notifications" USING btree ("provider_message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_event_kind_channel_idx" ON "notifications" USING btree ("user_id", "event_id", "kind", "channel");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"event_reminders" boolean DEFAULT true NOT NULL,
	"registration_updates" boolean DEFAULT true NOT NULL,
	"team_updates" boolean DEFAULT true NOT NULL,
	"announcements" boolean DEFAULT true NOT NULL,
	"volunteer_updates" boolean DEFAULT true NOT NULL,
	"whatsapp_consent_at" timestamp with time zone,
	"whatsapp_consent_withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
