const TRACE_ENABLED =
    typeof __DEV__ !== 'undefined'
        ? __DEV__ && process.env.EXPO_PUBLIC_ENABLE_SYNC_TRACE === '1'
        : false;
const TRACE_CONSOLE_ENABLED = false;
const TRACE_EMIT_BATCH_MS = 180;
const MAX_TRACE_ENTRIES = 120;

export type SyncTraceEntry = {
    id: string;
    ts: number;
    scope: string;
    event: string;
    data?: unknown;
};

export const isSyncTraceEnabled = (): boolean => TRACE_ENABLED;

let traceEntries: SyncTraceEntry[] = [];
const listeners = new Set<(entries: SyncTraceEntry[]) => void>();
let emitTimer: ReturnType<typeof setTimeout> | null = null;

const emitTraceEntries = () => {
    const snapshot = [...traceEntries];
    listeners.forEach(listener => listener(snapshot));
};

const scheduleTraceEntriesEmit = () => {
    if (emitTimer) return;
    emitTimer = setTimeout(() => {
        emitTimer = null;
        emitTraceEntries();
    }, TRACE_EMIT_BATCH_MS);
};

const safeNum = (value: unknown, fallback = 0): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const round4 = (value: unknown): number => Number(safeNum(value).toFixed(4));

const safeStringify = (data: unknown): string => {
    try {
        return JSON.stringify(data);
    } catch {
        return '[unserializable]';
    }
};

const baseTraceMessage = (scope: string, event: string): string => `[TRACE][${scope}] ${event}`;

export const formatSyncTraceEntryMessage = (entry: SyncTraceEntry): string => {
    const message = baseTraceMessage(entry.scope, entry.event);
    if (entry.data === undefined) return message;
    return `${message} ${safeStringify(entry.data)}`;
};

export const syncTrace = (scope: string, event: string, data?: unknown): void => {
    if (!TRACE_ENABLED) return;
    const entry: SyncTraceEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        scope,
        event,
        data,
    };
    traceEntries.push(entry);
    if (traceEntries.length > MAX_TRACE_ENTRIES) {
        traceEntries.splice(0, traceEntries.length - MAX_TRACE_ENTRIES);
    }
    scheduleTraceEntriesEmit();

    if (!TRACE_CONSOLE_ENABLED) return;

    const message = baseTraceMessage(scope, event);
    if (data === undefined) {
        console.log(message);
        return;
    }

    try {
        console.log(message, data);
    } catch {
        console.log(message);
    }
};

export const traceDuration = (
    scope: string,
    event: string,
    startedAt: number,
    data?: Record<string, unknown>
): number => {
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    syncTrace(scope, event, {
        ...(data || {}),
        elapsedMs,
    });
    return elapsedMs;
};

export const getSyncTraceEntries = (): SyncTraceEntry[] => [...traceEntries];

export const subscribeSyncTraceEntries = (
    listener: (entries: SyncTraceEntry[]) => void
): (() => void) => {
    if (!TRACE_ENABLED) {
        listener([]);
        return () => {};
    }

    listeners.add(listener);
    listener(getSyncTraceEntries());
    return () => {
        listeners.delete(listener);
    };
};

export const clearSyncTraceEntries = (): void => {
    if (!TRACE_ENABLED) return;
    if (emitTimer) {
        clearTimeout(emitTimer);
        emitTimer = null;
    }
    traceEntries = [];
    emitTraceEntries();
};

