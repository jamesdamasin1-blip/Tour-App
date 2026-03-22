-- Migration 008: join_trip RPC for QR/code join flow
-- Allows an authenticated user to add themselves as a member of a trip
-- Uses SECURITY DEFINER to bypass RLS (the invitee isn't a member yet)

CREATE OR REPLACE FUNCTION join_trip(
    p_trip_id TEXT,
    p_member_name TEXT,
    p_member_color TEXT,
    p_member_role TEXT DEFAULT 'editor'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trip    trips%ROWTYPE;
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
    SELECT * INTO v_trip FROM trips WHERE id = p_trip_id AND deleted_at IS NULL;
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
    UPDATE trips SET
        members       = v_members,
        last_modified = (extract(epoch from now()) * 1000)::BIGINT
    WHERE id = p_trip_id;

    RETURN jsonb_build_object(
        'success', true,
        'member',  v_new_member,
        'members', v_members
    );
END;
$$;
