-- Migration 006: Version tracking + Soft deletes + updated_by attribution
-- Purpose: Enable deterministic conflict resolution and reliable delete propagation

-- ═══════════════════════════════════════════════════════════════════
-- 1. ADD VERSION + SOFT DELETE + ATTRIBUTION COLUMNS
-- ═══════════════════════════════════════════════════════════════════

-- TRIPS
ALTER TABLE trips ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS updated_by UUID DEFAULT NULL;

-- ACTIVITIES
ALTER TABLE activities ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_by UUID DEFAULT NULL;

-- EXPENSES
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_by UUID DEFAULT NULL;

-- WALLETS
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS updated_by UUID DEFAULT NULL;

-- FUNDING_LOTS
ALTER TABLE funding_lots ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE funding_lots ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE funding_lots ADD COLUMN IF NOT EXISTS updated_by UUID DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2. INDEXES FOR SOFT DELETE FILTERING
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_trips_deleted_at ON trips (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_deleted_at ON activities (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at ON expenses (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallets_deleted_at ON wallets (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funding_lots_deleted_at ON funding_lots (deleted_at) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activities_trip_alive ON activities (trip_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_trip_alive ON expenses (trip_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_activity_alive ON expenses (activity_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 3. AUTO-INCREMENT VERSION TRIGGER
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Only increment if version wasn't explicitly set higher by the client
    IF NEW.version IS NULL OR NEW.version <= OLD.version THEN
        NEW.version := OLD.version + 1;
    END IF;
    NEW.updated_at := EXTRACT(EPOCH FROM now()) * 1000;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all shared tables
DROP TRIGGER IF EXISTS trg_trips_version ON trips;
CREATE TRIGGER trg_trips_version
    BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS trg_activities_version ON activities;
CREATE TRIGGER trg_activities_version
    BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS trg_expenses_version ON expenses;
CREATE TRIGGER trg_expenses_version
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS trg_wallets_version ON wallets;
CREATE TRIGGER trg_wallets_version
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS trg_funding_lots_version ON funding_lots;
CREATE TRIGGER trg_funding_lots_version
    BEFORE UPDATE ON funding_lots
    FOR EACH ROW EXECUTE FUNCTION increment_version();

-- ═══════════════════════════════════════════════════════════════════
-- 4. SET VERSION=1 ON INSERT TRIGGER
-- ═══════════════════════════════════════════════════════════════════

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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trips_init_version ON trips;
CREATE TRIGGER trg_trips_init_version
    BEFORE INSERT ON trips
    FOR EACH ROW EXECUTE FUNCTION set_initial_version();

DROP TRIGGER IF EXISTS trg_activities_init_version ON activities;
CREATE TRIGGER trg_activities_init_version
    BEFORE INSERT ON activities
    FOR EACH ROW EXECUTE FUNCTION set_initial_version();

DROP TRIGGER IF EXISTS trg_expenses_init_version ON expenses;
CREATE TRIGGER trg_expenses_init_version
    BEFORE INSERT ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_initial_version();

DROP TRIGGER IF EXISTS trg_wallets_init_version ON wallets;
CREATE TRIGGER trg_wallets_init_version
    BEFORE INSERT ON wallets
    FOR EACH ROW EXECUTE FUNCTION set_initial_version();

DROP TRIGGER IF EXISTS trg_funding_lots_init_version ON funding_lots;
CREATE TRIGGER trg_funding_lots_init_version
    BEFORE INSERT ON funding_lots
    FOR EACH ROW EXECUTE FUNCTION set_initial_version();

-- ═══════════════════════════════════════════════════════════════════
-- 5. SOFT DELETE FUNCTION (replaces hard delete)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION soft_delete_record(
    p_table TEXT,
    p_id TEXT,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    EXECUTE format(
        'UPDATE %I SET deleted_at = now(), updated_by = $1, version = version + 1 WHERE id = $2 AND deleted_at IS NULL RETURNING to_jsonb(%I.*)',
        p_table, p_table
    ) INTO result USING p_user_id, p_id;

    RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════
-- 6. CASCADE SOFT DELETE FOR TRIPS
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION soft_delete_trip(
    p_trip_id TEXT,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    trip_result JSONB;
BEGIN
    -- Soft delete the trip
    UPDATE trips SET deleted_at = now(), updated_by = p_user_id, version = version + 1
    WHERE id = p_trip_id AND deleted_at IS NULL
    RETURNING to_jsonb(trips.*) INTO trip_result;

    IF trip_result IS NULL THEN
        RETURN '{"error": "trip not found or already deleted"}'::JSONB;
    END IF;

    -- Cascade soft delete to activities
    UPDATE activities SET deleted_at = now(), updated_by = p_user_id, version = version + 1
    WHERE trip_id = p_trip_id AND deleted_at IS NULL;

    -- Cascade soft delete to expenses
    UPDATE expenses SET deleted_at = now(), updated_by = p_user_id, version = version + 1
    WHERE trip_id = p_trip_id AND deleted_at IS NULL;

    -- Cascade soft delete to wallets
    UPDATE wallets SET deleted_at = now(), updated_by = p_user_id, version = version + 1
    WHERE trip_id = p_trip_id AND deleted_at IS NULL;

    RETURN trip_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════
-- 7. ENSURE REALTIME PUBLICATION INCLUDES NEW COLUMNS
-- ═══════════════════════════════════════════════════════════════════

-- The REPLICA IDENTITY FULL was already set in migration 004.
-- The version, deleted_at, updated_by columns will automatically
-- be included in realtime payloads since REPLICA IDENTITY is FULL.

-- ═══════════════════════════════════════════════════════════════════
-- 8. BACKFILL: Set version=1 for existing rows
-- ═══════════════════════════════════════════════════════════════════

UPDATE trips SET version = 1 WHERE version IS NULL;
UPDATE activities SET version = 1 WHERE version IS NULL;
UPDATE expenses SET version = 1 WHERE version IS NULL;
UPDATE wallets SET version = 1 WHERE version IS NULL;
UPDATE funding_lots SET version = 1 WHERE version IS NULL;
