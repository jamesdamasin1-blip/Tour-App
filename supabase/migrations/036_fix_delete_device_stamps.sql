-- Migration 036: stamp current device ids on delete RPCs so realtime delete
-- events are not misclassified as self-emitted on another device that last
-- touched the same row. Keep legacy one-arg wrappers for older clients.

CREATE OR REPLACE FUNCTION public.delete_activity_cascade(
    p_activity_id TEXT,
    p_last_device_id TEXT DEFAULT NULL
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
                updated_by = v_caller_id,
                last_device_id = COALESCE(p_last_device_id, v_wallet_row.last_device_id)
            WHERE id = v_wallet_row.id;
        END IF;
    END LOOP;

    UPDATE public.expenses
    SET deleted_at = to_timestamp(v_last_modified / 1000.0),
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        last_device_id = COALESCE(p_last_device_id, public.expenses.last_device_id)
    WHERE activity_id = p_activity_id
      AND deleted_at IS NULL;

    UPDATE public.activities
    SET deleted_at = to_timestamp(v_last_modified / 1000.0),
        last_modified = v_last_modified,
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        last_device_id = COALESCE(p_last_device_id, public.activities.last_device_id)
    WHERE id = p_activity_id;

    RETURN jsonb_build_object(
        'activityId', p_activity_id,
        'tripId', v_activity.trip_id,
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
BEGIN
    RETURN public.delete_activity_cascade(p_activity_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expense_cloud(
    p_expense_id TEXT,
    p_last_device_id TEXT DEFAULT NULL
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
            updated_by = v_caller_id,
            last_device_id = COALESCE(p_last_device_id, v_wallet.last_device_id)
        WHERE id = v_wallet.id;
    END IF;

    UPDATE public.expenses
    SET deleted_at = to_timestamp(v_last_modified / 1000.0),
        updated_at = v_last_modified,
        updated_by = v_caller_id,
        last_device_id = COALESCE(p_last_device_id, public.expenses.last_device_id)
    WHERE id = p_expense_id;

    RETURN jsonb_build_object('expenseId', p_expense_id, 'tripId', v_existing.trip_id, 'lastModified', v_last_modified);
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
BEGIN
    RETURN public.delete_expense_cloud(p_expense_id, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_activity_cascade(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_activity_cascade(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expense_cloud(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expense_cloud(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
