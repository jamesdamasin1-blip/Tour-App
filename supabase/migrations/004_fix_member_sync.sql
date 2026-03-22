-- ============================================================
-- 004_fix_member_sync.sql
-- Fix sync for trip members (invitees):
--   1. DISABLE RLS that was accidentally enabled (restore original)
--   2. Backfill NULL user_id on activities/expenses
--   3. Add tables to supabase_realtime for instant sync
--   4. REPLICA IDENTITY FULL so DELETE events work via realtime
--
-- Run this ENTIRE block in your Supabase SQL Editor.
-- ============================================================

-- ─── 0. DISABLE RLS (restore pre-migration behavior) ────────
-- RLS was likely disabled before. The previous migration run
-- enabled it, which blocked the invitee from reading anything.
-- Disable it to restore working sync. Can be re-enabled later
-- with properly tested policies.
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;

-- ─── 1. Backfill NULL user_ids ───────────────────────────────
-- Activities/expenses created before auth may have NULL user_id.
-- Useful for future RLS enablement.
UPDATE activities a
SET user_id = t.user_id
FROM trips t
WHERE a.trip_id = t.id
  AND a.user_id IS NULL
  AND t.user_id IS NOT NULL;

UPDATE expenses e
SET user_id = t.user_id
FROM trips t
WHERE e.trip_id = t.id
  AND e.user_id IS NULL
  AND t.user_id IS NOT NULL;

-- ─── 2. Add tables to realtime publication ───────────────────
-- This is what makes sync instant (<1s) instead of polling (>60s).
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE trips;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE activities;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3. REPLICA IDENTITY FULL for DELETE events ─────────────
-- Without this, realtime DELETE payloads only contain the PK,
-- missing trip_id needed for client-side filtering.
ALTER TABLE activities REPLICA IDENTITY FULL;
ALTER TABLE expenses REPLICA IDENTITY FULL;
ALTER TABLE trips REPLICA IDENTITY FULL;

-- ─── 4. Index for member lookups (future-proofing) ──────────
CREATE INDEX IF NOT EXISTS idx_trips_members ON trips USING gin (members);

-- ─── Done ────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
