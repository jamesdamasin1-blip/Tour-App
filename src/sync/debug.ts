const TRACE_ENABLED = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const MAX_TRACE_ENTRIES = 120;

export type SyncTraceEntry = {
    id: string;
    ts: number;
    scope: string;
    event: string;
    message: string;
    data?: unknown;
};

let traceEntries: SyncTraceEntry[] = [];
const listeners = new Set<(entries: SyncTraceEntry[]) => void>();

const emitTraceEntries = () => {
    const snapshot = [...traceEntries];
    listeners.forEach(listener => listener(snapshot));
};

const safeNum = (value: unknown, fallback = 0): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const round4 = (value: unknown): number => Number(safeNum(value).toFixed(4));

export const syncTrace = (scope: string, event: string, data?: unknown): void => {
    if (!TRACE_ENABLED) return;
    const message = data === undefined
        ? `[TRACE][${scope}] ${event}`
        : `[TRACE][${scope}] ${event} ${safeStringify(data)}`;
    const entry: SyncTraceEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        scope,
        event,
        message,
        data,
    };
    traceEntries = [...traceEntries, entry].slice(-MAX_TRACE_ENTRIES);
    emitTraceEntries();

    if (data === undefined) {
        console.log(message);
        return;
    }

    try {
        console.log(message);
    } catch {
        console.log(`[TRACE][${scope}] ${event}`, data);
    }
};

const safeStringify = (data: unknown): string => {
    try {
        return JSON.stringify(data);
    } catch {
        return '[unserializable]';
    }
};

export const getSyncTraceEntries = (): SyncTraceEntry[] => [...traceEntries];

export const subscribeSyncTraceEntries = (
    listener: (entries: SyncTraceEntry[]) => void
): (() => void) => {
    listeners.add(listener);
    listener(getSyncTraceEntries());
    return () => {
        listeners.delete(listener);
    };
};

export const clearSyncTraceEntries = (): void => {
    traceEntries = [];
    emitTraceEntries();
};

export const summarizeWallet = (wallet: any) => {
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
    (wallets ?? []).map(summarizeWallet);

export const summarizeTrip = (trip: any) => {
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
    (expenses ?? []).map(expense => ({
        id: expense?.id,
        tripId: expense?.tripId ?? expense?.trip_id,
        walletId: expense?.walletId ?? expense?.wallet_id,
        activityId: expense?.activityId ?? expense?.activity_id,
        amount: round4(expense?.amount),
        convertedAmountTrip: round4(expense?.convertedAmountTrip ?? expense?.converted_amount_trip),
        hasLotBreakdown: Array.isArray(expense?.lotBreakdown ?? expense?.lot_breakdown)
            ? (expense?.lotBreakdown ?? expense?.lot_breakdown).length > 0
            : false,
    }));

export const summarizeFundingEvent = (event: any) => {
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
    (events ?? []).map(summarizeFundingEvent);

export const summarizeRealtimePayload = (payload: any) => {
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
