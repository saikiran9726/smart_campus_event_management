CREATE TABLE IF NOT EXISTS "accreditation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
	"serial" text NOT NULL UNIQUE,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"format" text NOT NULL,
	"generated_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"storage_key" text,
	"event_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tickets_event_checked_in_at_idx" ON "tickets" ("event_id", "checked_in_at");
CREATE INDEX IF NOT EXISTS "tickets_event_checked_in_via_idx" ON "tickets" ("event_id", "checked_in_via");
CREATE INDEX IF NOT EXISTS "scan_logs_event_result_idx" ON "scan_logs" ("event_id", "result");
CREATE INDEX IF NOT EXISTS "scan_logs_event_ticket_id_idx" ON "scan_logs" ("event_id", "ticket_id");
CREATE INDEX IF NOT EXISTS "reviews_event_stars_idx" ON "reviews" ("event_id", "stars");
CREATE INDEX IF NOT EXISTS "accreditation_reports_club_id_idx" ON "accreditation_reports" ("club_id");
CREATE INDEX IF NOT EXISTS "accreditation_reports_serial_idx" ON "accreditation_reports" ("serial");
