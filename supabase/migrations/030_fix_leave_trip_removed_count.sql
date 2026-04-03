CREATE OR REPLACE FUNCTION public.leave_trip(
    p_trip_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip public.trips%ROWTYPE;
    v_last_modified BIGINT := (extract(epoch from now()) * 1000)::BIGINT;
    v_members JSONB := '[]'::JSONB;
    v_removed_count INTEGER := 0;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.user_id = v_caller_id THEN
        RAISE EXCEPTION 'Trip owners cannot leave their own trip';
    END IF;

    SELECT COALESCE(
               jsonb_agg(value) FILTER (
                   WHERE value->>'userId' IS DISTINCT FROM v_caller_id::TEXT
               ),
               '[]'::JSONB
           ),
           COALESCE(
               SUM(CASE WHEN value->>'userId' = v_caller_id::TEXT THEN 1 ELSE 0 END),
               0
           )
    INTO v_members, v_removed_count
    FROM jsonb_array_elements(COALESCE(v_trip.members, '[]'::JSONB)) value;

    IF v_removed_count = 0 THEN
        RETURN jsonb_build_object('tripId', p_trip_id, 'left', false);
    END IF;

    UPDATE public.trips
    SET members = v_members,
        last_modified = v_last_modified,
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        field_updates = COALESCE(field_updates, '{}'::JSONB) || jsonb_build_object('members', v_last_modified)
    WHERE id = p_trip_id;

    RETURN jsonb_build_object('tripId', p_trip_id, 'left', true, 'lastModified', v_last_modified);
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_trip(TEXT) TO authenticated;
