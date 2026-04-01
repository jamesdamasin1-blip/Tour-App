-- Migration 026: Cloud-first member management RPCs
-- Moves creator-only member mutations behind server-side functions.

ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS removed_member_user_ids JSONB DEFAULT '[]'::JSONB;

CREATE OR REPLACE FUNCTION public.add_trip_member(
    p_trip_id TEXT,
    p_member JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip public.trips%ROWTYPE;
    v_members JSONB := '[]'::JSONB;
    v_new_member JSONB := COALESCE(p_member, '{}'::JSONB);
    v_last_modified BIGINT := COALESCE(NULLIF(v_new_member->>'addedAt', '')::BIGINT, (extract(epoch from now()) * 1000)::BIGINT);
    v_creator_member JSONB;
    v_member_email TEXT := NULLIF(v_new_member->>'email', '');
    v_member_user_id TEXT := NULLIF(v_new_member->>'userId', '');
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
    INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.user_id IS DISTINCT FROM v_caller_id THEN
        RAISE EXCEPTION 'Only the trip creator can manage members';
    END IF;

    v_members := COALESCE(v_trip.members, '[]'::JSONB);

    IF COALESCE(v_new_member->>'id', '') = '' OR COALESCE(v_new_member->>'name', '') = '' THEN
        RAISE EXCEPTION 'Member id and name are required';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_members) value
        WHERE value->>'id' = v_new_member->>'id'
           OR (
                v_member_email IS NOT NULL
                AND lower(COALESCE(value->>'email', '')) = lower(v_member_email)
           )
           OR (
                v_member_user_id IS NOT NULL
                AND value->>'userId' = v_member_user_id
           )
    ) THEN
        RAISE EXCEPTION 'Member already exists in this trip';
    END IF;

    IF jsonb_array_length(v_members) = 0 THEN
        v_creator_member := jsonb_build_object(
            'id', gen_random_uuid()::TEXT,
            'name', 'Me',
            'color', CASE
                WHEN COALESCE(v_new_member->>'color', '') = '#14b8a6' THEN '#f97316'
                ELSE '#14b8a6'
            END,
            'isCreator', TRUE,
            'userId', v_caller_id::TEXT,
            'addedAt', GREATEST(0, v_last_modified - 1)
        );
        v_members := v_members || jsonb_build_array(v_creator_member);
    END IF;

    v_new_member := jsonb_build_object(
        'id', v_new_member->>'id',
        'name', v_new_member->>'name',
        'color', COALESCE(NULLIF(v_new_member->>'color', ''), '#f97316'),
        'role', COALESCE(NULLIF(v_new_member->>'role', ''), 'editor'),
        'userId', v_member_user_id,
        'email', v_member_email,
        'addedAt', v_last_modified
    );

    v_members := v_members || jsonb_build_array(v_new_member);

    UPDATE public.trips
    SET members = v_members,
        last_modified = v_last_modified,
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        field_updates = COALESCE(field_updates, '{}'::JSONB) || jsonb_build_object('members', v_last_modified)
    WHERE id = p_trip_id;

    RETURN jsonb_build_object(
        'tripId', p_trip_id,
        'member', v_new_member,
        'members', v_members,
        'lastModified', v_last_modified
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_trip_member(
    p_trip_id TEXT,
    p_member_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip public.trips%ROWTYPE;
    v_members JSONB := '[]'::JSONB;
    v_removed_member JSONB;
    v_removed_user_id TEXT;
    v_removed_member_user_ids JSONB;
    v_last_modified BIGINT := (extract(epoch from now()) * 1000)::BIGINT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
    INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.user_id IS DISTINCT FROM v_caller_id THEN
        RAISE EXCEPTION 'Only the trip creator can manage members';
    END IF;

    v_members := COALESCE(v_trip.members, '[]'::JSONB);
    v_removed_member_user_ids := COALESCE(v_trip.removed_member_user_ids, '[]'::JSONB);

    SELECT value
    INTO v_removed_member
    FROM jsonb_array_elements(v_members) value
    WHERE value->>'id' = p_member_id
    LIMIT 1;

    IF v_removed_member IS NULL THEN
        RAISE EXCEPTION 'Member not found';
    END IF;

    IF COALESCE((v_removed_member->>'isCreator')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'Cannot remove the trip creator';
    END IF;

    v_removed_user_id := NULLIF(v_removed_member->>'userId', '');

    SELECT COALESCE(jsonb_agg(
        CASE
            WHEN value->>'id' = p_member_id THEN jsonb_set(value, '{removed}', 'true'::JSONB)
            ELSE value
        END
    ), '[]'::JSONB)
    INTO v_members
    FROM jsonb_array_elements(v_members) value;

    IF v_removed_user_id IS NOT NULL AND NOT (v_removed_member_user_ids @> to_jsonb(ARRAY[v_removed_user_id])) THEN
        v_removed_member_user_ids := v_removed_member_user_ids || to_jsonb(v_removed_user_id);
    END IF;

    UPDATE public.trips
    SET members = v_members,
        removed_member_user_ids = v_removed_member_user_ids,
        last_modified = v_last_modified,
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        field_updates = COALESCE(field_updates, '{}'::JSONB) || jsonb_build_object('members', v_last_modified)
    WHERE id = p_trip_id;

    RETURN jsonb_build_object(
        'tripId', p_trip_id,
        'members', v_members,
        'removedMemberUserIds', v_removed_member_user_ids,
        'lastModified', v_last_modified
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_trip_member_role(
    p_trip_id TEXT,
    p_member_id TEXT,
    p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip public.trips%ROWTYPE;
    v_members JSONB := '[]'::JSONB;
    v_last_modified BIGINT := (extract(epoch from now()) * 1000)::BIGINT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_role NOT IN ('editor', 'viewer') THEN
        RAISE EXCEPTION 'Invalid member role';
    END IF;

    SELECT *
    INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.user_id IS DISTINCT FROM v_caller_id THEN
        RAISE EXCEPTION 'Only the trip creator can manage members';
    END IF;

    v_members := COALESCE(v_trip.members, '[]'::JSONB);

    IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_members) value
        WHERE value->>'id' = p_member_id
    ) THEN
        RAISE EXCEPTION 'Member not found';
    END IF;

    SELECT COALESCE(jsonb_agg(
        CASE
            WHEN value->>'id' = p_member_id THEN jsonb_set(value, '{role}', to_jsonb(p_role))
            ELSE value
        END
    ), '[]'::JSONB)
    INTO v_members
    FROM jsonb_array_elements(v_members) value;

    UPDATE public.trips
    SET members = v_members,
        last_modified = v_last_modified,
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        field_updates = COALESCE(field_updates, '{}'::JSONB) || jsonb_build_object('members', v_last_modified)
    WHERE id = p_trip_id;

    RETURN jsonb_build_object(
        'tripId', p_trip_id,
        'members', v_members,
        'lastModified', v_last_modified
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_trip_member(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_trip_member(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_member_role(TEXT, TEXT, TEXT) TO authenticated;
