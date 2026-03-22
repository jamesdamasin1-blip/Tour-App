-- Migration 007: Role-based Row Level Security
-- Enforces: only trip members can read, only editors/creators can write
-- Hard DELETE is disallowed via RLS — only soft delete (UPDATE deleted_at) is allowed

-- ═══════════════════════════════════════════════════════════════════
-- 1. HELPER FUNCTION: Check if user is a member of a trip
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_trip_member(p_trip_id TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM trips
        WHERE id = p_trip_id
        AND (
            user_id = p_user_id
            OR members @> jsonb_build_array(jsonb_build_object('userId', p_user_id::TEXT))
        )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════
-- 2. HELPER FUNCTION: Check if user is an editor/creator of a trip
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_trip_editor(p_trip_id TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM trips
        WHERE id = p_trip_id
        AND (
            -- Trip owner is always an editor
            user_id = p_user_id
            -- Members with editor role or creator flag
            OR members @> jsonb_build_array(jsonb_build_object('userId', p_user_id::TEXT, 'role', 'editor'))
            OR members @> jsonb_build_array(jsonb_build_object('userId', p_user_id::TEXT, 'isCreator', true))
        )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════
-- 3. ENABLE RLS ON ALL SHARED TABLES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_lots ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- 4. TRIPS POLICIES
-- ═══════════════════════════════════════════════════════════════════

-- Drop any existing policies first
DROP POLICY IF EXISTS "trips_select" ON trips;
DROP POLICY IF EXISTS "trips_insert" ON trips;
DROP POLICY IF EXISTS "trips_update" ON trips;
DROP POLICY IF EXISTS "trips_delete" ON trips;

-- SELECT: user must be owner or member
CREATE POLICY "trips_select" ON trips
    FOR SELECT USING (
        user_id = auth.uid()
        OR members @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::TEXT))
    );

-- INSERT: any authenticated user can create a trip
CREATE POLICY "trips_insert" ON trips
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
    );

-- UPDATE: must be owner or editor member (soft delete goes through here)
CREATE POLICY "trips_update" ON trips
    FOR UPDATE USING (
        is_trip_editor(id, auth.uid())
    );

-- DELETE: FORBIDDEN (soft delete only via UPDATE)
-- No DELETE policy = all deletes blocked by RLS

-- ═══════════════════════════════════════════════════════════════════
-- 5. ACTIVITIES POLICIES
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "activities_select" ON activities;
DROP POLICY IF EXISTS "activities_insert" ON activities;
DROP POLICY IF EXISTS "activities_update" ON activities;
DROP POLICY IF EXISTS "activities_delete" ON activities;

-- SELECT: user must be member of the parent trip
CREATE POLICY "activities_select" ON activities
    FOR SELECT USING (
        is_trip_member(trip_id, auth.uid())
    );

-- INSERT: user must be editor of the parent trip
CREATE POLICY "activities_insert" ON activities
    FOR INSERT WITH CHECK (
        is_trip_editor(trip_id, auth.uid())
    );

-- UPDATE: user must be editor (soft delete goes through here)
CREATE POLICY "activities_update" ON activities
    FOR UPDATE USING (
        is_trip_editor(trip_id, auth.uid())
    );

-- DELETE: FORBIDDEN

-- ═══════════════════════════════════════════════════════════════════
-- 6. EXPENSES POLICIES
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;
DROP POLICY IF EXISTS "expenses_delete" ON expenses;

-- SELECT: user must be member of the parent trip
CREATE POLICY "expenses_select" ON expenses
    FOR SELECT USING (
        is_trip_member(trip_id, auth.uid())
    );

-- INSERT: user must be editor of the parent trip
CREATE POLICY "expenses_insert" ON expenses
    FOR INSERT WITH CHECK (
        is_trip_editor(trip_id, auth.uid())
    );

-- UPDATE: user must be editor (soft delete goes through here)
CREATE POLICY "expenses_update" ON expenses
    FOR UPDATE USING (
        is_trip_editor(trip_id, auth.uid())
    );

-- DELETE: FORBIDDEN

-- ═══════════════════════════════════════════════════════════════════
-- 7. WALLETS POLICIES
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "wallets_select" ON wallets;
DROP POLICY IF EXISTS "wallets_insert" ON wallets;
DROP POLICY IF EXISTS "wallets_update" ON wallets;
DROP POLICY IF EXISTS "wallets_delete" ON wallets;
DROP POLICY IF EXISTS "Users can manage their wallets" ON wallets;

-- SELECT: user must be member of the parent trip
CREATE POLICY "wallets_select" ON wallets
    FOR SELECT USING (
        is_trip_member(trip_id, auth.uid())
    );

-- INSERT: user must be editor of the parent trip
CREATE POLICY "wallets_insert" ON wallets
    FOR INSERT WITH CHECK (
        is_trip_editor(trip_id, auth.uid())
    );

-- UPDATE: user must be editor
CREATE POLICY "wallets_update" ON wallets
    FOR UPDATE USING (
        is_trip_editor(trip_id, auth.uid())
    );

-- DELETE: FORBIDDEN

-- ═══════════════════════════════════════════════════════════════════
-- 8. FUNDING_LOTS POLICIES
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "funding_lots_select" ON funding_lots;
DROP POLICY IF EXISTS "funding_lots_insert" ON funding_lots;
DROP POLICY IF EXISTS "funding_lots_update" ON funding_lots;
DROP POLICY IF EXISTS "funding_lots_delete" ON funding_lots;
DROP POLICY IF EXISTS "Users can manage their funding_lots" ON funding_lots;

-- SELECT: user must be member of the parent trip
CREATE POLICY "funding_lots_select" ON funding_lots
    FOR SELECT USING (
        is_trip_member(trip_id, auth.uid())
    );

-- INSERT: user must be editor of the parent trip
CREATE POLICY "funding_lots_insert" ON funding_lots
    FOR INSERT WITH CHECK (
        is_trip_editor(trip_id, auth.uid())
    );

-- UPDATE: user must be editor
CREATE POLICY "funding_lots_update" ON funding_lots
    FOR UPDATE USING (
        is_trip_editor(trip_id, auth.uid())
    );

-- DELETE: FORBIDDEN
