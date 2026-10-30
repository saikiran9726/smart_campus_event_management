ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_channel_cursor_idx" ON "messages" ("channel_id", "created_at" DESC, "id" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_channels_event_slug_idx" ON "club_channels" ("event_id", "slug");--> statement-breakpoint
INSERT INTO "users" ("id", "clerk_id", "email", "full_name", "role", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000000', 'system_eventora', 'system@eventora.internal', 'Eventora System', 'ADMIN', now(), now())
ON CONFLICT ("id") DO NOTHING;
