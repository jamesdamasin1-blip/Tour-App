-- Migration 028: Fix trip bundle RPC countries casting
-- Trips store countries as text[] but the bundle RPCs receive JSON arrays.
-- Cast them explicitly so create/update works for cloud-first trip writes.

CREATE OR REPLACE FUNCTION public.jsonb_text_array(
    p_value JSONB
)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF jsonb_typeof(p_value) = 'array' THEN
        RETURN ARRAY(
            SELECT jsonb_array_elements_text(p_value)
        );
    END IF;

    RETURN ARRAY[]::TEXT[];
END;
$$;

CREATE OR REPLACE FUNCTION public.create_trip_bundle(
    p_trip JSONB,
    p_wallets JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip_id TEXT := COALESCE(p_trip->>'id', '');
    v_last_modified BIGINT := COALESCE(NULLIF(p_trip->>'lastModified', '')::BIGINT, (extract(epoch from now()) * 1000)::BIGINT);
    v_wallet_source JSONB := COALESCE(p_wallets, '[]'::JSONB);
    v_wallet JSONB;
    v_wallets_mirror JSONB;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF v_trip_id = '' THEN
        RAISE EXCEPTION 'Trip id is required';
    END IF;

    IF jsonb_typeof(v_wallet_source) IS DISTINCT FROM 'array' OR jsonb_array_length(v_wallet_source) = 0 THEN
        RAISE EXCEPTION 'Trip must include at least one wallet';
    END IF;

    INSERT INTO public.trips (
        id,
        title,
        destination,
        start_date,
        end_date,
        home_country,
        home_currency,
        wallets,
        total_budget_home_cached,
        countries,
        members,
        is_completed,
        last_modified,
        field_updates,
        user_id,
        updated_at,
        updated_by,
        last_device_id
    )
    VALUES (
        v_trip_id,
        p_trip->>'title',
        NULLIF(p_trip->>'destination', ''),
        NULLIF(p_trip->>'startDate', '')::BIGINT,
        NULLIF(p_trip->>'endDate', '')::BIGINT,
        p_trip->>'homeCountry',
        p_trip->>'homeCurrency',
        v_wallet_source,
        COALESCE(NULLIF(p_trip->>'totalBudgetHomeCached', '')::NUMERIC, 0),
        public.jsonb_text_array(p_trip->'countries'),
        CASE
            WHEN jsonb_typeof(p_trip->'members') = 'array' THEN p_trip->'members'
            ELSE '[]'::JSONB
        END,
        COALESCE(NULLIF(p_trip->>'isCompleted', '')::BOOLEAN, FALSE),
        v_last_modified,
        COALESCE(p_trip->'fieldUpdates', '{}'::JSONB),
        v_caller_id,
        v_last_modified,
        v_caller_id,
        NULLIF(p_trip->>'lastDeviceId', '')
    );

    FOR v_wallet IN
        SELECT value
        FROM jsonb_array_elements(v_wallet_source)
    LOOP
        INSERT INTO public.wallets (
            id,
            trip_id,
            currency,
            total_budget,
            spent_amount,
            lots,
            baseline_exchange_rate,
            default_rate,
            user_id,
            updated_at,
            updated_by,
            field_updates,
            last_device_id,
            deleted_at
        )
        VALUES (
            v_wallet->>'id',
            v_trip_id,
            v_wallet->>'currency',
            COALESCE(NULLIF(v_wallet->>'totalBudget', '')::NUMERIC, 0),
            COALESCE(NULLIF(v_wallet->>'spentAmount', '')::NUMERIC, 0),
            COALESCE(v_wallet->'lots', '[]'::JSONB),
            NULLIF(v_wallet->>'baselineExchangeRate', '')::NUMERIC,
            COALESCE(NULLIF(v_wallet->>'defaultRate', '')::NUMERIC, 1),
            v_caller_id,
            v_last_modified,
            v_caller_id,
            COALESCE(v_wallet->'fieldUpdates', '{}'::JSONB),
            NULLIF(v_wallet->>'lastDeviceId', ''),
            NULL
        );
    END LOOP;

    v_wallets_mirror := public.build_trip_wallet_mirror(v_trip_id, v_wallet_source, v_last_modified);

    UPDATE public.trips
    SET wallets = v_wallets_mirror
    WHERE id = v_trip_id;

    RETURN jsonb_build_object(
        'tripId', v_trip_id,
        'wallets', v_wallets_mirror
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_trip_bundle(
    p_trip_id TEXT,
    p_trip JSONB,
    p_wallets JSONB DEFAULT NULL,
    p_removed_wallet_ids JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip public.trips%ROWTYPE;
    v_last_modified BIGINT := COALESCE(NULLIF(p_trip->>'lastModified', '')::BIGINT, (extract(epoch from now()) * 1000)::BIGINT);
    v_wallet_source JSONB := COALESCE(p_wallets, p_trip->'wallets', '[]'::JSONB);
    v_removed_wallet_ids JSONB := COALESCE(p_removed_wallet_ids, '[]'::JSONB);
    v_wallet JSONB;
    v_wallets_mirror JSONB;
    v_blocked_wallet TEXT;
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

    IF NOT public.is_trip_editor(p_trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'You do not have permission to update this trip';
    END IF;

    IF jsonb_typeof(v_wallet_source) IS DISTINCT FROM 'array' OR jsonb_array_length(v_wallet_source) = 0 THEN
        RAISE EXCEPTION 'Trip must include at least one wallet';
    END IF;

    IF jsonb_typeof(v_removed_wallet_ids) IS DISTINCT FROM 'array' THEN
        v_removed_wallet_ids := '[]'::JSONB;
    END IF;

    IF jsonb_array_length(v_removed_wallet_ids) > 0 THEN
        SELECT e.wallet_id
        INTO v_blocked_wallet
        FROM public.expenses e
        JOIN jsonb_array_elements_text(v_removed_wallet_ids) removed(wallet_id)
          ON removed.wallet_id = e.wallet_id
        WHERE e.trip_id = p_trip_id
          AND e.deleted_at IS NULL
        LIMIT 1;

        IF v_blocked_wallet IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot remove a wallet that already has expenses';
        END IF;
    END IF;

    FOR v_wallet IN
        SELECT value
        FROM jsonb_array_elements(v_wallet_source)
    LOOP
        INSERT INTO public.wallets (
            id,
            trip_id,
            currency,
            total_budget,
            spent_amount,
            lots,
            baseline_exchange_rate,
            default_rate,
            user_id,
            updated_at,
            updated_by,
            field_updates,
            last_device_id,
            deleted_at
        )
        VALUES (
            v_wallet->>'id',
            p_trip_id,
            v_wallet->>'currency',
            COALESCE(NULLIF(v_wallet->>'totalBudget', '')::NUMERIC, 0),
            COALESCE(NULLIF(v_wallet->>'spentAmount', '')::NUMERIC, 0),
            COALESCE(v_wallet->'lots', '[]'::JSONB),
            NULLIF(v_wallet->>'baselineExchangeRate', '')::NUMERIC,
            COALESCE(NULLIF(v_wallet->>'defaultRate', '')::NUMERIC, 1),
            v_trip.user_id,
            v_last_modified,
            v_caller_id,
            COALESCE(v_wallet->'fieldUpdates', '{}'::JSONB),
            NULLIF(v_wallet->>'lastDeviceId', ''),
            NULL
        )
        ON CONFLICT (id) DO UPDATE
        SET trip_id = EXCLUDED.trip_id,
            currency = EXCLUDED.currency,
            total_budget = EXCLUDED.total_budget,
            spent_amount = EXCLUDED.spent_amount,
            lots = EXCLUDED.lots,
            baseline_exchange_rate = EXCLUDED.baseline_exchange_rate,
            default_rate = EXCLUDED.default_rate,
            user_id = COALESCE(public.wallets.user_id, EXCLUDED.user_id),
            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by,
            field_updates = EXCLUDED.field_updates,
            last_device_id = EXCLUDED.last_device_id,
            deleted_at = NULL;
    END LOOP;

    IF jsonb_array_length(v_removed_wallet_ids) > 0 THEN
        UPDATE public.wallets
        SET deleted_at = now(),
            updated_at = v_last_modified,
            updated_by = v_caller_id
        WHERE trip_id = p_trip_id
          AND deleted_at IS NULL
          AND id IN (
              SELECT value
              FROM jsonb_array_elements_text(v_removed_wallet_ids)
          );
    END IF;

    v_wallets_mirror := public.build_trip_wallet_mirror(p_trip_id, v_wallet_source, v_last_modified);

    UPDATE public.trips
    SET title = COALESCE(p_trip->>'title', v_trip.title),
        destination = CASE
            WHEN p_trip ? 'destination' THEN NULLIF(p_trip->>'destination', '')
            ELSE v_trip.destination
        END,
        start_date = COALESCE(NULLIF(p_trip->>'startDate', '')::BIGINT, v_trip.start_date),
        end_date = COALESCE(NULLIF(p_trip->>'endDate', '')::BIGINT, v_trip.end_date),
        home_country = COALESCE(p_trip->>'homeCountry', v_trip.home_country),
        home_currency = COALESCE(p_trip->>'homeCurrency', v_trip.home_currency),
        wallets = v_wallets_mirror,
        total_budget_home_cached = COALESCE(NULLIF(p_trip->>'totalBudgetHomeCached', '')::NUMERIC, v_trip.total_budget_home_cached),
        countries = CASE
            WHEN p_trip ? 'countries' THEN public.jsonb_text_array(p_trip->'countries')
            ELSE COALESCE(v_trip.countries, ARRAY[]::TEXT[])
        END,
        members = CASE
            WHEN p_trip ? 'members' AND jsonb_typeof(p_trip->'members') = 'array' THEN p_trip->'members'
            ELSE COALESCE(v_trip.members, '[]'::JSONB)
        END,
        is_completed = COALESCE(NULLIF(p_trip->>'isCompleted', '')::BOOLEAN, v_trip.is_completed),
        last_modified = v_last_modified,
        field_updates = COALESCE(p_trip->'fieldUpdates', v_trip.field_updates, '{}'::JSONB),
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        last_device_id = COALESCE(NULLIF(p_trip->>'lastDeviceId', ''), v_trip.last_device_id)
    WHERE id = p_trip_id;

    RETURN jsonb_build_object(
        'tripId', p_trip_id,
        'wallets', v_wallets_mirror
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.jsonb_text_array(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip_bundle(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_bundle(TEXT, JSONB, JSONB, JSONB) TO authenticated;
