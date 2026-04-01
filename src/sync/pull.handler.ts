/**
 * PULL SYNC HANDLER
 * Processes the result of pullRemoteUpdates(): merges authoritative cloud rows
 * into the local cache with version-aware conflict handling.
 *
 * This is the batch-pull mirror of sync/realtime/*.handler.ts.
 * Wallet lots remain server-authoritative; local code only recomputes derived
 * spent totals from the refreshed expense ledger.
 */
import { useStore } from '../store/useStore';
import { recomputeWalletSpent } from '../store/storeHelpers';
import { deleteRecord, getDB, upsertRecord } from '../storage/localDB';

type PullPayload = {
    trips?: any[]; activities?: any[]; expenses?: any[]; wallets?: any[];
    sharedTripIds?: string[]; currentUserId?: string;
    deletedTripIds?: string[]; deletedActivityIds?: string[]; deletedExpenseIds?: string[];
};
const DEBUG_PULL_LOGS = false;

export function handlePullUpdate(data: PullPayload): void {
    const { trips, activities, expenses, wallets, sharedTripIds,
            deletedTripIds, deletedActivityIds, deletedExpenseIds } = data;
    if (DEBUG_PULL_LOGS) {
        console.log(`[SYNC] Pull: trips=${trips?.length ?? 0} act=${activities?.length ?? 0} exp=${expenses?.length ?? 0} wal=${wallets?.length ?? 0}`);
    }

    applyDeletions(deletedTripIds, deletedActivityIds, deletedExpenseIds);
    if (trips?.length)        applyTrips(trips);
    if (wallets?.length)      applyWallets(wallets);
    if (sharedTripIds?.length) {
        if (activities) applyActivities(activities, sharedTripIds);
        if (expenses)   applyExpenses(expenses, sharedTripIds);
    }
}

function applyDeletions(tripIds?: string[], activityIds?: string[], expenseIds?: string[]): void {
    if (tripIds?.length) {
        useStore.setState(s => ({
            trips:      s.trips.filter(t => !tripIds.includes(t.id)),
            activities: s.activities.filter(a => !tripIds.includes(a.tripId)),
            expenses:   s.expenses.filter(e => !tripIds.includes(e.tripId)),
        }));
        tripIds.forEach(id => deleteRecord('trips', id));
    }

    if (activityIds?.length) {
        useStore.setState(s => ({ activities: s.activities.filter(a => !activityIds.includes(a.id)) }));
        activityIds.forEach(id => deleteRecord('activities', id));
    }

    if (expenseIds?.length) {
        useStore.setState(s => {
            const del       = new Set(expenseIds);
            const remaining = s.expenses.filter(e => !del.has(e.id));
            const affected  = new Set(s.expenses.filter(e => del.has(e.id)).map(e => e.tripId));

            // Wallet lots are authoritative from the server — do NOT apply reverseFIFO
            // (local delta mutations). Recompute spentAmount purely from the remaining
            // expense ledger; the next wallet pull will correct lot remainingAmounts.
            const updatedTrips = s.trips.map(t => {
                if (!affected.has(t.id)) return t;
                const tripExpenses = remaining.filter(e => e.tripId === t.id);
                return { ...t, wallets: recomputeWalletSpent(t.wallets, tripExpenses, s.activities.filter(a => a.tripId === t.id)) };
            });
            return {
                expenses:   remaining,
                activities: s.activities.map(a => ({ ...a, expenses: a.expenses.filter(e => !del.has(e.id)) })),
                trips:      updatedTrips,
            };
        });
        expenseIds.forEach(id => deleteRecord('expenses', id));
    }
}

function applyTrips(remote: any[]): void {
    useStore.setState(s => {
        const updated = [...s.trips];
        for (const r of remote) {
            const idx = updated.findIndex(t => t.id === r.id);
            if (idx >= 0) {
                const local = updated[idx];
                if ((r.version ?? 0) > (local.version ?? 0)) {
                    // If the trip row itself is newer and carries wallets, trust that snapshot.
                    // This is important for member devices: activity completion mirrors updated
                    // wallet lots into trips.wallets so they can refresh even when the standalone
                    // wallets table event/pull lags. Preserving stale local lots here would
                    // discard the creator's newly deducted balance.
                    updated[idx] = {
                        ...local,
                        ...r,
                        wallets: r.wallets ?? local.wallets,
                    };
                    if (DEBUG_PULL_LOGS) {
                        console.log(`[MERGE] Trip ${r.id} remote v${r.version} > local v${local.version}`);
                    }
                }
            } else {
                updated.push(r);
            }
        }
        return { trips: updated };
    });
}

