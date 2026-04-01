-- Migration 027: Single-RPC trip bundle fetch for faster cloud-first hydration
-- Lets the client refresh one trip in a single database round-trip instead of
-- issuing separate queries for trip, wallets, activities, expenses, and funding lots.

CREATE OR REPLACE FUNCTION public.get_trip_cloud_bundle(
    p_trip_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip JSONB;
    v_wallets JSONB;
    v_activities JSONB;
    v_expenses JSONB;
    v_funding_lots JSONB;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_trip_id IS NULL OR p_trip_id = '' THEN
        RAISE EXCEPTION 'Trip id is required';
    END IF;

    IF NOT public.is_trip_member(p_trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to access this trip';
    END IF;

    SELECT to_jsonb(t.*)
    INTO v_trip
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND t.deleted_at IS NULL;

    IF v_trip IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(w.*) ORDER BY w.updated_at DESC, w.id), '[]'::JSONB)
    INTO v_wallets
    FROM public.wallets w
    WHERE w.trip_id = p_trip_id
      AND w.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.date, a.time, a.id), '[]'::JSONB)
    INTO v_activities
    FROM public.activities a
    WHERE a.trip_id = p_trip_id
      AND a.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(to_jsonb(e.*) ORDER BY e.time, e.id), '[]'::JSONB)
    INTO v_expenses
    FROM public.expenses e
    WHERE e.trip_id = p_trip_id
      AND e.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at, f.id), '[]'::JSONB)
    INTO v_funding_lots
    FROM public.funding_lots f
    WHERE f.trip_id = p_trip_id
      AND f.deleted_at IS NULL;

    RETURN jsonb_build_object(
        'trip', v_trip,
        'wallets', v_wallets,
        'activities', v_activities,
        'expenses', v_expenses,
        'fundingLots', v_funding_lots
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trip_cloud_bundle(TEXT) TO authenticated;
