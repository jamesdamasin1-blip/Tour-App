-- ============================================================
-- 012_realtime_wallets.sql
-- Enable Supabase Realtime for the wallets and funding_lots tables
-- and set Replica Identity so deletions are properly synced via realtime.
-- ============================================================

-- 1. Add tables to supabase_realtime publication
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE funding_lots;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. REPLICA IDENTITY FULL ensures the entire row is broadcasted during DELETE events
ALTER TABLE wallets REPLICA IDENTITY FULL;
ALTER TABLE funding_lots REPLICA IDENTITY FULL;

-- 3. Notify PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';
