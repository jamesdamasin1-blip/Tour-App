-- ============================================================
-- 003_schema_alignment.sql
-- ONE-SHOT fix for every mismatch between the app's sync engine
-- and the live Supabase tables.
--
-- Run this ENTIRE block in your Supabase SQL Editor.
-- ============================================================

-- ─── TRIPS ──────────────────────────────────────────────────
-- Old columns the app no longer sends — make them nullable
ALTER TABLE trips ALTER COLUMN total_budget DROP NOT NULL;
ALTER TABLE trips ALTER COLUMN currency DROP NOT NULL;

-- Columns the app sends but the DB didn't have (idempotent)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS home_country TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS home_currency TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS wallets JSONB DEFAULT '[]'::JSONB;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS members JSONB DEFAULT '[]'::JSONB;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS total_budget_home_cached NUMERIC;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS updated_at BIGINT;

-- ─── ACTIVITIES ─────────────────────────────────────────────
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wallet_id TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_at BIGINT;

-- ─── EXPENSES ───────────────────────────────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS trip_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS wallet_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS converted_amount_home NUMERIC;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS converted_amount_trip NUMERIC;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS date BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at BIGINT;

-- ─── WALLETS (new table) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    currency TEXT,
    total_budget NUMERIC,
    spent_amount NUMERIC DEFAULT 0,
    lots JSONB DEFAULT '[]'::JSONB,
    baseline_exchange_rate NUMERIC,
    default_rate NUMERIC,
    user_id UUID,
    updated_at BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can manage their wallets"
        ON wallets FOR ALL TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── FUNDING_LOTS (new table) ──────────────────────────────
CREATE TABLE IF NOT EXISTS funding_lots (
    id TEXT PRIMARY KEY,
    wallet_id TEXT,
    trip_id TEXT,
    source_currency TEXT,
    target_currency TEXT,
    source_amount NUMERIC,
    rate NUMERIC,
    notes TEXT,
    user_id UUID,
    updated_at BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE funding_lots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can manage their funding_lots"
        ON funding_lots FOR ALL TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── TRIP_INVITES ───────────────────────────────────────────
-- trip_id must be TEXT (not UUID) because trip IDs are nanoid strings
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trip_invites' AND column_name = 'trip_id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE trip_invites ALTER COLUMN trip_id TYPE TEXT;
    END IF;
END $$;

-- ─── NOTIFY POSTGREST TO RELOAD SCHEMA CACHE ───────────────
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Recreate the accept_trip_invite RPC with correct column refs
-- ============================================================
CREATE OR REPLACE FUNCTION accept_trip_invite(
    p_invite_id UUID,
    p_member_name TEXT,
    p_member_color TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite  trip_invites%ROWTYPE;
    v_trip    trips%ROWTYPE;
    v_activities JSONB;
    v_expenses   JSONB;
    v_members    JSONB;
    v_new_member JSONB;
    v_caller_id    UUID;
    v_caller_email TEXT;
    v_already_member BOOLEAN;
BEGIN
    -- Authenticate
    v_caller_id    := auth.uid();
    v_caller_email := auth.email();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Fetch & validate invite
    SELECT * INTO v_invite FROM trip_invites WHERE id = p_invite_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invite not found';
    END IF;
    IF lower(v_invite.to_email) != lower(v_caller_email) THEN
        RAISE EXCEPTION 'This invite is not addressed to you';
    END IF;
    IF v_invite.status != 'pending' THEN
        RAISE EXCEPTION 'Invite already %', v_invite.status;
    END IF;
    IF v_invite.expires_at < now() THEN
        RAISE EXCEPTION 'This invite has expired';
    END IF;

    -- Accept
    UPDATE trip_invites SET status = 'accepted' WHERE id = p_invite_id;

    -- Fetch trip (trip_id is TEXT, trips.id is TEXT — no cast needed)
    SELECT * INTO v_trip FROM trips WHERE id = v_invite.trip_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('invite_accepted', true, 'trip', null);
    END IF;

    -- Check membership
    v_members := COALESCE(v_trip.members, '[]'::JSONB);
    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_members) AS m
        WHERE m->>'userId' = v_caller_id::TEXT
           OR lower(m->>'email') = lower(v_invite.to_email)
    ) INTO v_already_member;

    -- Add member
    IF NOT v_already_member THEN
        v_new_member := jsonb_build_object(
            'id',      gen_random_uuid(),
            'name',    COALESCE(p_member_name, split_part(v_invite.to_email, '@', 1)),
            'color',   COALESCE(p_member_color, '#6366f1'),
            'userId',  v_caller_id,
            'email',   v_invite.to_email,
            'addedAt', (extract(epoch from now()) * 1000)::BIGINT
        );
        v_members := v_members || jsonb_build_array(v_new_member);

        UPDATE trips SET
            members       = v_members,
            last_modified = (extract(epoch from now()) * 1000)::BIGINT,
            updated_at    = (extract(epoch from now()) * 1000)::BIGINT
        WHERE id = v_invite.trip_id;

        SELECT * INTO v_trip FROM trips WHERE id = v_invite.trip_id;
    END IF;

    -- Fetch activities
    SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::JSONB)
      INTO v_activities
      FROM activities a WHERE a.trip_id = v_invite.trip_id;

    -- Fetch expenses
    SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::JSONB)
      INTO v_expenses
      FROM expenses e WHERE e.trip_id = v_invite.trip_id;

    RETURN jsonb_build_object(
        'invite_accepted', true,
        'trip',       to_jsonb(v_trip),
        'activities', v_activities,
        'expenses',   v_expenses
    );
END;
$$;
