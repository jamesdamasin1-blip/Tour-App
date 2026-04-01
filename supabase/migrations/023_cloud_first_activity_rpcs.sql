-- Migration 023: Cloud-first transactional activity RPCs
-- Moves risky shared activity mutations behind server-side transactions so
-- wallet lots, expenses, and trip wallet mirrors stay consistent.

CREATE OR REPLACE FUNCTION public.apply_wallet_fifo_json(
    p_lots JSONB,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lots JSONB := COALESCE(p_lots, '[]'::JSONB);
    v_result JSONB := '[]'::JSONB;
    v_breakdown JSONB := '[]'::JSONB;
    v_lot JSONB;
    v_remaining NUMERIC := COALESCE(p_amount, 0);
    v_lot_remaining NUMERIC;
    v_deduct NUMERIC;
BEGIN
    IF jsonb_typeof(v_lots) IS DISTINCT FROM 'array' THEN
        v_lots := '[]'::JSONB;
    END IF;

    IF v_remaining <= 0 THEN
        RAISE EXCEPTION 'FIFO requires a positive expense amount (got %)', v_remaining;
    END IF;

    FOR v_lot IN
        SELECT value
        FROM jsonb_array_elements(v_lots)
        ORDER BY COALESCE(NULLIF(value->>'createdAt', '')::BIGINT, 0), value->>'id'
    LOOP
        v_lot_remaining := COALESCE(NULLIF(v_lot->>'remainingAmount', '')::NUMERIC, 0);

        IF v_remaining > 0 AND v_lot_remaining > 0 THEN
            v_deduct := LEAST(v_lot_remaining, v_remaining);
            v_remaining := ROUND((v_remaining - v_deduct)::NUMERIC, 4);

            v_breakdown := v_breakdown || jsonb_build_array(
                jsonb_build_object('lotId', v_lot->>'id', 'amount', v_deduct)
            );
            v_lot := jsonb_set(
                v_lot,
                '{remainingAmount}',
                to_jsonb(ROUND((v_lot_remaining - v_deduct)::NUMERIC, 4))
            );
        END IF;

        v_result := v_result || jsonb_build_array(v_lot);
    END LOOP;

    IF v_remaining > 0.01 THEN
        RAISE EXCEPTION 'Insufficient wallet funds. Missing: %', ROUND(v_remaining::NUMERIC, 2);
    END IF;

    RETURN jsonb_build_object(
        'lots', v_result,
        'breakdown', v_breakdown
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_wallet_lots_json(
    p_lots JSONB,
    p_lot_breakdown JSONB,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_restored JSONB := COALESCE(p_lots, '[]'::JSONB);
    v_breakdown JSONB := COALESCE(p_lot_breakdown, '[]'::JSONB);
    v_len INTEGER;
    v_i INTEGER;
    v_lot JSONB;
    v_restore NUMERIC;
    v_remaining_from_breakdown NUMERIC := 0;
    v_remaining NUMERIC := 0;
    v_original NUMERIC;
    v_remaining_amount NUMERIC;
    v_spent NUMERIC;
    v_add NUMERIC;
BEGIN
    IF jsonb_typeof(v_restored) IS DISTINCT FROM 'array' THEN
        RETURN '[]'::JSONB;
    END IF;

    v_len := jsonb_array_length(v_restored);
    IF v_len = 0 THEN
        RETURN v_restored;
    END IF;

    IF jsonb_typeof(v_breakdown) = 'array' AND jsonb_array_length(v_breakdown) > 0 THEN
        SELECT COALESCE(SUM(COALESCE(NULLIF(value->>'amount', '')::NUMERIC, 0)), 0)
        INTO v_remaining_from_breakdown
        FROM jsonb_array_elements(v_breakdown);

        FOR v_i IN 0..v_len - 1 LOOP
            v_lot := v_restored -> v_i;

            SELECT COALESCE(SUM(COALESCE(NULLIF(value->>'amount', '')::NUMERIC, 0)), 0)
            INTO v_restore
            FROM jsonb_array_elements(v_breakdown)
            WHERE value->>'lotId' = v_lot->>'id';

            IF v_restore > 0 THEN
                v_remaining_amount := COALESCE(NULLIF(v_lot->>'remainingAmount', '')::NUMERIC, 0);
                v_restored := jsonb_set(
                    v_restored,
                    ARRAY[v_i::TEXT],
                    jsonb_set(
                        v_lot,
                        '{remainingAmount}',
                        to_jsonb(ROUND((v_remaining_amount + v_restore)::NUMERIC, 4))
                    )
                );
                v_remaining_from_breakdown := ROUND((v_remaining_from_breakdown - v_restore)::NUMERIC, 4);
            END IF;
        END LOOP;

        IF v_remaining_from_breakdown <= 0 THEN
            RETURN v_restored;
        END IF;

        v_remaining := v_remaining_from_breakdown;
    ELSE
        v_remaining := COALESCE(p_amount, 0);
    END IF;

    IF v_remaining <= 0 THEN
        RETURN v_restored;
    END IF;

    FOR v_i IN REVERSE v_len - 1..0 LOOP
        v_lot := v_restored -> v_i;
        v_original := COALESCE(NULLIF(v_lot->>'originalConvertedAmount', '')::NUMERIC, 0);
        v_remaining_amount := COALESCE(NULLIF(v_lot->>'remainingAmount', '')::NUMERIC, 0);
        v_spent := GREATEST(0, v_original - v_remaining_amount);

        IF v_spent <= 0 THEN
            CONTINUE;
        END IF;

        v_add := LEAST(v_remaining, v_spent);
        v_restored := jsonb_set(
            v_restored,
            ARRAY[v_i::TEXT],
            jsonb_set(
                v_lot,
                '{remainingAmount}',
                to_jsonb(ROUND((v_remaining_amount + v_add)::NUMERIC, 4))
            )
        );
        v_remaining := ROUND((v_remaining - v_add)::NUMERIC, 4);

        EXIT WHEN v_remaining <= 0;
    END LOOP;

    RETURN v_restored;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_trip_wallet_mirror(
    p_trip_id TEXT,
    p_last_modified BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_trip public.trips%ROWTYPE;
    v_wallets_mirror JSONB;
BEGIN
    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', w.id,
                'tripId', w.trip_id,
                'country', COALESCE(existing_wallet.value->>'country', ''),
                'currency', w.currency,
                'totalBudget', COALESCE(w.total_budget, 0),
                'spentAmount', COALESCE(w.spent_amount, 0),
                'defaultRate', COALESCE(w.default_rate, 1),
                'baselineExchangeRate', w.baseline_exchange_rate,
                'lots', COALESCE(w.lots, '[]'::JSONB),
                'createdAt', COALESCE(NULLIF(existing_wallet.value->>'createdAt', '')::BIGINT, p_last_modified),
                'version', COALESCE(w.version, 1),
                'updatedBy', w.updated_by,
                'deletedAt', w.deleted_at,
                'fieldUpdates', COALESCE(w.field_updates, '{}'::JSONB),
                'lastDeviceId', w.last_device_id,
                'lastModified', COALESCE(w.updated_at, p_last_modified)
            )
            ORDER BY COALESCE(NULLIF(existing_wallet.value->>'createdAt', '')::BIGINT, p_last_modified), w.id
        ),
        '[]'::JSONB
    )
    INTO v_wallets_mirror
    FROM public.wallets w
    LEFT JOIN LATERAL (
        SELECT value
        FROM jsonb_array_elements(COALESCE(v_trip.wallets, '[]'::JSONB)) value
        WHERE value->>'id' = w.id
        LIMIT 1
    ) existing_wallet ON TRUE
    WHERE w.trip_id = p_trip_id
      AND w.deleted_at IS NULL;

    UPDATE public.trips
    SET wallets = v_wallets_mirror,
        last_modified = p_last_modified,
        updated_at = p_last_modified,
        updated_by = auth.uid(),
        field_updates = COALESCE(field_updates, '{}'::JSONB) || jsonb_build_object('wallets', p_last_modified)
    WHERE id = p_trip_id;

    RETURN v_wallets_mirror;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_activity_bundle(
    p_activity JSONB,
    p_expenses JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_activity_id TEXT := COALESCE(p_activity->>'id', '');
    v_existing_activity public.activities%ROWTYPE;
    v_trip_id TEXT;
    v_last_modified BIGINT := COALESCE(NULLIF(p_activity->>'lastModified', '')::BIGINT, (extract(epoch from now()) * 1000)::BIGINT);
    v_existing_expense public.expenses%ROWTYPE;
    v_wallet_row public.wallets%ROWTYPE;
    v_expense JSONB;
    v_fifo JSONB;
    v_wallet_id TEXT;
    v_expense_id TEXT;
    v_amount_trip NUMERIC;
    v_countries TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF v_activity_id = '' THEN
        RAISE EXCEPTION 'Activity id is required';
    END IF;

    SELECT * INTO v_existing_activity
    FROM public.activities
    WHERE id = v_activity_id
      AND deleted_at IS NULL;

    v_trip_id := COALESCE(v_existing_activity.trip_id, p_activity->>'tripId');
    IF v_trip_id IS NULL OR v_trip_id = '' THEN
        RAISE EXCEPTION 'Trip id is required';
    END IF;

    IF jsonb_typeof(COALESCE(p_activity->'countries', '[]'::JSONB)) = 'array' THEN
        SELECT COALESCE(array_agg(value), ARRAY[]::TEXT[])
        INTO v_countries
        FROM jsonb_array_elements_text(COALESCE(p_activity->'countries', '[]'::JSONB)) AS value;
    END IF;

    IF NOT public.is_trip_editor(v_trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    PERFORM 1
    FROM public.trips
    WHERE id = v_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF p_expenses IS NULL
       AND v_existing_activity.id IS NOT NULL
       AND COALESCE(v_existing_activity.wallet_id, '') IS DISTINCT FROM COALESCE(p_activity->>'walletId', v_existing_activity.wallet_id, '') THEN
        IF EXISTS (
            SELECT 1
            FROM public.expenses
            WHERE activity_id = v_activity_id
              AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'Cannot change activity wallet without reconciling its expenses';
        END IF;
    END IF;

    IF p_expenses IS NOT NULL THEN
        FOR v_existing_expense IN
            SELECT *
            FROM public.expenses
            WHERE activity_id = v_activity_id
              AND deleted_at IS NULL
            ORDER BY COALESCE(updated_at, time, date, 0) DESC, id DESC
        LOOP
            SELECT * INTO v_wallet_row
            FROM public.wallets
            WHERE id = v_existing_expense.wallet_id
              AND deleted_at IS NULL
            FOR UPDATE;

            IF FOUND THEN
                UPDATE public.wallets
                SET lots = public.restore_wallet_lots_json(
                        COALESCE(v_wallet_row.lots, '[]'::JSONB),
                        v_existing_expense.lot_breakdown,
                        v_existing_expense.converted_amount_trip
                    ),
                    spent_amount = GREATEST(0, COALESCE(v_wallet_row.spent_amount, 0) - COALESCE(v_existing_expense.converted_amount_trip, 0)),
                    field_updates = COALESCE(v_wallet_row.field_updates, '{}'::JSONB)
                        || jsonb_build_object('lots', v_last_modified, 'spentAmount', v_last_modified),
                    updated_at = v_last_modified,
                    updated_by = v_caller_id
                WHERE id = v_wallet_row.id;
            END IF;
        END LOOP;

        UPDATE public.expenses
        SET deleted_at = to_timestamp(v_last_modified / 1000.0),
            updated_at = v_last_modified,
            updated_by = v_caller_id
        WHERE activity_id = v_activity_id
          AND deleted_at IS NULL;
    END IF;

    INSERT INTO public.activities (
        id,
        trip_id,
        wallet_id,
        title,
        category,
        date,
        time,
        end_time,
        allocated_budget,
        budget_currency,
        is_completed,
        is_spontaneous,
        last_modified,
        description,
        location,
        countries,
        created_by,
        last_modified_by,
        field_updates,
        updated_at,
        updated_by,
        user_id,
        deleted_at
    )
    VALUES (
        v_activity_id,
        v_trip_id,
        NULLIF(p_activity->>'walletId', ''),
        COALESCE(p_activity->>'title', ''),
        COALESCE(p_activity->>'category', 'Other'),
        COALESCE(NULLIF(p_activity->>'date', '')::BIGINT, v_last_modified),
        COALESCE(NULLIF(p_activity->>'time', '')::BIGINT, v_last_modified),
        NULLIF(p_activity->>'endTime', '')::BIGINT,
        COALESCE(NULLIF(p_activity->>'allocatedBudget', '')::NUMERIC, 0),
        COALESCE(p_activity->>'budgetCurrency', 'PHP'),
        COALESCE(NULLIF(p_activity->>'isCompleted', '')::BOOLEAN, FALSE),
        COALESCE(NULLIF(p_activity->>'isSpontaneous', '')::BOOLEAN, FALSE),
        v_last_modified,
        NULLIF(p_activity->>'description', ''),
        NULLIF(p_activity->>'location', ''),
        v_countries,
        NULLIF(p_activity->>'createdBy', ''),
        NULLIF(p_activity->>'lastModifiedBy', ''),
        COALESCE(p_activity->'fieldUpdates', '{}'::JSONB),
        v_last_modified,
        v_caller_id,
        v_caller_id,
        NULL
    )
    ON CONFLICT (id) DO UPDATE
    SET trip_id = EXCLUDED.trip_id,
        wallet_id = EXCLUDED.wallet_id,
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        date = EXCLUDED.date,
        time = EXCLUDED.time,
        end_time = EXCLUDED.end_time,
        allocated_budget = EXCLUDED.allocated_budget,
        budget_currency = EXCLUDED.budget_currency,
        is_completed = EXCLUDED.is_completed,
        is_spontaneous = EXCLUDED.is_spontaneous,
        last_modified = EXCLUDED.last_modified,
        description = EXCLUDED.description,
        location = EXCLUDED.location,
        countries = EXCLUDED.countries,
        created_by = COALESCE(public.activities.created_by, EXCLUDED.created_by),
        last_modified_by = EXCLUDED.last_modified_by,
        field_updates = EXCLUDED.field_updates,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by,
        deleted_at = NULL;

    IF p_expenses IS NOT NULL THEN
        FOR v_expense IN
            SELECT value
            FROM jsonb_array_elements(COALESCE(p_expenses, '[]'::JSONB))
        LOOP
            v_wallet_id := COALESCE(NULLIF(v_expense->>'walletId', ''), NULLIF(p_activity->>'walletId', ''));
            IF v_wallet_id IS NULL OR v_wallet_id = '' THEN
                RAISE EXCEPTION 'Expense wallet id is required';
            END IF;

            SELECT * INTO v_wallet_row
            FROM public.wallets
            WHERE id = v_wallet_id
              AND deleted_at IS NULL
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Wallet % not found', v_wallet_id;
            END IF;

            v_amount_trip := COALESCE(
                NULLIF(v_expense->>'convertedAmountTrip', '')::NUMERIC,
                NULLIF(v_expense->>'amount', '')::NUMERIC,
                0
            );

            IF v_amount_trip < 0 THEN
                RAISE EXCEPTION 'Expense amount cannot be negative';
            END IF;

            IF v_amount_trip > 0 THEN
                v_fifo := public.apply_wallet_fifo_json(COALESCE(v_wallet_row.lots, '[]'::JSONB), v_amount_trip);

                UPDATE public.wallets
                SET lots = v_fifo->'lots',
                    spent_amount = COALESCE(v_wallet_row.spent_amount, 0) + v_amount_trip,
                    field_updates = COALESCE(v_wallet_row.field_updates, '{}'::JSONB)
                        || jsonb_build_object('lots', v_last_modified, 'spentAmount', v_last_modified),
                    updated_at = v_last_modified,
                    updated_by = v_caller_id
                WHERE id = v_wallet_row.id
                RETURNING * INTO v_wallet_row;
            ELSE
                v_fifo := jsonb_build_object(
                    'lots', COALESCE(v_wallet_row.lots, '[]'::JSONB),
                    'breakdown', '[]'::JSONB
                );
            END IF;

            v_expense_id := COALESCE(NULLIF(v_expense->>'id', ''), gen_random_uuid()::TEXT);

            INSERT INTO public.expenses (
                id,
                trip_id,
                activity_id,
                wallet_id,
                name,
                amount,
                currency,
                converted_amount_home,
                converted_amount_trip,
                category,
                time,
                date,
                original_amount,
                original_currency,
                created_by,
                last_modified_by,
                field_updates,
                lot_breakdown,
                updated_at,
                updated_by,
                user_id,
                deleted_at
            )
            VALUES (
                v_expense_id,
                v_trip_id,
                v_activity_id,
                v_wallet_id,
                COALESCE(v_expense->>'name', COALESCE(p_activity->>'title', 'Expense')),
                COALESCE(NULLIF(v_expense->>'amount', '')::NUMERIC, 0),
                COALESCE(v_expense->>'currency', v_wallet_row.currency),
                COALESCE(NULLIF(v_expense->>'convertedAmountHome', '')::NUMERIC, 0),
                v_amount_trip,
                COALESCE(v_expense->>'category', COALESCE(p_activity->>'category', 'Other')),
                COALESCE(NULLIF(v_expense->>'time', '')::BIGINT, v_last_modified),
                COALESCE(NULLIF(v_expense->>'date', '')::BIGINT, v_last_modified),
                NULLIF(v_expense->>'originalAmount', '')::NUMERIC,
                NULLIF(v_expense->>'originalCurrency', ''),
                NULLIF(v_expense->>'createdBy', ''),
                NULLIF(v_expense->>'lastModifiedBy', ''),
                COALESCE(v_expense->'fieldUpdates', '{}'::JSONB),
                COALESCE(v_fifo->'breakdown', '[]'::JSONB),
                v_last_modified,
                v_caller_id,
                v_caller_id,
                NULL
            )
            ON CONFLICT (id) DO UPDATE
            SET trip_id = EXCLUDED.trip_id,
                activity_id = EXCLUDED.activity_id,
                wallet_id = EXCLUDED.wallet_id,
                name = EXCLUDED.name,
                amount = EXCLUDED.amount,
                currency = EXCLUDED.currency,
                converted_amount_home = EXCLUDED.converted_amount_home,
                converted_amount_trip = EXCLUDED.converted_amount_trip,
                category = EXCLUDED.category,
                time = EXCLUDED.time,
                date = EXCLUDED.date,
                original_amount = EXCLUDED.original_amount,
                original_currency = EXCLUDED.original_currency,
                created_by = COALESCE(public.expenses.created_by, EXCLUDED.created_by),
                last_modified_by = EXCLUDED.last_modified_by,
                field_updates = EXCLUDED.field_updates,
                lot_breakdown = EXCLUDED.lot_breakdown,
                updated_at = EXCLUDED.updated_at,
                updated_by = EXCLUDED.updated_by,
                deleted_at = NULL;
        END LOOP;

        PERFORM public.sync_trip_wallet_mirror(v_trip_id, v_last_modified);
    END IF;

    RETURN jsonb_build_object(
        'activityId', v_activity_id,
        'tripId', v_trip_id,
        'lastModified', v_last_modified
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_activity_cascade(
    p_activity_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_activity public.activities%ROWTYPE;
    v_existing_expense public.expenses%ROWTYPE;
    v_wallet_row public.wallets%ROWTYPE;
    v_last_modified BIGINT := (extract(epoch from now()) * 1000)::BIGINT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_activity
    FROM public.activities
    WHERE id = p_activity_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Activity not found';
    END IF;

    IF NOT public.is_trip_editor(v_activity.trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    PERFORM 1
    FROM public.trips
    WHERE id = v_activity.trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    FOR v_existing_expense IN
        SELECT *
        FROM public.expenses
        WHERE activity_id = p_activity_id
          AND deleted_at IS NULL
        ORDER BY COALESCE(updated_at, time, date, 0) DESC, id DESC
    LOOP
        SELECT * INTO v_wallet_row
        FROM public.wallets
        WHERE id = v_existing_expense.wallet_id
          AND deleted_at IS NULL
        FOR UPDATE;

        IF FOUND THEN
            UPDATE public.wallets
            SET lots = public.restore_wallet_lots_json(
                    COALESCE(v_wallet_row.lots, '[]'::JSONB),
                    v_existing_expense.lot_breakdown,
                    v_existing_expense.converted_amount_trip
                ),
                spent_amount = GREATEST(0, COALESCE(v_wallet_row.spent_amount, 0) - COALESCE(v_existing_expense.converted_amount_trip, 0)),
                field_updates = COALESCE(v_wallet_row.field_updates, '{}'::JSONB)
                    || jsonb_build_object('lots', v_last_modified, 'spentAmount', v_last_modified),
                updated_at = v_last_modified,
                updated_by = v_caller_id
            WHERE id = v_wallet_row.id;
        END IF;
    END LOOP;

    UPDATE public.expenses
    SET deleted_at = to_timestamp(v_last_modified / 1000.0),
        updated_at = v_last_modified,
        updated_by = v_caller_id
    WHERE activity_id = p_activity_id
      AND deleted_at IS NULL;

    UPDATE public.activities
    SET deleted_at = to_timestamp(v_last_modified / 1000.0),
        last_modified = v_last_modified,
        updated_at = v_last_modified,
        updated_by = v_caller_id
    WHERE id = p_activity_id;

    PERFORM public.sync_trip_wallet_mirror(v_activity.trip_id, v_last_modified);

    RETURN jsonb_build_object(
        'activityId', p_activity_id,
        'tripId', v_activity.trip_id,
        'lastModified', v_last_modified
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_activity_completion(
    p_activity_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_activity public.activities%ROWTYPE;
    v_last_modified BIGINT := (extract(epoch from now()) * 1000)::BIGINT;
    v_next_completed BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_activity
    FROM public.activities
    WHERE id = p_activity_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Activity not found';
    END IF;

    IF NOT public.is_trip_editor(v_activity.trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    v_next_completed := NOT COALESCE(v_activity.is_completed, FALSE);

    UPDATE public.activities
    SET is_completed = v_next_completed,
        last_modified = v_last_modified,
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        field_updates = COALESCE(field_updates, '{}'::JSONB) || jsonb_build_object('isCompleted', v_last_modified)
    WHERE id = p_activity_id;

    RETURN jsonb_build_object(
        'activityId', p_activity_id,
        'tripId', v_activity.trip_id,
        'isCompleted', v_next_completed,
        'lastModified', v_last_modified
    );
END;
$$;

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

    SELECT COALESCE(jsonb_agg(value), '[]'::JSONB),
           COALESCE(SUM(CASE WHEN value->>'userId' = v_caller_id::TEXT THEN 1 ELSE 0 END), 0)
    INTO v_members, v_removed_count
    FROM jsonb_array_elements(COALESCE(v_trip.members, '[]'::JSONB)) value
    WHERE value->>'userId' IS DISTINCT FROM v_caller_id::TEXT;

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

GRANT EXECUTE ON FUNCTION public.apply_wallet_fifo_json(JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_wallet_lots_json(JSONB, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_trip_wallet_mirror(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_activity_bundle(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_activity_cascade(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_activity_completion(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_trip(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_trip_budget_from_funding(
    p_trip_id TEXT,
    p_last_modified BIGINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_trip public.trips%ROWTYPE;
    v_total NUMERIC := 0;
BEGIN
    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN fl.source_currency = COALESCE(v_trip.home_currency, 'PHP') THEN COALESCE(fl.source_amount, 0)
            ELSE COALESCE(fl.source_amount, 0)
        END
    ), 0)
    INTO v_total
    FROM public.funding_lots fl
    WHERE fl.trip_id = p_trip_id
      AND fl.deleted_at IS NULL;

    UPDATE public.trips
    SET total_budget_home_cached = v_total,
        last_modified = p_last_modified,
        updated_at = p_last_modified,
        updated_by = auth.uid(),
        field_updates = COALESCE(field_updates, '{}'::JSONB)
            || jsonb_build_object('totalBudgetHomeCached', p_last_modified)
    WHERE id = p_trip_id;

    RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.rebuild_wallet_from_funding_events(
    p_trip_id TEXT,
    p_wallet_id TEXT,
    p_last_modified BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_trip public.trips%ROWTYPE;
    v_wallet public.wallets%ROWTYPE;
    v_existing_wallet JSONB;
    v_events JSONB;
    v_event JSONB;
    v_lots JSONB := '[]'::JSONB;
    v_index INTEGER := 0;
    v_converted NUMERIC;
    v_total_budget NUMERIC := 0;
BEGIN
    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE id = p_wallet_id
      AND trip_id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    SELECT value INTO v_existing_wallet
    FROM jsonb_array_elements(COALESCE(v_trip.wallets, '[]'::JSONB)) value
    WHERE value->>'id' = p_wallet_id
    LIMIT 1;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', fl.id,
                'homeAmount', COALESCE(fl.source_amount, 0),
                'tripAmount', CASE WHEN COALESCE(fl.rate, 0) > 0 THEN COALESCE(fl.source_amount, 0) / fl.rate ELSE 0 END,
                'rate', COALESCE(fl.rate, 0),
                'date', COALESCE((extract(epoch from fl.created_at) * 1000)::BIGINT, p_last_modified),
                'notes', fl.notes
            )
            ORDER BY fl.created_at, fl.id
        ),
        '[]'::JSONB
    )
    INTO v_events
    FROM public.funding_lots fl
    WHERE fl.trip_id = p_trip_id
      AND fl.wallet_id = p_wallet_id
      AND fl.deleted_at IS NULL;

    FOR v_event IN
        SELECT value
        FROM jsonb_array_elements(v_events)
    LOOP
        v_converted := CASE
            WHEN COALESCE(NULLIF(v_event->>'tripAmount', '')::NUMERIC, 0) > 0
                THEN COALESCE(NULLIF(v_event->>'tripAmount', '')::NUMERIC, 0)
            WHEN COALESCE(NULLIF(v_event->>'rate', '')::NUMERIC, 0) > 0
                THEN COALESCE(NULLIF(v_event->>'homeAmount', '')::NUMERIC, 0) / NULLIF(v_event->>'rate', '')::NUMERIC
            ELSE 0
        END;

        v_lots := v_lots || jsonb_build_array(
            jsonb_build_object(
                'id', gen_random_uuid(),
                'walletCurrency', v_wallet.currency,
                'sourceCurrency', COALESCE(v_trip.home_currency, 'PHP'),
                'sourceAmount', COALESCE(NULLIF(v_event->>'homeAmount', '')::NUMERIC, 0),
                'originalConvertedAmount', v_converted,
                'remainingAmount', v_converted,
                'lockedRate', COALESCE(NULLIF(v_event->>'rate', '')::NUMERIC, 0),
                'rateBaseCurrency', 1,
                'createdAt', COALESCE(NULLIF(v_event->>'date', '')::BIGINT, p_last_modified),
                'isDefault', FALSE
            )
        );
        v_index := v_index + 1;
    END LOOP;

    IF jsonb_array_length(v_lots) > 0 THEN
        v_lots := jsonb_set(
            v_lots,
            ARRAY[(jsonb_array_length(v_lots) - 1)::TEXT, 'isDefault'],
            'true'::JSONB
        );
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN COALESCE(fl.rate, 0) > 0 THEN COALESCE(fl.source_amount, 0) / fl.rate
            ELSE 0
        END
    ), 0)
    INTO v_total_budget
    FROM public.funding_lots fl
    WHERE fl.trip_id = p_trip_id
      AND fl.wallet_id = p_wallet_id
      AND fl.deleted_at IS NULL;

    UPDATE public.wallets
    SET lots = v_lots,
        total_budget = v_total_budget,
        field_updates = COALESCE(field_updates, '{}'::JSONB)
            || jsonb_build_object('lots', p_last_modified, 'totalBudget', p_last_modified),
        updated_at = p_last_modified,
        updated_by = auth.uid()
    WHERE id = p_wallet_id;

    RETURN v_lots;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_expense_cloud(
    p_expense JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip_id TEXT := p_expense->>'tripId';
    v_wallet_id TEXT := p_expense->>'walletId';
    v_expense_id TEXT := COALESCE(NULLIF(p_expense->>'id', ''), gen_random_uuid()::TEXT);
    v_last_modified BIGINT := COALESCE(NULLIF(p_expense->>'lastModified', '')::BIGINT, (extract(epoch from now()) * 1000)::BIGINT);
    v_wallet public.wallets%ROWTYPE;
    v_amount_trip NUMERIC := COALESCE(NULLIF(p_expense->>'convertedAmountTrip', '')::NUMERIC, NULLIF(p_expense->>'amount', '')::NUMERIC, 0);
    v_fifo JSONB;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF v_trip_id IS NULL OR v_trip_id = '' THEN
        RAISE EXCEPTION 'Trip id is required';
    END IF;
    IF v_wallet_id IS NULL OR v_wallet_id = '' THEN
        RAISE EXCEPTION 'Wallet id is required';
    END IF;
    IF NOT public.is_trip_editor(v_trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE id = v_wallet_id
      AND trip_id = v_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    IF v_amount_trip > 0 THEN
        v_fifo := public.apply_wallet_fifo_json(COALESCE(v_wallet.lots, '[]'::JSONB), v_amount_trip);
        UPDATE public.wallets
        SET lots = v_fifo->'lots',
            spent_amount = COALESCE(v_wallet.spent_amount, 0) + v_amount_trip,
            field_updates = COALESCE(field_updates, '{}'::JSONB)
                || jsonb_build_object('lots', v_last_modified, 'spentAmount', v_last_modified),
            updated_at = v_last_modified,
            updated_by = v_caller_id
        WHERE id = v_wallet_id;
    ELSE
        v_fifo := jsonb_build_object('breakdown', '[]'::JSONB);
    END IF;

    INSERT INTO public.expenses (
        id, trip_id, activity_id, wallet_id, name, amount, currency,
        converted_amount_home, converted_amount_trip, category, time, date,
        original_amount, original_currency, created_by, last_modified_by,
        field_updates, lot_breakdown, updated_at, updated_by, user_id, deleted_at
    )
    VALUES (
        v_expense_id,
        v_trip_id,
        NULLIF(p_expense->>'activityId', ''),
        v_wallet_id,
        COALESCE(p_expense->>'name', 'Expense'),
        COALESCE(NULLIF(p_expense->>'amount', '')::NUMERIC, 0),
        COALESCE(p_expense->>'currency', v_wallet.currency),
        COALESCE(NULLIF(p_expense->>'convertedAmountHome', '')::NUMERIC, 0),
        v_amount_trip,
        COALESCE(p_expense->>'category', 'Other'),
        COALESCE(NULLIF(p_expense->>'time', '')::BIGINT, v_last_modified),
        COALESCE(NULLIF(p_expense->>'date', '')::BIGINT, v_last_modified),
        NULLIF(p_expense->>'originalAmount', '')::NUMERIC,
        NULLIF(p_expense->>'originalCurrency', ''),
        NULLIF(p_expense->>'createdBy', ''),
        NULLIF(p_expense->>'lastModifiedBy', ''),
        COALESCE(p_expense->'fieldUpdates', '{}'::JSONB),
        COALESCE(v_fifo->'breakdown', '[]'::JSONB),
        v_last_modified,
        v_caller_id,
        v_caller_id,
        NULL
    );

    PERFORM public.sync_trip_wallet_mirror(v_trip_id, v_last_modified);

    RETURN jsonb_build_object('expenseId', v_expense_id, 'tripId', v_trip_id, 'lastModified', v_last_modified);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_expense_cloud(
    p_expense_id TEXT,
    p_expense JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_existing public.expenses%ROWTYPE;
    v_old_wallet public.wallets%ROWTYPE;
    v_new_wallet public.wallets%ROWTYPE;
    v_last_modified BIGINT := COALESCE(NULLIF(p_expense->>'lastModified', '')::BIGINT, (extract(epoch from now()) * 1000)::BIGINT);
    v_new_wallet_id TEXT;
    v_new_trip_id TEXT;
    v_new_amount_trip NUMERIC;
    v_new_amount_home NUMERIC;
    v_new_currency TEXT;
    v_fifo JSONB;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_existing
    FROM public.expenses
    WHERE id = p_expense_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found';
    END IF;

    IF NOT public.is_trip_editor(v_existing.trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    v_new_trip_id := COALESCE(NULLIF(p_expense->>'tripId', ''), v_existing.trip_id);
    v_new_wallet_id := COALESCE(NULLIF(p_expense->>'walletId', ''), v_existing.wallet_id);
    v_new_amount_trip := COALESCE(NULLIF(p_expense->>'convertedAmountTrip', '')::NUMERIC, NULLIF(p_expense->>'amount', '')::NUMERIC, v_existing.converted_amount_trip, 0);
    v_new_amount_home := COALESCE(NULLIF(p_expense->>'convertedAmountHome', '')::NUMERIC, v_existing.converted_amount_home, 0);

    SELECT * INTO v_old_wallet
    FROM public.wallets
    WHERE id = v_existing.wallet_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.wallets
        SET lots = public.restore_wallet_lots_json(
                COALESCE(v_old_wallet.lots, '[]'::JSONB),
                v_existing.lot_breakdown,
                v_existing.converted_amount_trip
            ),
            spent_amount = GREATEST(0, COALESCE(v_old_wallet.spent_amount, 0) - COALESCE(v_existing.converted_amount_trip, 0)),
            field_updates = COALESCE(field_updates, '{}'::JSONB)
                || jsonb_build_object('lots', v_last_modified, 'spentAmount', v_last_modified),
            updated_at = v_last_modified,
            updated_by = v_caller_id
        WHERE id = v_old_wallet.id;
    END IF;

    SELECT * INTO v_new_wallet
    FROM public.wallets
    WHERE id = v_new_wallet_id
      AND trip_id = v_new_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    IF v_new_amount_trip > 0 THEN
        v_fifo := public.apply_wallet_fifo_json(COALESCE(v_new_wallet.lots, '[]'::JSONB), v_new_amount_trip);
        UPDATE public.wallets
        SET lots = v_fifo->'lots',
            spent_amount = COALESCE(v_new_wallet.spent_amount, 0) + v_new_amount_trip,
            field_updates = COALESCE(field_updates, '{}'::JSONB)
                || jsonb_build_object('lots', v_last_modified, 'spentAmount', v_last_modified),
            updated_at = v_last_modified,
            updated_by = v_caller_id
        WHERE id = v_new_wallet.id;
    ELSE
        v_fifo := jsonb_build_object('breakdown', '[]'::JSONB);
    END IF;

    v_new_currency := COALESCE(NULLIF(p_expense->>'currency', ''), v_existing.currency, v_new_wallet.currency);

    UPDATE public.expenses
    SET trip_id = v_new_trip_id,
        activity_id = COALESCE(NULLIF(p_expense->>'activityId', ''), v_existing.activity_id),
        wallet_id = v_new_wallet_id,
        name = COALESCE(NULLIF(p_expense->>'name', ''), v_existing.name),
        amount = COALESCE(NULLIF(p_expense->>'amount', '')::NUMERIC, v_existing.amount),
        currency = v_new_currency,
        converted_amount_home = v_new_amount_home,
        converted_amount_trip = v_new_amount_trip,
        category = COALESCE(NULLIF(p_expense->>'category', ''), v_existing.category),
        time = COALESCE(NULLIF(p_expense->>'time', '')::BIGINT, v_existing.time),
        date = COALESCE(NULLIF(p_expense->>'date', '')::BIGINT, v_existing.date),
        original_amount = COALESCE(NULLIF(p_expense->>'originalAmount', '')::NUMERIC, v_existing.original_amount),
        original_currency = COALESCE(NULLIF(p_expense->>'originalCurrency', ''), v_existing.original_currency),
        created_by = COALESCE(NULLIF(p_expense->>'createdBy', ''), v_existing.created_by),
        last_modified_by = COALESCE(NULLIF(p_expense->>'lastModifiedBy', ''), v_existing.last_modified_by),
        field_updates = COALESCE(p_expense->'fieldUpdates', v_existing.field_updates, '{}'::JSONB),
        lot_breakdown = COALESCE(v_fifo->'breakdown', '[]'::JSONB),
        updated_at = v_last_modified,
        updated_by = v_caller_id
    WHERE id = p_expense_id;

    PERFORM public.sync_trip_wallet_mirror(v_existing.trip_id, v_last_modified);
    IF v_new_trip_id IS DISTINCT FROM v_existing.trip_id THEN
        PERFORM public.sync_trip_wallet_mirror(v_new_trip_id, v_last_modified);
    END IF;

    RETURN jsonb_build_object('expenseId', p_expense_id, 'tripId', v_new_trip_id, 'lastModified', v_last_modified);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expense_cloud(
    p_expense_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_existing public.expenses%ROWTYPE;
    v_wallet public.wallets%ROWTYPE;
    v_last_modified BIGINT := (extract(epoch from now()) * 1000)::BIGINT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_existing
    FROM public.expenses
    WHERE id = p_expense_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found';
    END IF;

    IF NOT public.is_trip_editor(v_existing.trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE id = v_existing.wallet_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.wallets
        SET lots = public.restore_wallet_lots_json(
                COALESCE(v_wallet.lots, '[]'::JSONB),
                v_existing.lot_breakdown,
                v_existing.converted_amount_trip
            ),
            spent_amount = GREATEST(0, COALESCE(v_wallet.spent_amount, 0) - COALESCE(v_existing.converted_amount_trip, 0)),
            field_updates = COALESCE(field_updates, '{}'::JSONB)
                || jsonb_build_object('lots', v_last_modified, 'spentAmount', v_last_modified),
            updated_at = v_last_modified,
            updated_by = v_caller_id
        WHERE id = v_wallet.id;
    END IF;

    UPDATE public.expenses
    SET deleted_at = to_timestamp(v_last_modified / 1000.0),
        updated_at = v_last_modified,
        updated_by = v_caller_id
    WHERE id = p_expense_id;

    PERFORM public.sync_trip_wallet_mirror(v_existing.trip_id, v_last_modified);

    RETURN jsonb_build_object('expenseId', p_expense_id, 'tripId', v_existing.trip_id, 'lastModified', v_last_modified);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_spontaneous_expense_cloud(
    p_activity JSONB,
    p_expense JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN public.save_activity_bundle(p_activity, jsonb_build_array(p_expense));
END;
$$;

CREATE OR REPLACE FUNCTION public.add_funding_event_cloud(
    p_event JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_trip_id TEXT := p_event->>'tripId';
    v_wallet_id TEXT := p_event->>'walletId';
    v_event_id TEXT := COALESCE(NULLIF(p_event->>'id', ''), gen_random_uuid()::TEXT);
    v_last_modified BIGINT := COALESCE(NULLIF(p_event->>'lastModified', '')::BIGINT, (extract(epoch from now()) * 1000)::BIGINT);
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF v_trip_id IS NULL OR v_trip_id = '' OR v_wallet_id IS NULL OR v_wallet_id = '' THEN
        RAISE EXCEPTION 'Trip and wallet are required';
    END IF;
    IF NOT public.is_trip_editor(v_trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    INSERT INTO public.funding_lots (
        id, wallet_id, trip_id, source_currency, target_currency,
        source_amount, rate, notes, created_at, field_updates,
        updated_at, updated_by, user_id, deleted_at
    )
    VALUES (
        v_event_id,
        v_wallet_id,
        v_trip_id,
        COALESCE(p_event->>'sourceCurrency', 'PHP'),
        COALESCE(p_event->>'targetCurrency', ''),
        COALESCE(NULLIF(p_event->>'homeAmount', '')::NUMERIC, 0),
        COALESCE(NULLIF(p_event->>'rate', '')::NUMERIC, 0),
        NULLIF(p_event->>'notes', ''),
        to_timestamp(COALESCE(NULLIF(p_event->>'date', '')::BIGINT, v_last_modified) / 1000.0),
        COALESCE(p_event->'fieldUpdates', '{}'::JSONB),
        v_last_modified,
        v_caller_id,
        v_caller_id,
        NULL
    );

    PERFORM public.rebuild_wallet_from_funding_events(v_trip_id, v_wallet_id, v_last_modified);
    PERFORM public.sync_trip_budget_from_funding(v_trip_id, v_last_modified);
    PERFORM public.sync_trip_wallet_mirror(v_trip_id, v_last_modified);

    RETURN jsonb_build_object('eventId', v_event_id, 'tripId', v_trip_id, 'lastModified', v_last_modified);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_funding_event_cloud(
    p_event_id TEXT,
    p_event JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_existing public.funding_lots%ROWTYPE;
    v_trip_id TEXT;
    v_wallet_id TEXT;
    v_last_modified BIGINT := COALESCE(NULLIF(p_event->>'lastModified', '')::BIGINT, (extract(epoch from now()) * 1000)::BIGINT);
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_existing
    FROM public.funding_lots
    WHERE id = p_event_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Funding event not found';
    END IF;

    IF NOT public.is_trip_editor(v_existing.trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.expenses
        WHERE wallet_id = v_existing.wallet_id
          AND deleted_at IS NULL
          AND jsonb_typeof(COALESCE(lot_breakdown, '[]'::JSONB)) = 'array'
          AND jsonb_array_length(COALESCE(lot_breakdown, '[]'::JSONB)) > 0
    ) THEN
        RAISE EXCEPTION 'Cannot edit a funding event after expenses have used this wallet';
    END IF;

    v_trip_id := v_existing.trip_id;
    v_wallet_id := COALESCE(NULLIF(p_event->>'walletId', ''), v_existing.wallet_id);

    IF v_wallet_id IS DISTINCT FROM v_existing.wallet_id THEN
        RAISE EXCEPTION 'Move budget entries by deleting and re-adding them to another wallet';
    END IF;

    UPDATE public.funding_lots
    SET source_amount = COALESCE(NULLIF(p_event->>'homeAmount', '')::NUMERIC, v_existing.source_amount),
        rate = COALESCE(NULLIF(p_event->>'rate', '')::NUMERIC, v_existing.rate),
        notes = COALESCE(NULLIF(p_event->>'notes', ''), v_existing.notes),
        field_updates = COALESCE(p_event->'fieldUpdates', v_existing.field_updates, '{}'::JSONB),
        updated_at = v_last_modified,
        updated_by = v_caller_id
    WHERE id = p_event_id;

    PERFORM public.rebuild_wallet_from_funding_events(v_trip_id, v_wallet_id, v_last_modified);
    PERFORM public.sync_trip_budget_from_funding(v_trip_id, v_last_modified);
    PERFORM public.sync_trip_wallet_mirror(v_trip_id, v_last_modified);

    RETURN jsonb_build_object('eventId', p_event_id, 'tripId', v_trip_id, 'lastModified', v_last_modified);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_funding_event_cloud(
    p_event_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_existing public.funding_lots%ROWTYPE;
    v_last_modified BIGINT := (extract(epoch from now()) * 1000)::BIGINT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_existing
    FROM public.funding_lots
    WHERE id = p_event_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Funding event not found';
    END IF;

    IF NOT public.is_trip_editor(v_existing.trip_id, v_caller_id) THEN
        RAISE EXCEPTION 'Not allowed to edit this trip';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.expenses
        WHERE wallet_id = v_existing.wallet_id
          AND deleted_at IS NULL
          AND jsonb_typeof(COALESCE(lot_breakdown, '[]'::JSONB)) = 'array'
          AND jsonb_array_length(COALESCE(lot_breakdown, '[]'::JSONB)) > 0
    ) THEN
        RAISE EXCEPTION 'Cannot delete a funding event after expenses have used this wallet';
    END IF;

    UPDATE public.funding_lots
    SET deleted_at = to_timestamp(v_last_modified / 1000.0),
        updated_at = v_last_modified,
        updated_by = v_caller_id
    WHERE id = p_event_id;

    PERFORM public.rebuild_wallet_from_funding_events(v_existing.trip_id, v_existing.wallet_id, v_last_modified);
    PERFORM public.sync_trip_budget_from_funding(v_existing.trip_id, v_last_modified);
    PERFORM public.sync_trip_wallet_mirror(v_existing.trip_id, v_last_modified);

    RETURN jsonb_build_object('eventId', p_event_id, 'tripId', v_existing.trip_id, 'lastModified', v_last_modified);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_trip_budget_from_funding(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_wallet_from_funding_events(TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_expense_cloud(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_expense_cloud(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expense_cloud(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_spontaneous_expense_cloud(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_funding_event_cloud(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_funding_event_cloud(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_funding_event_cloud(TEXT) TO authenticated;
