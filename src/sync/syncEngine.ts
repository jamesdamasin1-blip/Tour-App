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
import { mapTripFromDb, mapTripToDb } from '../mappers/trip.mapper';
import { mapActivityFromDb, mapActivityToDb } from '../mappers/activity.mapper';
import { mapExpenseFromDb, mapExpenseToDb } from '../mappers/expense.mapper';
import { mapWalletToDb, mapFundingLotToDb } from '../mappers/wallet.mapper';

type SyncStatus = 'idle' | 'syncing' | 'error';

let _syncStatus: SyncStatus = 'idle';
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _syncRunning = false; // guard against concurrent sync runs
let _syncRequested = false; // flag to trigger another run after current completes
const SYNC_INTERVAL = 8_000; // 8 seconds — fast enough for near-real-time fallback

export const getSyncStatus = () => _syncStatus;

/**
 * Push-only sync — pushes pending local changes to Supabase without pulling.
 * Used for immediate cross-device sync after local edits.
 */
export const pushNow = async (): Promise<number> => {
    if (_syncRunning) {
        _syncRequested = true;
        return 0;
    }

    const auth = await getAuthState();
    if (!auth.isAuthenticated || !auth.userId) return 0;

    _syncRunning = true;
    let pushedTotal = 0;
    try {
        do {
            _syncRequested = false;
            const pushed = await pushPendingChanges(auth);
            pushedTotal += pushed;
            if (pushed > 0) pruneCompletedEvents();
        } while (_syncRequested);
    } catch (err) {
        console.error('[SyncEngine] pushNow failed:', err);
    } finally {
        _syncRunning = false;
    }
    return pushedTotal;
};

// ─── Column Mappers (delegated to mappers/) ───────────────────────

/** Map local payload to Supabase-ready columns (camelCase → snake_case). */
const mapToSupabase = (tableName: string, data: any): Record<string, any> => {
    switch (tableName) {
        case 'trips':        return mapTripToDb(data);
        case 'activities':   return mapActivityToDb(data);
        case 'expenses':     return mapExpenseToDb(data);
        case 'wallets':      return mapWalletToDb(data);
        case 'funding_lots': return mapFundingLotToDb(data);
        default:             return data;
    }
};

// ─── Sync Logic ───────────────────────────────────────────────────

/** Main sync loop — called when online and authenticated */
export const runSync = async (): Promise<{ pushed: number; pulled: number }> => {
    // If a sync is already running, just mark that we want another one after.
    // This handles the race condition where a mutation happens while we are pulling remote updates.
    if (_syncRunning) {
        _syncRequested = true;
        console.log('[SyncEngine] Queued follow-up sync');
        return { pushed: 0, pulled: 0 };
    }
    
    _syncRunning = true;
    _syncStatus = 'syncing';
    let pushedTotal = 0;
    let pulledTotal = 0;

    try {
        const auth = await getAuthState();
        if (!auth.isAuthenticated || !auth.userId) {
            console.log('[SyncEngine] Skipped — not authenticated');
            return { pushed: 0, pulled: 0 };
        }

        // Keep running as long as new requests come in during the active cycle
        do {
            _syncRequested = false;
            
            const pushed = await pushPendingChanges(auth);
            const pulled = await pullRemoteUpdates(auth);
            
            pushedTotal += pushed;
            pulledTotal += pulled;
            
            if (pushed > 0) pruneCompletedEvents();
            
            _syncStatus = 'idle';
        } while (_syncRequested);
        
        console.log(`[SyncEngine] Done — totalPushed=${pushedTotal}, totalPulled=${pulledTotal}`);
    } catch (err) {
        console.error('[SyncEngine] Sync failed:', err);
        _syncStatus = 'error';
    } finally {
        _syncRunning = false;
    }

    return { pushed: pushedTotal, pulled: pulledTotal };
};

