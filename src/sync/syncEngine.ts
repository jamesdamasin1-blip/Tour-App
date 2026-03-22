/**
 * SYNC ENGINE v2 — Push-first, version-aware, soft-delete sync orchestrator.
 *
 * Strategy:
 * 1. Push local pending changes to Supabase (soft delete, not hard delete)
 * 2. Pull remote updates (filter deleted_at IS NULL for live records)
 * 3. Version-based conflict resolution (incoming.version > local.version)
 * 4. Detect remote soft-deletes and remove locally
 *
 * HARD DELETES ARE FORBIDDEN. All deletions use soft delete (deleted_at = now()).
 */
import { getAuthState, type AuthState } from '../auth/googleAuth';
import { getDB, getSyncMeta, markSynced, setSyncMeta } from '../storage/localDB';
import { supabase } from '../utils/supabase';
import { getPendingEvents, getRetryableEvents, markDone, markFailed, markProcessing, pruneCompletedEvents } from './syncQueue';

type SyncStatus = 'idle' | 'syncing' | 'error';

let _syncStatus: SyncStatus = 'idle';
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _syncRunning = false; // guard against concurrent sync runs
const SYNC_INTERVAL = 30_000; // 30 seconds

export const getSyncStatus = () => _syncStatus;

// ─── Column Mappers (camelCase → snake_case per table) ────────────

const mapTripToSupabase = (data: any) => ({
    id: data.id,
    title: data.title,
    destination: data.destination,
    start_date: data.startDate,
    end_date: data.endDate,
    home_country: data.homeCountry,
    home_currency: data.homeCurrency,
    wallets: data.wallets,
    total_budget_home_cached: data.totalBudgetHomeCached,
    countries: data.countries,
    members: data.members,
    is_completed: data.isCompleted,
    last_modified: data.lastModified,
});

const mapActivityToSupabase = (data: any) => ({
    id: data.id,
    trip_id: data.tripId,
    wallet_id: data.walletId,
    title: data.title,
    category: data.category,
    date: data.date,
    time: data.time,
    end_time: data.endTime,
    allocated_budget: data.allocatedBudget,
    budget_currency: data.budgetCurrency,
    is_completed: data.isCompleted,
    last_modified: data.lastModified,
    description: data.description,
    location: data.location,
    countries: data.countries,
    created_by: data.createdBy,
    last_modified_by: data.lastModifiedBy,
});

const mapExpenseToSupabase = (data: any) => ({
    id: data.id,
    trip_id: data.tripId,
    activity_id: data.activityId,
    wallet_id: data.walletId,
    name: data.name,
    amount: data.amount,
    currency: data.currency,
    converted_amount_home: data.convertedAmountHome,
    converted_amount_trip: data.convertedAmountTrip,
    category: data.category,
    time: data.time,
    date: data.date,
    original_amount: data.originalAmount,
    original_currency: data.originalCurrency,
    created_by: data.createdBy,
    last_modified_by: data.lastModifiedBy,
});

const mapWalletToSupabase = (data: any) => ({
    id: data.id,
    trip_id: data.tripId,
    currency: data.currency,
    total_budget: data.totalBudget,
    spent_amount: data.spentAmount,
    lots: data.lots,
    baseline_exchange_rate: data.baselineExchangeRate,
    default_rate: data.defaultRate,
});

const mapFundingLotToSupabase = (data: any) => ({
    id: data.id,
    wallet_id: data.walletId,
    trip_id: data.tripId,
    source_currency: data.sourceCurrency,
    target_currency: data.targetCurrency,
    source_amount: data.sourceAmount,
    rate: data.rate,
    notes: data.notes,
    created_at: data.createdAt,
});

/** Map local payload to Supabase-ready columns */
const mapToSupabase = (tableName: string, data: any): Record<string, any> => {
    switch (tableName) {
        case 'trips': return mapTripToSupabase(data);
        case 'activities': return mapActivityToSupabase(data);
        case 'expenses': return mapExpenseToSupabase(data);
        case 'wallets': return mapWalletToSupabase(data);
        case 'funding_lots': return mapFundingLotToSupabase(data);
        default: return data;
    }
};

