-- Custom SQL migration: Extensions, Constraints, Triggers, and Search Indexes

-- 1. Extension Guard
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping extension creation due to permissions; assume pre-installed.';
END $$;

-- 2. Venue Bookings EXCLUDE Constraint (prevent overlapping bookings for active venues)
DO $$ BEGIN
  ALTER TABLE "venue_bookings"
    ADD CONSTRAINT "venue_bookings_no_overlap"
    EXCLUDE USING gist (venue_id WITH =, during WITH &&)
    WHERE (status = 'ACTIVE');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- 3. Team Roster Snapshots Immutability Trigger
CREATE OR REPLACE FUNCTION prevent_roster_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'team_roster_snapshots are immutable; UPDATE and DELETE operations are prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_roster_snapshot_mutation ON "team_roster_snapshots";
CREATE TRIGGER trg_prevent_roster_snapshot_mutation
  BEFORE UPDATE OR DELETE ON "team_roster_snapshots"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_roster_snapshot_mutation();

-- 4. GIN Index on Events for Full Text Search (title || description)
CREATE INDEX IF NOT EXISTS "events_search_gin_idx"
  ON "events" USING gin (to_tsvector('english', "title" || ' ' || coalesce("description", '')));
