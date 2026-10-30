-- Amend venue_bookings exclusion constraint to block both ACTIVE and PENDING_HOLD overlaps
DO $$ BEGIN
  ALTER TABLE "venue_bookings" DROP CONSTRAINT IF EXISTS "venue_bookings_no_overlap";
  ALTER TABLE "venue_bookings"
    ADD CONSTRAINT "venue_bookings_no_overlap"
    EXCLUDE USING gist (venue_id WITH =, during WITH &&)
    WHERE (status IN ('ACTIVE', 'PENDING_HOLD'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
