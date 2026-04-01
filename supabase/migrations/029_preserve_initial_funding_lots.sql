ALTER TABLE public.funding_lots
ADD COLUMN IF NOT EXISTS entry_kind TEXT;

UPDATE public.funding_lots
SET entry_kind = 'top_up'
WHERE entry_kind IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'funding_lots_entry_kind_check'
    ) THEN
        ALTER TABLE public.funding_lots
        ADD CONSTRAINT funding_lots_entry_kind_check
        CHECK (entry_kind IN ('initial', 'top_up'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_funding_lots_initial_per_wallet
ON public.funding_lots (wallet_id)
WHERE entry_kind = 'initial' AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_wallet_initial_funding_lot(
    p_wallet_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_wallet public.wallets%ROWTYPE;
    v_trip public.trips%ROWTYPE;
    v_initial_lot JSONB;
    v_existing_initial_id TEXT;
    v_created_at_ms BIGINT;
    v_updated_at_ms BIGINT;
BEGIN
    IF p_wallet_id IS NULL OR p_wallet_id = '' THEN
        RETURN;
    END IF;

    SELECT *
    INTO v_wallet
    FROM public.wallets
    WHERE id = p_wallet_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT *
    INTO v_trip
    FROM public.trips
    WHERE id = v_wallet.trip_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT value
    INTO v_initial_lot
    FROM jsonb_array_elements(COALESCE(v_wallet.lots, '[]'::JSONB)) value
    ORDER BY
        CASE WHEN COALESCE(value->>'entryKind', '') = 'initial' THEN 0 ELSE 1 END,
        COALESCE(NULLIF(value->>'createdAt', '')::BIGINT, 0),
        COALESCE(value->>'id', '')
    LIMIT 1;

    IF v_initial_lot IS NULL THEN
        RETURN;
    END IF;

    v_created_at_ms := COALESCE(
        NULLIF(v_initial_lot->>'createdAt', '')::BIGINT,
        v_wallet.updated_at,
        (extract(epoch from v_wallet.created_at) * 1000)::BIGINT,
        (extract(epoch from now()) * 1000)::BIGINT
    );
    v_updated_at_ms := COALESCE(
        v_wallet.updated_at,
        v_created_at_ms,
        (extract(epoch from now()) * 1000)::BIGINT
    );

    SELECT fl.id
    INTO v_existing_initial_id
    FROM public.funding_lots fl
    WHERE fl.wallet_id = v_wallet.id
      AND fl.deleted_at IS NULL
      AND fl.entry_kind = 'initial'
    LIMIT 1;

    IF v_existing_initial_id IS NULL THEN
        INSERT INTO public.funding_lots (
            id,
            wallet_id,
            trip_id,
            source_currency,
            target_currency,
            source_amount,
            rate,
            entry_kind,
            notes,
            created_at,
            field_updates,
            updated_at,
            updated_by,
            user_id,
            deleted_at
        )
        VALUES (
            gen_random_uuid()::TEXT,
            v_wallet.id,
            v_wallet.trip_id,
            COALESCE(NULLIF(v_initial_lot->>'sourceCurrency', ''), COALESCE(v_trip.home_currency, 'PHP')),
            COALESCE(NULLIF(v_initial_lot->>'walletCurrency', ''), v_wallet.currency),
            COALESCE(NULLIF(v_initial_lot->>'sourceAmount', '')::NUMERIC, 0),
            COALESCE(NULLIF(v_initial_lot->>'lockedRate', '')::NUMERIC, 0),
            'initial',
            NULL,
            to_timestamp(v_created_at_ms / 1000.0),
            '{}'::JSONB,
            v_updated_at_ms,
            COALESCE(v_wallet.updated_by, v_trip.updated_by, v_trip.user_id),
            COALESCE(v_wallet.user_id, v_trip.user_id),
            NULL
        );
    ELSE
        UPDATE public.funding_lots
        SET source_currency = COALESCE(NULLIF(v_initial_lot->>'sourceCurrency', ''), COALESCE(v_trip.home_currency, 'PHP')),
            target_currency = COALESCE(NULLIF(v_initial_lot->>'walletCurrency', ''), v_wallet.currency),
            source_amount = COALESCE(NULLIF(v_initial_lot->>'sourceAmount', '')::NUMERIC, 0),
            rate = COALESCE(NULLIF(v_initial_lot->>'lockedRate', '')::NUMERIC, 0),
            entry_kind = 'initial',
            created_at = to_timestamp(v_created_at_ms / 1000.0),
            updated_at = v_updated_at_ms,
            updated_by = COALESCE(v_wallet.updated_by, v_trip.updated_by, v_trip.user_id),
            user_id = COALESCE(v_wallet.user_id, v_trip.user_id),
            deleted_at = NULL
        WHERE id = v_existing_initial_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_wallet_initial_funding_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.deleted_at IS NULL THEN
        PERFORM public.sync_wallet_initial_funding_lot(NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_initial_funding_sync ON public.wallets;
CREATE TRIGGER trg_wallet_initial_funding_sync
AFTER INSERT OR UPDATE OF lots, currency, updated_at, updated_by, user_id, deleted_at
ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.handle_wallet_initial_funding_sync();

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
    v_events JSONB;
    v_event JSONB;
    v_lots JSONB := '[]'::JSONB;
    v_converted NUMERIC;
    v_total_budget NUMERIC := 0;
BEGIN
    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN '[]'::JSONB;
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

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', fl.id,
                'sourceCurrency', COALESCE(fl.source_currency, COALESCE(v_trip.home_currency, 'PHP')),
                'walletCurrency', v_wallet.currency,
                'sourceAmount', COALESCE(fl.source_amount, 0),
                'tripAmount', CASE WHEN COALESCE(fl.rate, 0) > 0 THEN COALESCE(fl.source_amount, 0) / fl.rate ELSE 0 END,
                'rate', COALESCE(fl.rate, 0),
                'entryKind', COALESCE(fl.entry_kind, 'top_up'),
                'date', COALESCE((extract(epoch from fl.created_at) * 1000)::BIGINT, p_last_modified)
            )
            ORDER BY
                CASE WHEN COALESCE(fl.entry_kind, 'top_up') = 'initial' THEN 0 ELSE 1 END,
                fl.created_at,
                fl.id
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
                THEN COALESCE(NULLIF(v_event->>'sourceAmount', '')::NUMERIC, 0) / NULLIF(v_event->>'rate', '')::NUMERIC
            ELSE 0
        END;

        v_lots := v_lots || jsonb_build_array(
            jsonb_build_object(
                'id', COALESCE(v_event->>'id', gen_random_uuid()::TEXT),
                'walletCurrency', v_wallet.currency,
                'sourceCurrency', COALESCE(v_event->>'sourceCurrency', COALESCE(v_trip.home_currency, 'PHP')),
                'sourceAmount', COALESCE(NULLIF(v_event->>'sourceAmount', '')::NUMERIC, 0),
                'originalConvertedAmount', v_converted,
                'remainingAmount', v_converted,
                'lockedRate', COALESCE(NULLIF(v_event->>'rate', '')::NUMERIC, 0),
                'rateBaseCurrency', CASE
                    WHEN COALESCE(v_event->>'sourceCurrency', COALESCE(v_trip.home_currency, 'PHP')) = COALESCE(v_trip.home_currency, 'PHP')
                        THEN 1
                    ELSE NULL
                END,
                'createdAt', COALESCE(NULLIF(v_event->>'date', '')::BIGINT, p_last_modified),
                'entryKind', COALESCE(v_event->>'entryKind', 'top_up'),
                'isDefault', FALSE
            )
        );
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
        source_amount, rate, entry_kind, notes, created_at, field_updates,
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
        COALESCE(NULLIF(p_event->>'entryKind', ''), 'top_up'),
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
    SET source_currency = COALESCE(NULLIF(p_event->>'sourceCurrency', ''), v_existing.source_currency),
        target_currency = COALESCE(NULLIF(p_event->>'targetCurrency', ''), v_existing.target_currency),
        source_amount = COALESCE(NULLIF(p_event->>'homeAmount', '')::NUMERIC, v_existing.source_amount),
        rate = COALESCE(NULLIF(p_event->>'rate', '')::NUMERIC, v_existing.rate),
        entry_kind = COALESCE(NULLIF(p_event->>'entryKind', ''), v_existing.entry_kind, 'top_up'),
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

DO $$
DECLARE
    v_wallet RECORD;
    v_trip RECORD;
    v_now BIGINT := (extract(epoch from now()) * 1000)::BIGINT;
BEGIN
    FOR v_wallet IN
        SELECT w.id
        FROM public.wallets w
        INNER JOIN public.trips t
            ON t.id = w.trip_id
           AND t.deleted_at IS NULL
        WHERE w.deleted_at IS NULL
    LOOP
        PERFORM public.sync_wallet_initial_funding_lot(v_wallet.id);
    END LOOP;

    FOR v_wallet IN
        SELECT w.trip_id, w.id
        FROM public.wallets w
        INNER JOIN public.trips t
            ON t.id = w.trip_id
           AND t.deleted_at IS NULL
        WHERE w.deleted_at IS NULL
    LOOP
        PERFORM public.rebuild_wallet_from_funding_events(v_wallet.trip_id, v_wallet.id, v_now);
    END LOOP;

    FOR v_trip IN
        SELECT id
        FROM public.trips
        WHERE deleted_at IS NULL
    LOOP
        PERFORM public.sync_trip_budget_from_funding(v_trip.id, v_now);
        PERFORM public.sync_trip_wallet_mirror(v_trip.id, v_now);
    END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.sync_wallet_initial_funding_lot(TEXT) TO authenticated;
