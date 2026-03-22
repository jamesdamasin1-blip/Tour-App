/**
 * STORE INTEGRATION — Bridges Zustand store mutations with the sync queue.
 * Call these wrappers to ensure every mutation is both applied locally
 * AND enqueued for eventual cloud sync.
 *
 * The store remains the in-memory source of truth during runtime.
 * The sync queue ensures persistence + cloud backup.
 */
import { enqueueSync } from './syncQueue';
import { upsertRecord, deleteRecord as deleteLocalRecord } from '../storage/localDB';
import { runSync } from './syncEngine';

/** Debounced immediate sync — coalesces rapid mutations into a single push */
let _syncTimeout: ReturnType<typeof setTimeout> | null = null;
const debouncedSync = () => {
    if (_syncTimeout) clearTimeout(_syncTimeout);
    _syncTimeout = setTimeout(() => {
        _syncTimeout = null;
        runSync().catch(console.error);
    }, 500);
};

type MutationType = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Record a mutation: persist to local DB + enqueue for sync.
 * Call this AFTER the Zustand state update succeeds.
 */
export const recordMutation = (
    type: MutationType,
    tableName: string,
    recordId: string,
    data: Record<string, any>,
    extra: Record<string, any> = {}
) => {
    if (type === 'DELETE') {
        deleteLocalRecord(tableName, recordId);
    } else {
        upsertRecord(tableName, recordId, data, extra);
    }

    enqueueSync(type, tableName, recordId, data);

    // Trigger immediate push so other devices see the change in real-time
    debouncedSync();
};

// ─── Convenience wrappers for each entity ────────────────────────

export const syncTrip = (tripData: any) => {
    recordMutation('INSERT', 'trips', tripData.id, tripData, {
        userId: tripData.userId,
        deviceId: tripData.deviceId,
    });
};

export const syncTripUpdate = (tripId: string, tripData: any) => {
    recordMutation('UPDATE', 'trips', tripId, tripData);
};

export const syncTripDelete = (tripId: string) => {
    recordMutation('DELETE', 'trips', tripId, { id: tripId });
};

export const syncActivity = (activityData: any) => {
    recordMutation('INSERT', 'activities', activityData.id, activityData, {
        tripId: activityData.tripId,
        walletId: activityData.walletId,
    });
};

export const syncActivityUpdate = (activityId: string, activityData: any) => {
    recordMutation('UPDATE', 'activities', activityId, activityData, {
        tripId: activityData.tripId,
        walletId: activityData.walletId,
    });
};

export const syncActivityDelete = (activityId: string) => {
    recordMutation('DELETE', 'activities', activityId, { id: activityId });
};

export const syncExpense = (expenseData: any) => {
    recordMutation('INSERT', 'expenses', expenseData.id, expenseData, {
        walletId: expenseData.walletId,
        tripId: expenseData.tripId,
        activityId: expenseData.activityId,
    });
};

export const syncExpenseUpdate = (expenseId: string, expenseData: any) => {
    recordMutation('UPDATE', 'expenses', expenseId, expenseData, {
        walletId: expenseData.walletId,
        tripId: expenseData.tripId,
        activityId: expenseData.activityId,
    });
};

export const syncExpenseDelete = (expenseId: string) => {
    recordMutation('DELETE', 'expenses', expenseId, { id: expenseId });
};

export const syncExchangeEvent = (eventData: any) => {
    recordMutation('INSERT', 'funding_lots', eventData.id, eventData, {
        walletId: eventData.walletId,
        tripId: eventData.tripId,
    });
};

export const syncWallet = (walletData: any) => {
    recordMutation('INSERT', 'wallets', walletData.id, walletData, {
        tripId: walletData.tripId,
    });
};

export const syncWalletUpdate = (walletId: string, walletData: any) => {
    recordMutation('UPDATE', 'wallets', walletId, walletData, {
        tripId: walletData.tripId,
    });
};
