-- Migration 032: skip full expense rebuilds when an activity save does not
-- actually change its expense payload.

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
    v_should_replace_expenses BOOLEAN := p_expenses IS NOT NULL;
    v_existing_expense_signature JSONB := '[]'::JSONB;
    v_incoming_expense_signature JSONB := '[]'::JSONB;
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

    IF v_should_replace_expenses THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', e.id,
                    'walletId', COALESCE(e.wallet_id, ''),
                    'name', COALESCE(e.name, ''),
                    'amount', COALESCE(e.amount, 0),
                    'currency', COALESCE(e.currency, ''),
                    'convertedAmountHome', COALESCE(e.converted_amount_home, 0),
                    'convertedAmountTrip', COALESCE(e.converted_amount_trip, 0),
                    'category', COALESCE(e.category, ''),
                    'date', COALESCE(e.date, 0),
                    'time', COALESCE(e.time, 0),
                    'originalAmount', e.original_amount,
                    'originalCurrency', COALESCE(e.original_currency, '')
                )
                ORDER BY e.id
            ),
            '[]'::JSONB
        )
        INTO v_existing_expense_signature
        FROM public.expenses e
        WHERE e.activity_id = v_activity_id
          AND e.deleted_at IS NULL;

        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', payload.id,
                    'walletId', payload.wallet_id,
                    'name', payload.name,
                    'amount', payload.amount,
                    'currency', payload.currency,
                    'convertedAmountHome', payload.converted_amount_home,
                    'convertedAmountTrip', payload.converted_amount_trip,
                    'category', payload.category,
                    'date', payload.date,
                    'time', payload.time,
                    'originalAmount', payload.original_amount,
                    'originalCurrency', payload.original_currency
                )
                ORDER BY payload.id
            ),
            '[]'::JSONB
        )
        INTO v_incoming_expense_signature
        FROM (
            SELECT
                COALESCE(NULLIF(value->>'id', ''), '') AS id,
                COALESCE(NULLIF(value->>'walletId', ''), NULLIF(p_activity->>'walletId', ''), '') AS wallet_id,
                COALESCE(value->>'name', COALESCE(p_activity->>'title', '')) AS name,
                COALESCE(NULLIF(value->>'amount', '')::NUMERIC, 0) AS amount,
                COALESCE(value->>'currency', 'PHP') AS currency,
                COALESCE(NULLIF(value->>'convertedAmountHome', '')::NUMERIC, 0) AS converted_amount_home,
                COALESCE(
                    NULLIF(value->>'convertedAmountTrip', '')::NUMERIC,
                    NULLIF(value->>'amount', '')::NUMERIC,
                    0
                ) AS converted_amount_trip,
                COALESCE(value->>'category', COALESCE(p_activity->>'category', 'Other')) AS category,
                COALESCE(NULLIF(value->>'date', '')::BIGINT, v_last_modified) AS date,
                COALESCE(NULLIF(value->>'time', '')::BIGINT, v_last_modified) AS time,
                NULLIF(value->>'originalAmount', '')::NUMERIC AS original_amount,
                COALESCE(NULLIF(value->>'originalCurrency', ''), '') AS original_currency
            FROM jsonb_array_elements(COALESCE(p_expenses, '[]'::JSONB)) value
        ) AS payload;

        IF COALESCE(v_existing_expense_signature, '[]'::JSONB) = COALESCE(v_incoming_expense_signature, '[]'::JSONB) THEN
            v_should_replace_expenses := FALSE;
        END IF;
    END IF;

    IF NOT v_should_replace_expenses
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

    IF v_should_replace_expenses THEN
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

    IF v_should_replace_expenses THEN
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

            IF v_amount_trip > 0 THEN
                v_fifo := public.apply_wallet_fifo_json(COALESCE(v_wallet_row.lots, '[]'::JSONB), v_amount_trip);
                UPDATE public.wallets
                SET lots = COALESCE(v_fifo->'lots', '[]'::JSONB),
                    spent_amount = COALESCE(v_wallet_row.spent_amount, 0) + v_amount_trip,
                    field_updates = COALESCE(v_wallet_row.field_updates, '{}'::JSONB)
                        || jsonb_build_object('lots', v_last_modified, 'spentAmount', v_last_modified),
                    updated_at = v_last_modified,
                    updated_by = v_caller_id
                WHERE id = v_wallet_row.id;
            ELSE
                v_fifo := jsonb_build_object('lots', COALESCE(v_wallet_row.lots, '[]'::JSONB), 'breakdown', '[]'::JSONB);
            END IF;

            v_expense_id := COALESCE(NULLIF(v_expense->>'id', ''), gen_random_uuid()::TEXT);

            INSERT INTO public.expenses (
                id,
                trip_id,
                wallet_id,
                activity_id,
                name,
                amount,
                currency,
                converted_amount_home,
                converted_amount_trip,
                category,
                date,
                time,
                original_amount,
                original_currency,
                lot_breakdown,
                field_updates,
                updated_at,
                updated_by,
                user_id,
                deleted_at
            )
            VALUES (
                v_expense_id,
                v_trip_id,
                v_wallet_id,
                v_activity_id,
                COALESCE(v_expense->>'name', COALESCE(p_activity->>'title', '')),
                COALESCE(NULLIF(v_expense->>'amount', '')::NUMERIC, 0),
                COALESCE(v_expense->>'currency', 'PHP'),
                COALESCE(NULLIF(v_expense->>'convertedAmountHome', '')::NUMERIC, 0),
                v_amount_trip,
                COALESCE(v_expense->>'category', COALESCE(p_activity->>'category', 'Other')),
                COALESCE(NULLIF(v_expense->>'date', '')::BIGINT, v_last_modified),
                COALESCE(NULLIF(v_expense->>'time', '')::BIGINT, v_last_modified),
                NULLIF(v_expense->>'originalAmount', '')::NUMERIC,
                NULLIF(v_expense->>'originalCurrency', ''),
                COALESCE(v_fifo->'breakdown', '[]'::JSONB),
                COALESCE(v_expense->'fieldUpdates', '{}'::JSONB),
                v_last_modified,
                v_caller_id,
                v_caller_id,
                NULL
            )
            ON CONFLICT (id) DO UPDATE
            SET trip_id = EXCLUDED.trip_id,
                wallet_id = EXCLUDED.wallet_id,
                activity_id = EXCLUDED.activity_id,
                name = EXCLUDED.name,
                amount = EXCLUDED.amount,
                currency = EXCLUDED.currency,
                converted_amount_home = EXCLUDED.converted_amount_home,
                converted_amount_trip = EXCLUDED.converted_amount_trip,
                category = EXCLUDED.category,
                date = EXCLUDED.date,
                time = EXCLUDED.time,
                original_amount = EXCLUDED.original_amount,
                original_currency = EXCLUDED.original_currency,
                lot_breakdown = EXCLUDED.lot_breakdown,
                field_updates = EXCLUDED.field_updates,
                updated_at = EXCLUDED.updated_at,
                updated_by = EXCLUDED.updated_by,
                deleted_at = NULL;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'activityId', v_activity_id,
        'tripId', v_trip_id,
        'lastModified', v_last_modified
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