/** Apply pulled wallets into their parent trips — version-based merge.
 *  The wallets table is the source of truth for FIFO lot state.
 *  This replaces the fragile reverse-FIFO approach for cross-device sync. */
function applyWallets(remoteWallets: any[]): void {
    useStore.setState(s => {
        const walletsByTrip = new Map<string, any[]>();
        for (const rw of remoteWallets) {
            const tripId = rw.trip_id;
            if (!walletsByTrip.has(tripId)) walletsByTrip.set(tripId, []);
            walletsByTrip.get(tripId)!.push(rw);
        }

        const updatedTrips = s.trips.map(t => {
            const pulled = walletsByTrip.get(t.id);
            if (!pulled) return t;

            const updatedWallets = t.wallets.map(lw => {
                const rw = pulled.find(w => w.id === lw.id);
                if (!rw) return lw;
                const remoteVersion = Number(rw.version ?? 0);
                const localVersion = Number((lw as any).version ?? 0);
                if (remoteVersion <= localVersion) return lw;

                // Remote wallet is newer — take remote lots and fields,
                // but preserve local-only fields (country, createdAt).
                if (DEBUG_PULL_LOGS) {
                    console.log(`[MERGE] Wallet ${lw.id} remote v${remoteVersion} > local v${localVersion}`);
                }
                return {
                    ...lw,
                    lots: rw.lots ?? lw.lots,
                    spentAmount: rw.spent_amount ?? lw.spentAmount,
                    totalBudget: rw.total_budget ?? lw.totalBudget,
                    defaultRate: rw.default_rate ?? lw.defaultRate,
                    baselineExchangeRate: rw.baseline_exchange_rate ?? lw.baselineExchangeRate,
                    version: remoteVersion,
                };
            });

            // Recompute wallet spent from the expense ledger for consistency
            const tripExpenses = s.expenses.filter(e => e.tripId === t.id);
            return { ...t, wallets: recomputeWalletSpent(updatedWallets, tripExpenses, s.activities.filter(a => a.tripId === t.id)) };
        });

        return { trips: updatedTrips };
    });
}

function applyActivities(remote: any[], scopedTripIds?: string[]): void {
    const state = useStore.getState();
    const tripIds = new Set(scopedTripIds || state.trips.map(t => t.id));
    const remoteFiltered = remote.filter(a => tripIds.has(a.tripId));
    const remoteMap = new Map(remoteFiltered.map(a => [a.id, a]));

    // Safety: if remote returned nothing but we have local activities, skip eviction.
    // This prevents mass-deletion caused by server errors, RLS issues, or race conditions.
    const localInScopeCount = state.activities.filter(a => tripIds.has(a.tripId)).length;
    const skipEviction = remoteFiltered.length === 0 && localInScopeCount > 0;

    if (skipEviction) {
        console.warn(`[SYNC] Skipping activity eviction — remote returned 0 but ${localInScopeCount} local activities exist`);
    }

    // In a full sync of alive records, we should evict anything local that's missing from remote
    // UNLESS it's a fresh local mutation (still in the sync_queue).
    const db = getDB();
    const pendingIds = new Set(
        db.getAllSync('SELECT recordId FROM sync_queue WHERE status != "done" AND table_name = "activities"')
          .map((r: any) => r.recordId)
    );

    useStore.setState(s => {
        const localInScope = s.activities.filter(a => tripIds.has(a.tripId));
        const merged = [];

        // 1. Process remote records (merge/update)
        for (const [id, r] of remoteMap) {
            const local = localInScope.find(a => a.id === id);
            const wins  = !local || (r.version ?? 0) >= (local.version ?? 0);

            // Critical: preserve local expenses if remote doesn't carry them (which pull sync doesn't)
            merged.push(wins ? { ...r, expenses: (local?.expenses ?? []) } : local);
        }

        // 2. Process local records missing from remote (evict if not pending, and only if eviction is safe)
        for (const local of localInScope) {
            if (!remoteMap.has(local.id)) {
                if (skipEviction || pendingIds.has(local.id)) {
                    // Keep it — either remote was empty (unsafe to evict) or it's a pending mutation
                    if (DEBUG_PULL_LOGS && pendingIds.has(local.id)) console.log(`[SYNC] Preserving pending activity ${local.id}`);
                    merged.push(local);
                } else {
                    // Evict: it was deleted on server or unauthorized
                    console.warn(`[SYNC] Evicting orphaned activity ${local.id} (not in server pull)`);
                    deleteRecord('activities', local.id);
                }
            }
        }

        for (const a of merged as any[]) {
            upsertRecord('activities', a.id, a, { tripId: a.tripId, walletId: a.walletId ?? '' });
        }

        const newActivities = [...s.activities.filter(a => !tripIds.has(a.tripId)), ...merged];

        const updatedTrips = s.trips.map(t => {
            if (!tripIds.has(t.id)) return t;

            const tripExpenses = s.expenses.filter(e => e.tripId === t.id);
            return { ...t, wallets: recomputeWalletSpent(t.wallets, tripExpenses, newActivities.filter(a => a.tripId === t.id)) };
        });

        return { activities: newActivities, trips: updatedTrips };
    });
}

