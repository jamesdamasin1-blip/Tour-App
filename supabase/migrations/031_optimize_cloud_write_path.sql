-- Migration 031: optimize hot write paths for expenses, activities, and funding events
-- Goals:
-- 1. Add missing indexes for hot lookup paths.
-- 2. Stop rebuilding trip.wallets mirror on every financial mutation.
-- 3. Replace funding-event full rebuilds with cheaper delta updates.
-- 4. Narrow initial-funding trigger work so expense lot deductions do not resync funding rows.

CREATE INDEX IF NOT EXISTS idx_wallets_trip_alive
ON public.wallets (trip_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_wallet_alive
ON public.expenses (wallet_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_funding_lots_trip_wallet_alive
ON public.funding_lots (trip_id, wallet_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_funding_lots_wallet_alive
ON public.funding_lots (wallet_id)
WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.extract_wallet_initial_lot_signature(
    p_lots JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_initial_lot JSONB;
BEGIN
    IF jsonb_typeof(COALESCE(p_lots, '[]'::JSONB)) IS DISTINCT FROM 'array' THEN
        RETURN NULL;
    END IF;

    SELECT value
    INTO v_initial_lot
    FROM jsonb_array_elements(COALESCE(p_lots, '[]'::JSONB)) value
    ORDER BY
        CASE WHEN COALESCE(value->>'entryKind', '') = 'initial' THEN 0 ELSE 1 END,
        COALESCE(NULLIF(value->>'createdAt', '')::BIGINT, 0),
        COALESCE(value->>'id', '')
    LIMIT 1;

    IF v_initial_lot IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', COALESCE(v_initial_lot->>'id', ''),
        'entryKind', COALESCE(v_initial_lot->>'entryKind', ''),
        'sourceCurrency', COALESCE(v_initial_lot->>'sourceCurrency', ''),
        'walletCurrency', COALESCE(v_initial_lot->>'walletCurrency', ''),
        'sourceAmount', COALESCE(v_initial_lot->>'sourceAmount', ''),
        'lockedRate', COALESCE(v_initial_lot->>'lockedRate', ''),
        'createdAt', COALESCE(v_initial_lot->>'createdAt', '')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_funding_trip_amount(
    p_source_amount NUMERIC,
    p_rate NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN COALESCE(p_rate, 0) > 0 THEN COALESCE(p_source_amount, 0) / p_rate
        ELSE 0
    END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_wallet_lots_json(
    p_lots JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_result JSONB := '[]'::JSONB;
BEGIN
    IF jsonb_typeof(COALESCE(p_lots, '[]'::JSONB)) IS DISTINCT FROM 'array' THEN
        RETURN '[]'::JSONB;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_set(value, '{isDefault}', 'false'::JSONB, TRUE)
            ORDER BY
                CASE WHEN COALESCE(value->>'entryKind', 'top_up') = 'initial' THEN 0 ELSE 1 END,
                COALESCE(NULLIF(value->>'createdAt', '')::BIGINT, 0),
                COALESCE(value->>'id', '')
        ),
        '[]'::JSONB
    )
    INTO v_result
    FROM jsonb_array_elements(COALESCE(p_lots, '[]'::JSONB)) value;

    IF jsonb_array_length(v_result) > 0 THEN
        v_result := jsonb_set(
            v_result,
            ARRAY[(jsonb_array_length(v_result) - 1)::TEXT, 'isDefault'],
            'true'::JSONB
        );
    END IF;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_wallet_funding_lot_change(
    p_trip_id TEXT,
    p_wallet_id TEXT,
    p_event_id TEXT,
    p_last_modified BIGINT,
    p_delta_trip NUMERIC,
    p_source_currency TEXT DEFAULT NULL,
    p_source_amount NUMERIC DEFAULT NULL,
    p_rate NUMERIC DEFAULT NULL,
    p_entry_kind TEXT DEFAULT NULL,
    p_created_at_ms BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_trip public.trips%ROWTYPE;
    v_wallet public.wallets%ROWTYPE;
    v_filtered_lots JSONB := '[]'::JSONB;
    v_next_lots JSONB := '[]'::JSONB;
    v_new_lot JSONB;
    v_trip_amount NUMERIC := COALESCE(p_delta_trip, 0);
BEGIN
    SELECT *
    INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    SELECT *
    INTO v_wallet
    FROM public.wallets
    WHERE id = p_wallet_id
      AND trip_id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    SELECT COALESCE(jsonb_agg(value), '[]'::JSONB)
    INTO v_filtered_lots
    FROM jsonb_array_elements(COALESCE(v_wallet.lots, '[]'::JSONB)) value
    WHERE COALESCE(value->>'id', '') <> COALESCE(p_event_id, '');

    v_next_lots := COALESCE(v_filtered_lots, '[]'::JSONB);

    IF p_source_amount IS NOT NULL THEN
        v_new_lot := jsonb_build_object(
            'id', p_event_id,
            'walletCurrency', v_wallet.currency,
            'sourceCurrency', COALESCE(NULLIF(p_source_currency, ''), COALESCE(v_trip.home_currency, 'PHP')),
            'sourceAmount', COALESCE(p_source_amount, 0),
            'originalConvertedAmount', public.compute_funding_trip_amount(COALESCE(p_source_amount, 0), COALESCE(p_rate, 0)),
            'remainingAmount', public.compute_funding_trip_amount(COALESCE(p_source_amount, 0), COALESCE(p_rate, 0)),
            'lockedRate', COALESCE(p_rate, 0),
            'rateBaseCurrency', CASE
                WHEN COALESCE(NULLIF(p_source_currency, ''), COALESCE(v_trip.home_currency, 'PHP')) = COALESCE(v_trip.home_currency, 'PHP')
                    THEN 1
                ELSE NULL
            END,
            'createdAt', COALESCE(p_created_at_ms, p_last_modified),
            'entryKind', COALESCE(NULLIF(p_entry_kind, ''), 'top_up'),
            'isDefault', FALSE
        );
        v_next_lots := v_next_lots || jsonb_build_array(v_new_lot);
    END IF;

    v_next_lots := public.normalize_wallet_lots_json(v_next_lots);

    UPDATE public.wallets
    SET lots = v_next_lots,
        total_budget = GREATEST(0, COALESCE(v_wallet.total_budget, 0) + COALESCE(v_trip_amount, 0)),
        field_updates = COALESCE(v_wallet.field_updates, '{}'::JSONB)
            || jsonb_build_object('lots', p_last_modified, 'totalBudget', p_last_modified),
        updated_at = p_last_modified,
        updated_by = auth.uid()
    WHERE id = p_wallet_id;

    RETURN v_next_lots;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_trip_budget_from_funding_delta(
    p_trip_id TEXT,
    p_delta_home NUMERIC,
    p_last_modified BIGINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_trip public.trips%ROWTYPE;
    v_next_total NUMERIC;
BEGIN
    SELECT *
    INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.total_budget_home_cached IS NULL THEN
        RETURN public.sync_trip_budget_from_funding(p_trip_id, p_last_modified);
    END IF;

    v_next_total := GREATEST(0, COALESCE(v_trip.total_budget_home_cached, 0) + COALESCE(p_delta_home, 0));

    UPDATE public.trips
    SET total_budget_home_cached = v_next_total,
        last_modified = p_last_modified,
        updated_at = p_last_modified,
        updated_by = auth.uid(),
        field_updates = COALESCE(v_trip.field_updates, '{}'::JSONB)
            || jsonb_build_object('totalBudgetHomeCached', p_last_modified)
    WHERE id = p_trip_id;

    RETURN v_next_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_wallet_initial_funding_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_signature JSONB;
    v_new_signature JSONB;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_old_signature := public.extract_wallet_initial_lot_signature(OLD.lots);
        v_new_signature := public.extract_wallet_initial_lot_signature(NEW.lots);

        IF COALESCE(v_old_signature, 'null'::JSONB) = COALESCE(v_new_signature, 'null'::JSONB)
           AND NEW.currency IS NOT DISTINCT FROM OLD.currency
           AND NEW.trip_id IS NOT DISTINCT FROM OLD.trip_id
           AND NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by
           AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
           AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
            RETURN NEW;
        END IF;
    END IF;

    PERFORM public.sync_wallet_initial_funding_lot(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_initial_funding_sync ON public.wallets;
CREATE TRIGGER trg_wallet_initial_funding_sync
AFTER INSERT OR UPDATE OF lots, currency, trip_id, updated_by, user_id, deleted_at
ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.handle_wallet_initial_funding_sync();

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

    RETURN jsonb_build_object(
        'activityId', p_activity_id,
        'tripId', v_activity.trip_id,
        'lastModified', v_last_modified
    );
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

    RETURN jsonb_build_object('expenseId', p_expense_id, 'tripId', v_existing.trip_id, 'lastModified', v_last_modified);
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
    v_source_currency TEXT := COALESCE(NULLIF(p_event->>'sourceCurrency', ''), 'PHP');
    v_source_amount NUMERIC := COALESCE(NULLIF(p_event->>'homeAmount', '')::NUMERIC, 0);
    v_rate NUMERIC := COALESCE(NULLIF(p_event->>'rate', '')::NUMERIC, 0);
    v_entry_kind TEXT := COALESCE(NULLIF(p_event->>'entryKind', ''), 'top_up');
    v_created_at_ms BIGINT := COALESCE(NULLIF(p_event->>'date', '')::BIGINT, v_last_modified);
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
        source_amount, rate, entry_kind, notes, created_at, field_updates,
        updated_at, updated_by, user_id, deleted_at
    )
    VALUES (
        v_event_id,
        v_wallet_id,
        v_trip_id,
        v_source_currency,
        COALESCE(p_event->>'targetCurrency', ''),
        v_source_amount,
        v_rate,
        v_entry_kind,
        NULLIF(p_event->>'notes', ''),
        to_timestamp(v_created_at_ms / 1000.0),
        COALESCE(p_event->'fieldUpdates', '{}'::JSONB),
        v_last_modified,
        v_caller_id,
        v_caller_id,
        NULL
    );

    PERFORM public.apply_wallet_funding_lot_change(
        v_trip_id,
        v_wallet_id,
        v_event_id,
        v_last_modified,
        public.compute_funding_trip_amount(v_source_amount, v_rate),
        v_source_currency,
        v_source_amount,
        v_rate,
        v_entry_kind,
        v_created_at_ms
    );
    PERFORM public.sync_trip_budget_from_funding_delta(v_trip_id, v_source_amount, v_last_modified);

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
    v_source_currency TEXT;
    v_source_amount NUMERIC;
    v_rate NUMERIC;
    v_entry_kind TEXT;
    v_created_at_ms BIGINT;
    v_old_trip_amount NUMERIC;
    v_new_trip_amount NUMERIC;
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

    v_source_currency := COALESCE(NULLIF(p_event->>'sourceCurrency', ''), v_existing.source_currency);
    v_source_amount := COALESCE(NULLIF(p_event->>'homeAmount', '')::NUMERIC, v_existing.source_amount);
    v_rate := COALESCE(NULLIF(p_event->>'rate', '')::NUMERIC, v_existing.rate);
    v_entry_kind := COALESCE(NULLIF(p_event->>'entryKind', ''), v_existing.entry_kind, 'top_up');
    v_created_at_ms := COALESCE(
        NULLIF(p_event->>'date', '')::BIGINT,
        (extract(epoch from v_existing.created_at) * 1000)::BIGINT,
        v_last_modified
    );
    v_old_trip_amount := public.compute_funding_trip_amount(v_existing.source_amount, v_existing.rate);
    v_new_trip_amount := public.compute_funding_trip_amount(v_source_amount, v_rate);

    UPDATE public.funding_lots
    SET source_currency = v_source_currency,
        target_currency = COALESCE(NULLIF(p_event->>'targetCurrency', ''), v_existing.target_currency),
        source_amount = v_source_amount,
        rate = v_rate,
        entry_kind = v_entry_kind,
        notes = COALESCE(NULLIF(p_event->>'notes', ''), v_existing.notes),
        field_updates = COALESCE(p_event->'fieldUpdates', v_existing.field_updates, '{}'::JSONB),
        created_at = to_timestamp(v_created_at_ms / 1000.0),
        updated_at = v_last_modified,
        updated_by = v_caller_id
    WHERE id = p_event_id;

    PERFORM public.apply_wallet_funding_lot_change(
        v_trip_id,
        v_wallet_id,
        p_event_id,
        v_last_modified,
        v_new_trip_amount - v_old_trip_amount,
        v_source_currency,
        v_source_amount,
        v_rate,
        v_entry_kind,
        v_created_at_ms
    );
    PERFORM public.sync_trip_budget_from_funding_delta(
        v_trip_id,
        v_source_amount - COALESCE(v_existing.source_amount, 0),
        v_last_modified
    );

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

    PERFORM public.apply_wallet_funding_lot_change(
        v_existing.trip_id,
        v_existing.wallet_id,
        p_event_id,
        v_last_modified,
        -public.compute_funding_trip_amount(v_existing.source_amount, v_existing.rate),
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
    );
    PERFORM public.sync_trip_budget_from_funding_delta(
        v_existing.trip_id,
        -COALESCE(v_existing.source_amount, 0),
        v_last_modified
    );

    RETURN jsonb_build_object('eventId', p_event_id, 'tripId', v_existing.trip_id, 'lastModified', v_last_modified);
END;
$$;

GRANT EXECUTE ON FUNCTION public.extract_wallet_initial_lot_signature(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_funding_trip_amount(NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_wallet_lots_json(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wallet_funding_lot_change(TEXT, TEXT, TEXT, BIGINT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_trip_budget_from_funding_delta(TEXT, NUMERIC, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