// ─── Sync Logic ───────────────────────────────────────────────────

/** Main sync loop — called when online and authenticated */
export const runSync = async (): Promise<{ pushed: number; pulled: number }> => {
    // Prevent concurrent sync runs
    if (_syncRunning) {
        console.log('[SyncEngine] Skipped — sync already in progress');
        return { pushed: 0, pulled: 0 };
    }

    const auth = await getAuthState();
    if (!auth.isAuthenticated || !auth.userId) {
        console.log('[SyncEngine] Skipped — not authenticated');
        return { pushed: 0, pulled: 0 };
    }

    _syncRunning = true;
    _syncStatus = 'syncing';
    let pushed = 0;
    let pulled = 0;

    try {
        pushed = await pushPendingChanges(auth);
        pulled = await pullRemoteUpdates(auth);
        pruneCompletedEvents();
        _syncStatus = 'idle';
        console.log(`[SyncEngine] Done — pushed=${pushed}, pulled=${pulled}`);
    } catch (err) {
        console.error('[SyncEngine] Sync failed:', err);
        _syncStatus = 'error';
    } finally {
        _syncRunning = false;
    }

    return { pushed, pulled };
};

/** Push all pending events to Supabase — SOFT DELETE ONLY */
const pushPendingChanges = async (auth: AuthState): Promise<number> => {
    const events = [...getPendingEvents(), ...getRetryableEvents()];
    if (events.length > 0) {
        console.log(`[SyncEngine] Pushing ${events.length} events...`);
    }
    let pushed = 0;

    for (const event of events) {
        markProcessing(event.id);
        try {
            const payload = JSON.parse(event.payload);
            const table = mapTableName(event.table_name);

            if (event.type === 'DELETE') {
                // SOFT DELETE: set deleted_at instead of actual DELETE
                const { error } = await supabase.from(table).update({
                    deleted_at: new Date().toISOString(),
                    updated_by: auth.userId,
                }).eq('id', event.recordId);

                if (error) throw error;
            } else {
                const mapped = mapToSupabase(event.table_name, payload);
                const { error } = await supabase.from(table).upsert({
                    ...mapped,
                    user_id: auth.userId,
                    updated_by: auth.userId,
                    updated_at: event.timestamp,
                    // Don't send version — let the DB trigger auto-increment it
                });
                if (error) throw error;
            }

            console.log(`[SyncEngine] Pushed ${event.type} ${event.table_name}/${event.recordId}`);
            markDone(event.id);
            markSynced(event.table_name, event.recordId);
            pushed++;
        } catch (err) {
            console.error(`[SyncEngine] Push FAILED ${event.type} ${event.table_name}/${event.recordId}:`, err);
            markFailed(event.id);
        }
    }

    return pushed;
};

// ─── Store update callback ────────────────────────────────────────
type OnRemoteUpdateFn = (data: {
    trips?: any[];
    activities?: any[];
    expenses?: any[];
    sharedTripIds?: string[];
    currentUserId?: string;
    /** IDs of records that were soft-deleted on the server */
    deletedActivityIds?: string[];
    deletedExpenseIds?: string[];
    deletedTripIds?: string[];
}) => void;

let _onRemoteUpdate: OnRemoteUpdateFn | null = null;

/** Register a callback that updates the Zustand store after a pull. */
export const onRemoteUpdate = (cb: OnRemoteUpdateFn) => { _onRemoteUpdate = cb; };

// ─── snake_case → camelCase mappers for pulled data ───────────────

