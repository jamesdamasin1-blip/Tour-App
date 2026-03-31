-- Fix: Migration 016 wallet policy only checked members array,
-- excluding the trip OWNER (stored in trips.user_id).
-- This caused members to lose their realtime connection when the owner
-- modified wallet-related data, because Supabase interpreted the RLS
-- denial as a session invalidation → SIGNED_OUT event.

-- Drop the broken policy from migration 016
DROP POLICY IF EXISTS "Members can manage wallets" ON wallets;

-- Also drop any leftover policies from 007 that may conflict
DROP POLICY IF EXISTS "wallets_select" ON wallets;
DROP POLICY IF EXISTS "wallets_insert" ON wallets;
DROP POLICY IF EXISTS "wallets_update" ON wallets;
DROP POLICY IF EXISTS "wallets_delete" ON wallets;

-- Recreate using is_trip_member() which checks BOTH owner and members
CREATE POLICY "wallets_select" ON wallets
    FOR SELECT USING (
        is_trip_member(trip_id, auth.uid())
    );

CREATE POLICY "wallets_insert" ON wallets
    FOR INSERT WITH CHECK (
        is_trip_editor(trip_id, auth.uid())
    );

CREATE POLICY "wallets_update" ON wallets
    FOR UPDATE USING (
        is_trip_editor(trip_id, auth.uid())
    );

CREATE POLICY "wallets_delete" ON wallets
    FOR DELETE USING (
        is_trip_editor(trip_id, auth.uid())
    );

NOTIFY pgrst, 'reload schema';
