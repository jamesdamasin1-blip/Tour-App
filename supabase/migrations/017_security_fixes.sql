-- Migration 017: Security hardening
-- Fixes:
--   1. RLS Disabled in Public / Policy Exists RLS Disabled — re-enable RLS on core tables
--   2. Function Search Path Mutable — pin search_path on all trigger/utility functions
-- Note: "Leaked Password Protection Disabled" must be enabled in the Supabase
--       dashboard under Authentication > Settings > Password Protection.

-- ═══════════════════════════════════════════════════════════════════
-- 1. ENSURE RLS IS ENABLED ON ALL CORE TABLES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE trips          ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_lots   ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- 2. FIX MUTABLE SEARCH PATH ON TRIGGER / UTILITY FUNCTIONS
--    Pinning search_path prevents search-path injection attacks.
-- ═══════════════════════════════════════════════════════════════════

-- 2a. increment_version (BEFORE UPDATE trigger)
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.version IS NULL OR NEW.version <= OLD.version THEN
        NEW.version := OLD.version + 1;
    END IF;
    NEW.updated_at := EXTRACT(EPOCH FROM now()) * 1000;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = '';

-- 2b. set_initial_version (BEFORE INSERT trigger)
CREATE OR REPLACE FUNCTION set_initial_version()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.version IS NULL OR NEW.version < 1 THEN
        NEW.version := 1;
    END IF;
    IF NEW.updated_at IS NULL THEN
        NEW.updated_at := EXTRACT(EPOCH FROM now()) * 1000;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = '';

-- 2c. soft_delete_record (SECURITY DEFINER RPC)
CREATE OR REPLACE FUNCTION soft_delete_record(
    p_table TEXT,
    p_id    TEXT,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    EXECUTE format(
        'UPDATE public.%I SET deleted_at = now(), updated_by = $1, version = version + 1 WHERE id = $2 AND deleted_at IS NULL RETURNING to_jsonb(%I.*)',
        p_table, p_table
    ) INTO result USING p_user_id, p_id;

    RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = '';

-- 2d. soft_delete_trip (SECURITY DEFINER RPC)
CREATE OR REPLACE FUNCTION soft_delete_trip(
    p_trip_id TEXT,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    trip_result JSONB;
BEGIN
    UPDATE public.trips
    SET deleted_at = now(), updated_by = p_user_id, version = version + 1
    WHERE id = p_trip_id AND deleted_at IS NULL
    RETURNING to_jsonb(trips.*) INTO trip_result;

    IF trip_result IS NULL THEN
        RETURN '{"error": "trip not found or already deleted"}'::JSONB;
    END IF;

    UPDATE public.activities
    SET deleted_at = now(), updated_by = p_user_id, version = version + 1
    WHERE trip_id = p_trip_id AND deleted_at IS NULL;

    UPDATE public.expenses
    SET deleted_at = now(), updated_by = p_user_id, version = version + 1
    WHERE trip_id = p_trip_id AND deleted_at IS NULL;

    UPDATE public.wallets
    SET deleted_at = now(), updated_by = p_user_id, version = version + 1
    WHERE trip_id = p_trip_id AND deleted_at IS NULL;

    RETURN trip_result;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = '';

-- 2e. update_trip_invites_updated_at (BEFORE UPDATE trigger)
CREATE OR REPLACE FUNCTION update_trip_invites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = '';