const mapTripFromSupabase = (r: any) => ({
    id: r.id,
    userId: r.user_id || undefined,
    title: r.title,
    destination: r.destination,
    startDate: Number(r.start_date),
    endDate: Number(r.end_date),
    homeCountry: r.home_country,
    homeCurrency: r.home_currency,
    wallets: r.wallets || [],
    totalBudgetHomeCached: Number(r.total_budget_home_cached || 0),
    tripCurrency: r.wallets?.[0]?.currency || r.home_currency,
    totalBudgetTrip: r.wallets?.[0]?.totalBudget || 0,
    totalBudget: (r.wallets || []).reduce(
        (acc: number, w: any) => acc + (w.totalBudget / (w.defaultRate || 1)), 0
    ),
    currency: r.wallets?.[0]?.currency || r.home_currency,
    countries: r.countries || [],
    members: r.members || [],
    isCompleted: r.is_completed || false,
    lastModified: Number(r.last_modified || Date.now()),
    isCloudSynced: true,
    version: Number(r.version || 1),
    updatedBy: r.updated_by || undefined,
    deletedAt: r.deleted_at || null,
});

const mapActivityFromSupabase = (a: any) => ({
    id: a.id,
    tripId: a.trip_id,
    walletId: a.wallet_id,
    title: a.title,
    category: a.category,
    date: Number(a.date),
    time: Number(a.time),
    endTime: a.end_time ? Number(a.end_time) : undefined,
    allocatedBudget: Number(a.allocated_budget),
    budgetCurrency: a.budget_currency || 'PHP',
    isCompleted: a.is_completed,
    lastModified: Number(a.last_modified),
    description: a.description,
    location: a.location,
    countries: a.countries || [],
    createdBy: a.created_by,
    lastModifiedBy: a.last_modified_by,
    expenses: [] as any[],
    version: Number(a.version || 1),
    updatedBy: a.updated_by || undefined,
    deletedAt: a.deleted_at || null,
});

const mapExpenseFromSupabase = (e: any) => ({
    id: e.id,
    tripId: e.trip_id,
    walletId: e.wallet_id,
    activityId: e.activity_id,
    name: e.name,
    amount: Number(e.amount),
    currency: e.currency,
    convertedAmountHome: Number(e.converted_amount_home),
    convertedAmountTrip: Number(e.converted_amount_trip),
    category: e.category,
    time: Number(e.time),
    date: Number(e.date),
    originalAmount: e.original_amount ? Number(e.original_amount) : undefined,
    originalCurrency: e.original_currency,
    createdBy: e.created_by,
    lastModifiedBy: e.last_modified_by,
    version: Number(e.version || 1),
    updatedBy: e.updated_by || undefined,
    deletedAt: e.deleted_at || null,
});

