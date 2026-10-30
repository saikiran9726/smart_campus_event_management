ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "notes" jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_event_kind_channel_idx" ON "notifications" ("user_id", "event_id", "kind", "channel");