export const summarizeWallet = (wallet: any) => {
    if (!TRACE_ENABLED) return undefined;
    const lots = Array.isArray(wallet?.lots) ? wallet.lots : [];
    return {
        id: wallet?.id,
        tripId: wallet?.tripId ?? wallet?.trip_id,
        currency: wallet?.currency,
        version: safeNum(wallet?.version, 0),
        lastModified: safeNum(wallet?.lastModified ?? wallet?.updated_at ?? wallet?.updatedAt, 0),
        totalBudget: round4(wallet?.totalBudget ?? wallet?.total_budget),
        spentAmount: round4(wallet?.spentAmount ?? wallet?.spent_amount),
        lotsCount: lots.length,
        balance: round4(lots.reduce((sum: number, lot: any) => sum + safeNum(lot?.remainingAmount), 0)),
        lotBalances: lots.map((lot: any) => ({
            id: lot?.id,
            remaining: round4(lot?.remainingAmount),
            original: round4(lot?.originalConvertedAmount ?? lot?.convertedAmount),
            rate: round4(lot?.lockedRate),
        })),
    };
};

export const summarizeWallets = (wallets: any[] | undefined | null) =>
    TRACE_ENABLED ? (wallets ?? []).map(summarizeWallet) : undefined;

export const summarizeTrip = (trip: any) => {
    if (!TRACE_ENABLED) return null;
    if (!trip) return null;
    return {
        id: trip?.id,
        version: safeNum(trip?.version, 0),
        lastModified: safeNum(trip?.lastModified ?? trip?.last_modified ?? trip?.updated_at, 0),
        walletCount: Array.isArray(trip?.wallets) ? trip.wallets.length : 0,
        wallets: summarizeWallets(trip?.wallets),
    };
};

export const summarizeActivity = (activity: any) => {
    if (!TRACE_ENABLED) return null;
    if (!activity) return null;
    return {
        id: activity?.id,
        tripId: activity?.tripId ?? activity?.trip_id,
        walletId: activity?.walletId ?? activity?.wallet_id,
        isCompleted: !!(activity?.isCompleted ?? activity?.is_completed),
        version: safeNum(activity?.version, 0),
        lastModified: safeNum(activity?.lastModified ?? activity?.last_modified ?? activity?.updated_at, 0),
    };
};

export const summarizeExpenses = (expenses: any[] | undefined | null) =>
    TRACE_ENABLED ? (expenses ?? []).map(expense => ({
        id: expense?.id,
        tripId: expense?.tripId ?? expense?.trip_id,
        walletId: expense?.walletId ?? expense?.wallet_id,
        activityId: expense?.activityId ?? expense?.activity_id,
        amount: round4(expense?.amount),
        convertedAmountTrip: round4(expense?.convertedAmountTrip ?? expense?.converted_amount_trip),
        hasLotBreakdown: Array.isArray(expense?.lotBreakdown ?? expense?.lot_breakdown)
            ? (expense?.lotBreakdown ?? expense?.lot_breakdown).length > 0
            : false,
    })) : undefined;

export const summarizeFundingEvent = (event: any) => {
    if (!TRACE_ENABLED) return null;
    if (!event) return null;
    return {
        id: event?.id,
        tripId: event?.tripId ?? event?.trip_id,
        walletId: event?.walletId ?? event?.wallet_id,
        tripAmount: round4(event?.tripAmount ?? event?.trip_amount),
        homeAmount: round4(event?.homeAmount ?? event?.home_amount),
        rate: round4(event?.rate),
        version: safeNum(event?.version, 0),
        lastModified: safeNum(event?.lastModified ?? event?.last_modified ?? event?.updated_at, 0),
    };
};

export const summarizeFundingEvents = (events: any[] | undefined | null) =>
    TRACE_ENABLED ? (events ?? []).map(summarizeFundingEvent) : undefined;

export const summarizeRealtimePayload = (payload: any) => {
    if (!TRACE_ENABLED) return null;
    const row = payload?.new ?? payload?.old ?? null;
    return {
        eventType: payload?.eventType ?? 'UNKNOWN',
        id: row?.id,
        tripId: row?.trip_id ?? row?.tripId,
        version: safeNum(row?.version, 0),
        lastDeviceId: row?.last_device_id ?? row?.lastDeviceId ?? null,
        keys: row ? Object.keys(row).sort() : [],
    };
};