function applyExpenses(remote: any[], scopedTripIds?: string[]): void {
    const state = useStore.getState();
    const tripIds = new Set(scopedTripIds || state.trips.map(t => t.id));
    const remoteFiltered = remote.filter(e => tripIds.has(e.tripId));
    const remoteMap = new Map(remoteFiltered.map(e => [e.id, e]));

    const localInScopeCount = state.expenses.filter(e => tripIds.has(e.tripId)).length;
    const skipEviction = remoteFiltered.length === 0 && localInScopeCount > 0;

    if (skipEviction) {
        console.warn(`[SYNC] Skipping expense eviction — remote returned 0 but ${localInScopeCount} local expenses exist`);
    }

    const db = getDB();
    const pendingIds = new Set(
        db.getAllSync('SELECT recordId FROM sync_queue WHERE status != "done" AND table_name = "expenses"')
          .map((r: any) => r.recordId)
    );

    useStore.setState(s => {
        const localInScope = s.expenses.filter(e => tripIds.has(e.tripId));
        const merged: any[] = [];

        for (const [id, r] of remoteMap) {
            const local = localInScope.find(e => e.id === id);
            merged.push(!local || (r.version ?? 0) >= (local.version ?? 0) ? r : local);
        }

        for (const local of localInScope) {
            if (!remoteMap.has(local.id)) {
                if (skipEviction || pendingIds.has(local.id)) {
                    if (pendingIds.has(local.id)) merged.push(local);
                    else merged.push(local);
                } else {
                    console.warn(`[SYNC] Evicting orphaned expense ${local.id}`);
                    deleteRecord('expenses', local.id);
                }
            }
        }

        for (const e of merged) upsertRecord('expenses', e.id, e, { tripId: e.tripId, walletId: e.walletId ?? '', activityId: e.activityId ?? '' });

        const allExpenses = [...s.expenses.filter(e => !tripIds.has(e.tripId)), ...merged];
        const updatedActivities = s.activities.map(a =>
            tripIds.has(a.tripId) ? { ...a, expenses: allExpenses.filter(e => e.activityId === a.id) } : a
        );

        // Wallet lots are authoritative from the server (applyWallets runs before this).
        // Do NOT apply FIFO here — it would double-count deductions on lots that already
        // reflect these expenses. Only recompute spentAmount from the updated expense ledger.
        const updatedTrips = s.trips.map(t => {
            if (!tripIds.has(t.id)) return t;

            const tripExpenses = allExpenses.filter(e => e.tripId === t.id);
            return { ...t, wallets: recomputeWalletSpent(t.wallets, tripExpenses, updatedActivities.filter(a => a.tripId === t.id)) };
        });

        return { expenses: allExpenses, activities: updatedActivities, trips: updatedTrips };
    });
}
