-- ============================================================
-- 013_is_spontaneous.sql
-- Add the missing is_spontaneous column to the activities table.
-- Without this, pushing spontaneous activities to Supabase will crash.
-- ============================================================

ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_spontaneous BOOLEAN DEFAULT false;

-- Notify PostgREST to reload the schema cache so the new column is recognized
NOTIFY pgrst, 'reload schema';
