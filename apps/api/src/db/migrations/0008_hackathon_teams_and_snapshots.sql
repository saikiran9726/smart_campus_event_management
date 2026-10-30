ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "submission_deadline_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_team_roster_snapshots_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'team_roster_snapshots rows are immutable and cannot be updated';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_prevent_team_roster_snapshots_update ON team_roster_snapshots;--> statement-breakpoint
CREATE TRIGGER trg_prevent_team_roster_snapshots_update
BEFORE UPDATE ON team_roster_snapshots
FOR EACH ROW
EXECUTE FUNCTION prevent_team_roster_snapshots_update();
