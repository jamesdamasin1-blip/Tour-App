-- Migration 009: Fix accept_trip_invite RPC to include 'role' in member object
-- Without 'role': 'editor', the is_trip_editor RLS check fails and invited
-- members cannot insert/update activities or expenses.

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

    -- Fetch trip
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

    -- Add member (now includes 'role' for RLS is_trip_editor check)
    IF NOT v_already_member THEN
        v_new_member := jsonb_build_object(
            'id',      gen_random_uuid(),
            'name',    COALESCE(p_member_name, split_part(v_invite.to_email, '@', 1)),
            'color',   COALESCE(p_member_color, '#6366f1'),
            'role',    'editor',
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
      FROM activities a WHERE a.trip_id = v_invite.trip_id AND a.deleted_at IS NULL;

    -- Fetch expenses
    SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::JSONB)
      INTO v_expenses
      FROM expenses e WHERE e.trip_id = v_invite.trip_id AND e.deleted_at IS NULL;

    RETURN jsonb_build_object(
        'invite_accepted', true,
        'trip',       to_jsonb(v_trip),
        'activities', v_activities,
        'expenses',   v_expenses
    );
END;
$$;