/** Push all pending events to Supabase — SOFT DELETE ONLY */
const pushPendingChanges = async (auth: AuthState): Promise<number> => {
    const events = [...getPendingEvents(), ...getRetryableEvents()];
    if (events.length > 0) {
        const pending = getPendingEvents().length;
        const failed = getRetryableEvents().length;
        console.log(`[SyncEngine] Pushing ${events.length} events... (Pending: ${pending}, Retrying: ${failed})`);
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
                const upsertPayload: any = {
                    ...mapped,
                    updated_by: auth.userId,
                    updated_at: event.timestamp,
                    last_device_id: auth.deviceId,
                    // Don't send version — let the DB trigger auto-increment it
                };
                
                // Only explicitely set user_id for newly created rows. Otherwise let Postgres preserve it.
                if (event.type === 'INSERT') {
                    upsertPayload.user_id = auth.userId;
                }

                // ⏱ T1: about to hit Supabase
                const t1 = Date.now();
                console.log(`[SYNC_TIMING] T1_PUSH_START ${event.table_name}/${event.recordId} t=${t1}`);
                const { error } = await supabase.from(table).upsert(upsertPayload);
                console.log(`[SYNC_TIMING] T1_PUSH_DONE ${event.table_name}/${event.recordId} elapsed=${Date.now() - t1}ms`);
                if (error) throw error;
            }

            console.log(`[SyncEngine] Pushed ${event.type} ${event.table_name}/${event.recordId}`);
            markDone(event.id);
            markSynced(event.table_name, event.recordId);
            pushed++;
        } catch (err: any) {
            console.error(`[SyncEngine] Push FAILED ${event.type} ${event.table_name}/${event.recordId}:`, 
                err?.message || err, 
                err?.details || '');
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
    wallets?: any[];
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

// ─── Pull-side mappers (snake_case → camelCase, delegated to mappers/) ──────
// mapTripFromDb, mapActivityFromDb, mapExpenseFromDb are imported at top of file.

/** Pull remote changes — version-aware, soft-delete aware */
const pullRemoteUpdates = async (auth: AuthState): Promise<number> => {
    const lastSync = getSyncMeta('lastPullTimestamp');
    // updated_at is bigint (Unix ms) — compare with Unix ms, not ISO strings.
    let since: string | null = null;
    if (lastSync) {
        const asNum = Number(lastSync);
        if (!isNaN(asNum) && asNum > 1_000_000_000_000) {
            // Already Unix ms
            since = String(asNum);
        } else if (lastSync.includes('T') || lastSync.includes('-')) {
            // Legacy ISO string — convert to Unix ms for bigint comparison
            since = String(new Date(lastSync).getTime());
        }
        // else: invalid — treat as first sync (since stays null)
    }

    // Add 1s clock-skew buffer to ensure we don't miss records committed slightly before the last pull
    if (since) {
        since = String(Number(since) - 1000);
    }
    let pulled = 0;

    // ── Pull trips (owned + member-of), ALIVE records ──────────
    const memberFilter = `[{"userId":"${auth.userId}"}]`;
    let tripQuery = supabase
        .from('trips')
        .select('*')
        .is('deleted_at', null)
        .or(`user_id.eq.${auth.userId},members.cs.${memberFilter}`);

    if (since) {
        tripQuery = tripQuery.gt('updated_at', since);
    }

    const { data: remoteTrips, error: tripErr } = await tripQuery;
    if (tripErr) console.error('[SyncEngine] Trip pull error:', tripErr.message);
    const pulledTrips: any[] = [];

    if (remoteTrips?.length) {
        for (const remote of remoteTrips) {
            pulledTrips.push(mapTripFromDb(remote));
            pulled++;
        }
    }

    // ── Detect soft-deleted trips ──────────────────────────────
    const deletedTripIds: string[] = [];
    if (since) {
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
                pulledActivities.push({ ...mapActivityFromDb(remote), expenses: [] });
            }
            pulled += remoteActivities.length;
        }

        // Detect soft-deleted activities
        if (since) {
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
                pulledExpenses.push(mapExpenseFromDb(remote));
            }
            pulled += remoteExpenses.length;
        }

        // Detect soft-deleted expenses
        if (since) {
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

    // ── Pull wallets — authoritative for FIFO lot state ─────
    let pulledWallets: any[] = [];
    if (allTripIds.length > 0) {
        const { data: remoteWallets, error: walErr } = await supabase
            .from('wallets')
            .select('*')
            .is('deleted_at', null)
            .in('trip_id', allTripIds);

        if (walErr) console.error('[SyncEngine] Wallet pull error:', walErr.message);
        if (remoteWallets?.length) {
            pulledWallets = remoteWallets;
            pulled += remoteWallets.length;
        }
    }

    console.log(`[SyncEngine] Pulled ${pulledActivities.length} activities, ${pulledExpenses.length} expenses, ${pulledWallets.length} wallets, soft-deleted: ${deletedActivityIds.length} act / ${deletedExpenseIds.length} exp`);

    // ── Update Zustand store ──────────────────────────────────
    if (_onRemoteUpdate) {
        _onRemoteUpdate({
            trips: pulledTrips.length > 0 ? pulledTrips : undefined,
            activities: pulledActivities.length > 0 ? pulledActivities : undefined,
            expenses: pulledExpenses.length > 0 ? pulledExpenses : undefined,
            wallets: pulledWallets.length > 0 ? pulledWallets : undefined,
            sharedTripIds: allTripIds,
            currentUserId: auth.userId!,
            deletedTripIds: deletedTripIds.length > 0 ? deletedTripIds : undefined,
            deletedActivityIds: deletedActivityIds.length > 0 ? deletedActivityIds : undefined,
            deletedExpenseIds: deletedExpenseIds.length > 0 ? deletedExpenseIds : undefined,
        });
    } else {
        console.warn('[SyncEngine] No onRemoteUpdate callback registered!');
    }

    setSyncMeta('lastPullTimestamp', String(Date.now()));
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

/**
 * HARD REFETCH STRATEGY
 * Fetch all activities and expenses for a trip directly from the DB.
 * Bypasses the sync queue and immediately replaces local state, which then 
 * recalculates the wallet total directly from this authoritative pull.
 */
export const refetchTripActivities = async (tripId: string): Promise<void> => {
    const auth = await getAuthState();
    if (!auth.isAuthenticated || !auth.userId) return;

    // Fetch activities
    const { data: remoteActivities, error: actErr } = await supabase
        .from('activities')
        .select('*')
        .is('deleted_at', null)
        .eq('trip_id', tripId);
        
    if (actErr) {
        console.error('[SyncEngine] refetchTripActivities pull activities error:', actErr.message);
        return;
    }

    // Fetch expenses
    const { data: remoteExpenses, error: expErr } = await supabase
        .from('expenses')
        .select('*')
        .is('deleted_at', null)
        .eq('trip_id', tripId);

    if (expErr) {
        console.error('[SyncEngine] refetchTripActivities pull expenses error:', expErr.message);
        return;
    }

    // Fetch wallets
    const { data: remoteWallets, error: walErr } = await supabase
        .from('wallets')
        .select('*')
        .is('deleted_at', null)
        .eq('trip_id', tripId);

    if (walErr) {
        console.error('[SyncEngine] refetchTripActivities pull wallets error:', walErr.message);
    }

    const pulledActivities = (remoteActivities || []).map(a => ({ ...mapActivityFromDb(a), expenses: [] }));
    const pulledExpenses = (remoteExpenses || []).map(mapExpenseFromDb);

    if (_onRemoteUpdate) {
        _onRemoteUpdate({
            activities: pulledActivities,
            expenses: pulledExpenses,
            wallets: remoteWallets || [],
            sharedTripIds: [tripId], // Safe now, scoping isolates the eviction
            currentUserId: auth.userId,
        });
    } else {
        console.warn('[SyncEngine] Cannot refetch, _onRemoteUpdate is missing');
    }
};