/** Pull remote changes — version-aware, soft-delete aware */
const pullRemoteUpdates = async (auth: AuthState): Promise<number> => {
    const lastSync = getSyncMeta('lastPullTimestamp');
    const since = lastSync ? parseInt(lastSync) : 0;
    let pulled = 0;

    // ── Pull trips (owned + member-of), ALIVE records ──────────
    const memberFilter = `[{"userId":"${auth.userId}"}]`;
    let tripQuery = supabase
        .from('trips')
        .select('*')
        .is('deleted_at', null)
        .or(`user_id.eq.${auth.userId},members.cs.${memberFilter}`);

    if (since > 0) {
        tripQuery = tripQuery.gt('updated_at', since);
    }

    const { data: remoteTrips, error: tripErr } = await tripQuery;
    if (tripErr) console.error('[SyncEngine] Trip pull error:', tripErr.message);
    const pulledTrips: any[] = [];

    if (remoteTrips?.length) {
        for (const remote of remoteTrips) {
            pulledTrips.push(mapTripFromSupabase(remote));
            pulled++;
        }
    }

    // ── Detect soft-deleted trips ──────────────────────────────
    const deletedTripIds: string[] = [];
    if (since > 0) {
        const { data: deletedTrips } = await supabase
            .from('trips')
            .select('id')
            .not('deleted_at', 'is', null)
            .gt('updated_at', since)
            .or(`user_id.eq.${auth.userId},members.cs.${memberFilter}`);

        if (deletedTrips?.length) {
            for (const dt of deletedTrips) {
                deletedTripIds.push(dt.id);
            }
        }
    }

    // Collect all trip IDs
    const db = getDB();
    const localTrips = db.getAllSync<{ id: string }>('SELECT id FROM trips');
    const allTripIds = [...new Set([
        ...localTrips.map(r => r.id),
        ...pulledTrips.map(t => t.id),
    ])];

    console.log(`[SyncEngine] Pull: ${pulledTrips.length} trips, ${deletedTripIds.length} deleted, ${allTripIds.length} total IDs`);

    // ── Pull ALIVE activities & expenses for shared trips ──────
    const pulledActivities: any[] = [];
    const pulledExpenses: any[] = [];
    const deletedActivityIds: string[] = [];
    const deletedExpenseIds: string[] = [];

    if (allTripIds.length > 0) {
        // Activities — alive only
        const { data: remoteActivities, error: actErr } = await supabase
            .from('activities')
            .select('*')
            .is('deleted_at', null)
            .in('trip_id', allTripIds);

        if (actErr) console.error('[SyncEngine] Activity pull error:', actErr.message);

        if (remoteActivities) {
            for (const remote of remoteActivities) {
                pulledActivities.push(mapActivityFromSupabase(remote));
            }
            pulled += remoteActivities.length;
        }

        // Detect soft-deleted activities
        if (since > 0) {
            const { data: deletedActs } = await supabase
                .from('activities')
                .select('id')
                .not('deleted_at', 'is', null)
                .gt('updated_at', since)
                .in('trip_id', allTripIds);

            if (deletedActs?.length) {
                for (const da of deletedActs) {
                    deletedActivityIds.push(da.id);
                }
            }
        }

        // Expenses — alive only
        const { data: remoteExpenses, error: expErr } = await supabase
            .from('expenses')
            .select('*')
            .is('deleted_at', null)
            .in('trip_id', allTripIds);

        if (expErr) console.error('[SyncEngine] Expense pull error:', expErr.message);

        if (remoteExpenses) {
            for (const remote of remoteExpenses) {
                pulledExpenses.push(mapExpenseFromSupabase(remote));
            }
            pulled += remoteExpenses.length;
        }

        // Detect soft-deleted expenses
        if (since > 0) {
            const { data: deletedExps } = await supabase
                .from('expenses')
                .select('id')
                .not('deleted_at', 'is', null)
                .gt('updated_at', since)
                .in('trip_id', allTripIds);

            if (deletedExps?.length) {
                for (const de of deletedExps) {
                    deletedExpenseIds.push(de.id);
                }
            }
        }
    }

    console.log(`[SyncEngine] Pulled ${pulledActivities.length} activities, ${pulledExpenses.length} expenses, soft-deleted: ${deletedActivityIds.length} act / ${deletedExpenseIds.length} exp`);

    // ── Update Zustand store ──────────────────────────────────
    if (_onRemoteUpdate) {
        _onRemoteUpdate({
            trips: pulledTrips.length > 0 ? pulledTrips : undefined,
            activities: pulledActivities,
            expenses: pulledExpenses,
            sharedTripIds: allTripIds,
            currentUserId: auth.userId!,
            deletedTripIds: deletedTripIds.length > 0 ? deletedTripIds : undefined,
            deletedActivityIds: deletedActivityIds.length > 0 ? deletedActivityIds : undefined,
            deletedExpenseIds: deletedExpenseIds.length > 0 ? deletedExpenseIds : undefined,
        });
    } else {
        console.warn('[SyncEngine] No onRemoteUpdate callback registered!');
    }

    setSyncMeta('lastPullTimestamp', Date.now().toString());
    return pulled;
};

/** Map local table names to Supabase table names */
const mapTableName = (local: string): string => {
    const map: Record<string, string> = {
        trips: 'trips',
        wallets: 'wallets',
        funding_lots: 'funding_lots',
        expenses: 'expenses',
        activities: 'activities',
    };
    return map[local] || local;
};

/** Start periodic sync (background) */
export const startSyncLoop = () => {
    if (_syncTimer) return;
    _syncTimer = setInterval(() => {
        runSync().catch(console.error);
    }, SYNC_INTERVAL);
};

/** Stop periodic sync */
export const stopSyncLoop = () => {
    if (_syncTimer) {
        clearInterval(_syncTimer);
        _syncTimer = null;
    }
};
