-- Migration 018: Complete Security Hardening
-- Fixes all remaining security issues identified by Supabase security scanner:
--   1. Function Search Path Mutable — pin search_path = '' on ALL functions
--   2. RLS Disabled in Public — ensure RLS is enabled and properly configured
--
-- Note: "Leaked Password Protection Disabled" must be enabled manually in the
--       Supabase dashboard under Authentication > Settings > Password Protection.

-- ═══════════════════════════════════════════════════════════════════
-- 1. FIX SEARCH PATH ON HELPER FUNCTIONS
--    Change from 'public' to '' (empty) for maximum security
-- ═══════════════════════════════════════════════════════════════════

-- 1a. is_trip_member helper
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.trips
        WHERE id = p_trip_id
        AND (
            user_id = p_user_id
            OR members @> jsonb_build_array(jsonb_build_object('userId', p_user_id::TEXT))
        )
    );
$$ LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = '';

-- 1b. is_trip_editor helper
CREATE OR REPLACE FUNCTION public.is_trip_editor(p_trip_id TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.trips
        WHERE id = p_trip_id
        AND (
            -- Trip owner is always an editor
            user_id = p_user_id
            -- Members with editor role or creator flag
            OR members @> jsonb_build_array(jsonb_build_object('userId', p_user_id::TEXT, 'role', 'editor'))
            OR members @> jsonb_build_array(jsonb_build_object('userId', p_user_id::TEXT, 'isCreator', true))
        )
    );
$$ LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = '';

-- ═══════════════════════════════════════════════════════════════════
-- 2. FIX SEARCH PATH ON RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════

-- 2a. accept_trip_invite
CREATE OR REPLACE FUNCTION public.accept_trip_invite(
    p_invite_id UUID,
    p_member_name TEXT,
    p_member_color TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_invite  public.trip_invites%ROWTYPE;
    v_trip    public.trips%ROWTYPE;
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
    SELECT * INTO v_invite FROM public.trip_invites WHERE id = p_invite_id;
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
    UPDATE public.trip_invites SET status = 'accepted' WHERE id = p_invite_id;

    -- Fetch trip
    SELECT * INTO v_trip FROM public.trips WHERE id = v_invite.trip_id;
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

    -- Add member using the role from the invite (editor or viewer)
    IF NOT v_already_member THEN
        v_new_member := jsonb_build_object(
            'id',      gen_random_uuid(),
            'name',    COALESCE(p_member_name, split_part(v_invite.to_email, '@', 1)),
            'color',   COALESCE(p_member_color, '#6366f1'),
            'role',    v_invite.role,
            'userId',  v_caller_id,
            'email',   v_invite.to_email,
            'addedAt', (extract(epoch from now()) * 1000)::BIGINT
        );
        v_members := v_members || jsonb_build_array(v_new_member);

        UPDATE public.trips SET
            members       = v_members,
            last_modified = (extract(epoch from now()) * 1000)::BIGINT,
            updated_at    = (extract(epoch from now()) * 1000)::BIGINT
        WHERE id = v_invite.trip_id;

        SELECT * INTO v_trip FROM public.trips WHERE id = v_invite.trip_id;
    END IF;

    -- Fetch activities
    SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::JSONB)
      INTO v_activities
      FROM public.activities a WHERE a.trip_id = v_invite.trip_id AND a.deleted_at IS NULL;

    -- Fetch expenses
    SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::JSONB)
      INTO v_expenses
      FROM public.expenses e WHERE e.trip_id = v_invite.trip_id AND e.deleted_at IS NULL;

    RETURN jsonb_build_object(
        'invite_accepted', true,
        'trip',       to_jsonb(v_trip),
        'activities', v_activities,
        'expenses',   v_expenses
    );
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = '';

-- 2b. join_trip
CREATE OR REPLACE FUNCTION public.join_trip(
    p_trip_id TEXT,
    p_member_name TEXT,
    p_member_color TEXT,
    p_member_role TEXT DEFAULT 'editor'
)
RETURNS JSONB AS $$
DECLARE
    v_trip    public.trips%ROWTYPE;
    v_members JSONB;
    v_new_member JSONB;
    v_caller_id UUID;
    v_caller_email TEXT;
    v_already_member BOOLEAN;
BEGIN
    -- Authenticate
    v_caller_id    := auth.uid();
    v_caller_email := auth.email();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Fetch trip
    SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trip not found');
    END IF;

    -- Check if already a member
    v_members := COALESCE(v_trip.members, '[]'::JSONB);
    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_members) AS m
        WHERE m->>'userId' = v_caller_id::TEXT
    ) INTO v_already_member;

    IF v_already_member THEN
        RETURN jsonb_build_object('success', true, 'already_member', true);
    END IF;

    -- Build new member object
    v_new_member := jsonb_build_object(
        'id',      gen_random_uuid(),
        'name',    COALESCE(p_member_name, split_part(v_caller_email, '@', 1)),
        'color',   COALESCE(p_member_color, '#6366f1'),
        'role',    COALESCE(p_member_role, 'editor'),
        'userId',  v_caller_id,
        'email',   v_caller_email,
        'addedAt', (extract(epoch from now()) * 1000)::BIGINT
    );
    v_members := v_members || jsonb_build_array(v_new_member);

    -- Update trip members (trigger will auto-increment version)
    UPDATE public.trips SET
        members       = v_members,
        last_modified = (extract(epoch from now()) * 1000)::BIGINT
    WHERE id = p_trip_id;

    RETURN jsonb_build_object(
        'success', true,
        'member',  v_new_member,
        'members', v_members
    );
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = '';

-- ═══════════════════════════════════════════════════════════════════
-- 3. ENSURE RLS IS ENABLED ON ALL PUBLIC TABLES
--    (Defensive - should already be enabled from migration 007 & 017)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_invites ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- 4. GRANT PROPER PERMISSIONS
--    Ensure authenticated users can execute the functions
-- ═══════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.is_trip_member(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_editor(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_trip_invite(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_trip(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_record(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_trip(TEXT, UUID) TO authenticated;
