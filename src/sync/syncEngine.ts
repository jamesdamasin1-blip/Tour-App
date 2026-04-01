/**
 * SYNC ENGINE v2 — Cloud-first cache hydrator plus legacy queue drainer.
 *
 * Strategy:
 * 1. Drain any historic/device-local queue events to Supabase.
 * 2. Pull remote updates and hydrate the local cache.
 * 3. Preserve fresher cloud-visible local entities during merge races.
 * 4. Detect remote soft-deletes and remove them locally.
 *
 * Shared collaborative writes should already have been committed in Supabase
 * before this engine runs. HARD DELETES ARE FORBIDDEN.
 */
import { getAuthState, type AuthState } from '../auth/googleAuth';
import { getDB, getHiddenTripIds, getSyncMeta, setSyncMeta } from '../storage/localDB';
import { supabase } from '../utils/supabase';
import { pruneCompletedEvents } from './syncQueue';
import { mapTripFromDb } from '../mappers/trip.mapper';
import { mapActivityFromDb } from '../mappers/activity.mapper';
import { mapExpenseFromDb } from '../mappers/expense.mapper';
import { mapWalletFromDb, mapFundingLotFromDb } from '../mappers/wallet.mapper';
import type { AppState } from '../store/useStore';
import { getStoreState, setStoreState } from '../store/storeBridge';
import { syncTrace, summarizeTrip, summarizeWallets } from './debug';
import { isRecoverableSyncError, logSyncIssue, pushPendingChanges } from './legacyQueueDrainer';

type SyncStatus = 'idle' | 'syncing' | 'error';

let _syncStatus: SyncStatus = 'idle';
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _syncRunning = false; // guard against concurrent sync runs
let _syncRequested = false; // flag to trigger another run after current completes
let _lastSyncFinishedAt = 0;
const _tripRefetchTokens = new Map<string, number>();
// Realtime subscriptions handle the normal collaborative path.
// Keep periodic full sync as a slower safety net for missed events/reconnect gaps.
const SYNC_INTERVAL = 30_000;
const MIN_SYNC_GAP_MS = 3_000;
const SYNC_DEBUG_LOGS = false;
const SYNC_RUNTIME_LOGS = false;

export const getSyncStatus = () => _syncStatus;

/**
 * Drain queued legacy mutations without running a full pull cycle.
 * Used as a recovery path for older pending events and explicit cache-only flows.
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
        logSyncIssue('[SyncEngine] pushNow failed:', err);
    } finally {
        _syncRunning = false;
    }
    return pushedTotal;
};

// ─── Sync Logic ───────────────────────────────────────────────────

/** Main cache refresh loop — called when online and authenticated. */
export const runSync = async (): Promise<{ pushed: number; pulled: number }> => {
    // If a sync is already running, just mark that we want another one after.
    // This handles the race condition where a mutation happens while we are pulling remote updates.
    if (_syncRunning) {
        _syncRequested = true;
        if (SYNC_DEBUG_LOGS) {
            console.log('[SyncEngine] Queued follow-up sync');
        }
        return { pushed: 0, pulled: 0 };
    }

    const now = Date.now();
    if (_lastSyncFinishedAt > 0 && now - _lastSyncFinishedAt < MIN_SYNC_GAP_MS) {
        if (SYNC_DEBUG_LOGS) {
            console.log(`[SyncEngine] Skipping duplicate sync within ${MIN_SYNC_GAP_MS}ms window`);
        }
        return { pushed: 0, pulled: 0 };
    }
    
    _syncRunning = true;
    _syncStatus = 'syncing';
    let pushedTotal = 0;
    let pulledTotal = 0;

    try {
        const auth = await getAuthState();
        if (!auth.isAuthenticated || !auth.userId) {
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
        
        if (SYNC_DEBUG_LOGS) {
            console.log(`[SyncEngine] Done — totalPushed=${pushedTotal}, totalPulled=${pulledTotal}`);
        }
    } catch (err) {
        logSyncIssue('[SyncEngine] Sync failed:', err);
        _syncStatus = isRecoverableSyncError(err) ? 'idle' : 'error';
    } finally {
        _lastSyncFinishedAt = Date.now();
        _syncRunning = false;
    }

    return { pushed: pushedTotal, pulled: pulledTotal };
};

// ─── Store update callback ────────────────────────────────────────
type CloudTripBundle = {
    trip?: any | null;
    wallets?: any[];
    activities?: any[];
    expenses?: any[];
    fundingLots?: any[];
};

type CloudSnapshot = {
    trips: any[];
    wallets: any[];
    activities: any[];
    expenses: any[];
    fundingLots: any[];
};

const getEntityVersion = (entity: any): number => {
    const version = Number(entity?.version ?? 0);
    return Number.isFinite(version) ? version : 0;
};

const getEntityTimestamp = (entity: any): number => {
    const timestamp = Number(
        entity?.lastModified ??
        entity?.last_modified ??
        entity?.updated_at ??
        entity?.updatedAt ??
        entity?.time ??
        entity?.date ??
        0
    );
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const shouldPreserveLocalCloudEntity = (localEntity: any, remoteEntity: any): boolean => {
    if (!localEntity || !remoteEntity || !localEntity.isCloudSynced) return false;

    const localVersion = getEntityVersion(localEntity);
    const remoteVersion = getEntityVersion(remoteEntity);
    if (localVersion > remoteVersion) return true;
    if (remoteVersion > localVersion) return false;

    return getEntityTimestamp(localEntity) > getEntityTimestamp(remoteEntity);
};

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const isTripHiddenLocally = (tripId: string, hiddenTripIds: Set<string>): boolean =>
    hiddenTripIds.has(tripId);

const isSelfRemovedFromTrip = (trip: any, currentUserId: string | null | undefined): boolean => {
    if (!currentUserId) return false;

    const removedIds: string[] = Array.isArray(trip?.removedMemberUserIds)
        ? trip.removedMemberUserIds
        : Array.isArray(trip?.removed_member_user_ids)
            ? trip.removed_member_user_ids
            : [];
    if (removedIds.includes(currentUserId)) return true;

    const members: any[] = Array.isArray(trip?.members) ? trip.members : [];
    return members.some(member => member?.userId === currentUserId && member?.removed === true);
};

export const onRemoteUpdate = (_cb: unknown) => {
    // Legacy no-op: snapshots are now applied directly in the sync engine.
};

const _onRemoteUpdate: any = null;

const getWalletVersion = (wallet: any): number => {
    const version = Number(wallet?.version ?? 0);
    return Number.isFinite(version) ? version : 0;
};

const getWalletTimestamp = (wallet: any): number => {
    const timestamp = Number(
        wallet?.lastModified ??
        wallet?.updated_at ??
        wallet?.updatedAt ??
        0
    );
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const mergeEmbeddedWallet = (wallet: any, trip?: any, localWallet?: any): any => {
    const tripTimestamp = getWalletTimestamp(trip);
    const walletTimestamp = getWalletTimestamp(wallet);
    const localTimestamp = getWalletTimestamp(localWallet);

    return {
        ...(localWallet || {}),
        ...wallet,
        tripId: wallet?.tripId ?? wallet?.trip_id ?? localWallet?.tripId,
        country: wallet?.country ?? localWallet?.country ?? '',
        createdAt: wallet?.createdAt ?? localWallet?.createdAt ?? Date.now(),
        lots: wallet?.lots ?? localWallet?.lots ?? [],
        version: getWalletVersion(wallet) || getWalletVersion(localWallet) || 1,
        // Embedded wallets inside trips.wallets do not always bump their own timestamp/version
        // when the parent trip mirrors a wallet-lot change, so use the trip row freshness too.
        lastModified: Math.max(walletTimestamp, tripTimestamp, localTimestamp, 0) || Date.now(),
    };
};

const resolveTripWallets = (trip: any, walletRows: any[], localTrip?: any): any[] => {
    const localWallets = localTrip?.wallets ?? [];
    const embeddedWallets = Array.isArray(trip?.wallets) ? trip.wallets : [];
    const walletRowMap = new Map(
        walletRows.map(row => [
            row.id,
            mapWalletFromDb(row, localWallets.find((wallet: any) => wallet.id === row.id)),
        ])
    );
    const embeddedMap = new Map(
        embeddedWallets.map((wallet: any) => [
            wallet.id,
            mergeEmbeddedWallet(
                wallet,
                trip,
                localWallets.find((local: any) => local.id === wallet.id)
            ),
        ])
    );
    const orderedIds = [
        ...embeddedWallets.map((wallet: any) => wallet.id),
        ...walletRows.map(row => row.id),
    ].filter((id, index, arr) => !!id && arr.indexOf(id) === index);

    return orderedIds.map(id => {
        const embeddedWallet = embeddedMap.get(id);
        const tableWallet = walletRowMap.get(id);

        if (!embeddedWallet) return tableWallet;
        if (!tableWallet) return embeddedWallet;

        const embeddedVersion = getWalletVersion(embeddedWallet);
        const tableVersion = getWalletVersion(tableWallet);
        if (embeddedVersion > tableVersion) {
            if (SYNC_RUNTIME_LOGS) {
                console.log(
                    `[SyncEngine] Using mirrored trip wallet ${id} (trip v${embeddedVersion} > table v${tableVersion})`
                );
            }
            return embeddedWallet;
        }
        if (tableVersion > embeddedVersion) {
            return tableWallet;
        }

        const embeddedTimestamp = getWalletTimestamp(embeddedWallet);
        const tableTimestamp = getWalletTimestamp(tableWallet);
        if (embeddedTimestamp > tableTimestamp) {
            if (SYNC_RUNTIME_LOGS) {
                console.log(
                    `[SyncEngine] Using mirrored trip wallet ${id} (trip ts${embeddedTimestamp} > table ts${tableTimestamp})`
                );
            }
            return embeddedWallet;
        }

        return tableWallet;
    }).filter(Boolean);
};

const applyCloudTripBundle = (data: CloudTripBundle): void => {
    const { trip, wallets = [], activities = [], expenses = [] } = data;
    if (!trip?.id) return;

    const state = getStoreState<AppState>();
    const localTrip = state.trips.find(t => t.id === trip.id);
    syncTrace('SyncEngine', 'apply_trip_bundle_start', {
        tripId: trip.id,
        localTrip: summarizeTrip(localTrip),
        incomingTrip: summarizeTrip(trip),
        walletRows: summarizeWallets(wallets),
        activityCount: activities.length,
        expenseCount: expenses.length,
        fundingLotCount: (data.fundingLots || []).length,
    });
    const mappedWallets = resolveTripWallets(trip, wallets, localTrip);
    const mappedTrip = {
        ...(localTrip || {}),
        ...trip,
        wallets: mappedWallets,
        isCloudSynced: true,
    };
    const mappedActivities = activities.map(a => ({ ...mapActivityFromDb(a), expenses: [] }));
    const mappedExpenses = expenses.map(mapExpenseFromDb);
    const hydratedActivities = mappedActivities.map(a => ({
        ...a,
        expenses: mappedExpenses.filter(e => e.activityId === a.id),
    }));
    const mappedFundingLots = (data.fundingLots || []).map(mapFundingLotFromDb);
    syncTrace('SyncEngine', 'apply_trip_bundle_resolved', {
        tripId: trip.id,
        mappedTrip: summarizeTrip(mappedTrip),
        mappedActivities: hydratedActivities.length,
        mappedExpenses: mappedExpenses.length,
        mappedFundingLots: mappedFundingLots.length,
    });

    setStoreState<AppState>(s => ({
        trips: [...s.trips.filter(t => t.id !== mappedTrip.id), mappedTrip],
        activities: [
            ...s.activities.filter(a => a.tripId !== mappedTrip.id),
            ...hydratedActivities,
        ],
        expenses: [
            ...s.expenses.filter(e => e.tripId !== mappedTrip.id),
            ...mappedExpenses,
        ],
        exchangeEvents: [
            ...s.exchangeEvents.filter(e => e.tripId !== mappedTrip.id),
            ...mappedFundingLots,
        ],
    }));
};

// ─── Pull-side mappers (snake_case → camelCase, delegated to mappers/) ──────
// mapTripFromDb, mapActivityFromDb, mapExpenseFromDb are imported at top of file.

/** Pull remote changes — version-aware, soft-delete aware */
const applyCloudSnapshot = (snapshot: CloudSnapshot): void => {
    const state = getStoreState<AppState>();
    syncTrace('SyncEngine', 'apply_snapshot_start', {
        tripCount: snapshot.trips.length,
        walletCount: snapshot.wallets.length,
        activityCount: snapshot.activities.length,
        expenseCount: snapshot.expenses.length,
        fundingLotCount: snapshot.fundingLots.length,
        tripIds: snapshot.trips.map(t => t.id),
    });
    const cloudTripIds = new Set(snapshot.trips.map(t => t.id));
    const preservedTrips = state.trips.filter(t => !t.isCloudSynced && !cloudTripIds.has(t.id));
    const preservedTripIds = new Set(preservedTrips.map(t => t.id));

    const mappedTrips = snapshot.trips.map(trip => {
        const localTrip = state.trips.find(t => t.id === trip.id);
        const mappedWallets = resolveTripWallets(
            trip,
            snapshot.wallets.filter(w => w.trip_id === trip.id),
            localTrip
        );

        const mappedTrip = {
            ...(localTrip || {}),
            ...trip,
            wallets: mappedWallets,
            isCloudSynced: true,
        };

        return shouldPreserveLocalCloudEntity(localTrip, mappedTrip)
            ? { ...localTrip, wallets: mappedWallets }
            : mappedTrip;
    });

    const mappedExpenses = snapshot.expenses.map(mapExpenseFromDb);
    const mergedExpenses = mappedExpenses.map(expense => {
        const localExpense = state.expenses.find(existing => existing.id === expense.id);
        return shouldPreserveLocalCloudEntity(localExpense, expense) ? localExpense : expense;
    }).filter(isDefined);
    const mappedActivities = snapshot.activities.map(a => {
        const activity = { ...mapActivityFromDb(a), expenses: [] as any[] };
        const mergedActivity: any = {
            ...activity,
            expenses: mergedExpenses.filter(e => e.activityId === activity.id),
        };
        const localActivity = state.activities.find(existing => existing.id === mergedActivity.id);
        return shouldPreserveLocalCloudEntity(localActivity, mergedActivity)
            ? {
                ...localActivity,
                expenses: mergedExpenses.filter(e => e.activityId === mergedActivity.id),
            }
            : mergedActivity;
    }).filter(isDefined);
    const mappedFundingLots = snapshot.fundingLots.map(mapFundingLotFromDb);
    const mergedFundingLots = mappedFundingLots.map(event => {
        const localEvent = state.exchangeEvents.find(existing => existing.id === event.id);
        return shouldPreserveLocalCloudEntity(localEvent, event) ? localEvent : event;
    }).filter(isDefined);
    syncTrace('SyncEngine', 'apply_snapshot_resolved', {
        mappedTrips: mappedTrips.map(summarizeTrip),
        mappedActivities: mappedActivities.length,
        mappedExpenses: mergedExpenses.length,
        mappedFundingLots: mergedFundingLots.length,
    });

    setStoreState<AppState>({
        trips: [...preservedTrips, ...mappedTrips],
        activities: [
            ...state.activities.filter(a => preservedTripIds.has(a.tripId)),
            ...mappedActivities,
        ],
        expenses: [
            ...state.expenses.filter(e => preservedTripIds.has(e.tripId)),
            ...mergedExpenses,
        ],
        exchangeEvents: [
            ...state.exchangeEvents.filter(e => preservedTripIds.has(e.tripId)),
            ...mergedFundingLots,
        ],
    });
};

const fetchAccessibleCloudSnapshot = async (auth: AuthState): Promise<CloudSnapshot> => {
    const memberFilter = `[{"userId":"${auth.userId}"}]`;
    const { data: remoteTrips, error: tripErr } = await supabase
        .from('trips')
        .select('*')
        .is('deleted_at', null)
        .or(`user_id.eq.${auth.userId},members.cs.${memberFilter}`);

    if (tripErr) throw tripErr;

    const hiddenTripIds = new Set(getHiddenTripIds());
    const rawTrips = (remoteTrips || []).map(mapTripFromDb);
    const excludedTrips = rawTrips.filter(trip =>
        isTripHiddenLocally(trip.id, hiddenTripIds) ||
        isSelfRemovedFromTrip(trip, auth.userId)
    );
    const trips = rawTrips.filter(trip =>
        !isTripHiddenLocally(trip.id, hiddenTripIds) &&
        !isSelfRemovedFromTrip(trip, auth.userId)
    );
    const tripIds = trips.map(t => t.id);

    if (excludedTrips.length > 0) {
        syncTrace('SyncEngine', 'filter_accessible_snapshot_trips', {
            userId: auth.userId,
            hiddenTripIds: [...hiddenTripIds],
            excludedTripIds: excludedTrips.map(trip => trip.id),
        });
    }

    if (tripIds.length === 0) {
        return { trips: [], wallets: [], activities: [], expenses: [], fundingLots: [] };
    }

    const [
        { data: remoteWallets, error: walletErr },
        { data: remoteActivities, error: activityErr },
        { data: remoteExpenses, error: expenseErr },
        { data: remoteFundingLots, error: fundingErr },
    ] = await Promise.all([
        supabase.from('wallets').select('*').is('deleted_at', null).in('trip_id', tripIds),
        supabase.from('activities').select('*').is('deleted_at', null).in('trip_id', tripIds),
        supabase.from('expenses').select('*').is('deleted_at', null).in('trip_id', tripIds),
        supabase.from('funding_lots').select('*').is('deleted_at', null).in('trip_id', tripIds),
    ]);

    if (walletErr) throw walletErr;
    if (activityErr) throw activityErr;
    if (expenseErr) throw expenseErr;
    if (fundingErr) throw fundingErr;

    syncTrace('SyncEngine', 'fetch_accessible_snapshot', {
        userId: auth.userId,
        tripIds,
        tripCount: trips.length,
        walletCount: (remoteWallets || []).length,
        activityCount: (remoteActivities || []).length,
        expenseCount: (remoteExpenses || []).length,
        fundingLotCount: (remoteFundingLots || []).length,
    });

    return {
        trips,
        wallets: remoteWallets || [],
        activities: remoteActivities || [],
        expenses: remoteExpenses || [],
        fundingLots: remoteFundingLots || [],
    };
};

export const legacyPullRemoteUpdates = async (auth: AuthState): Promise<number> => {
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
        if (tripErr) logSyncIssue('[SyncEngine] Trip pull error:', tripErr);
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

    if (SYNC_RUNTIME_LOGS) {
        console.log(`[SyncEngine] Pull: ${pulledTrips.length} trips, ${deletedTripIds.length} deleted, ${allTripIds.length} total IDs`);
    }

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

        if (actErr) logSyncIssue('[SyncEngine] Activity pull error:', actErr);

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

        if (expErr) logSyncIssue('[SyncEngine] Expense pull error:', expErr);

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

        if (walErr) logSyncIssue('[SyncEngine] Wallet pull error:', walErr);
        if (remoteWallets?.length) {
            pulledWallets = remoteWallets;
            pulled += remoteWallets.length;
        }
    }

    if (SYNC_RUNTIME_LOGS) {
        console.log(`[SyncEngine] Pulled ${pulledActivities.length} activities, ${pulledExpenses.length} expenses, ${pulledWallets.length} wallets, soft-deleted: ${deletedActivityIds.length} act / ${deletedExpenseIds.length} exp`);
    }

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

const pullRemoteUpdates = async (auth: AuthState): Promise<number> => {
    syncTrace('SyncEngine', 'pull_remote_updates_start', { userId: auth.userId });
    const snapshot = await fetchAccessibleCloudSnapshot(auth);
    applyCloudSnapshot(snapshot);
    syncTrace('SyncEngine', 'pull_remote_updates_done', {
        userId: auth.userId,
        tripCount: snapshot.trips.length,
        walletCount: snapshot.wallets.length,
        activityCount: snapshot.activities.length,
        expenseCount: snapshot.expenses.length,
        fundingLotCount: snapshot.fundingLots.length,
    });

    return (
        snapshot.trips.length +
        snapshot.wallets.length +
        snapshot.activities.length +
        snapshot.expenses.length +
        snapshot.fundingLots.length
    );
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

export const refetchAccessibleCloudState = async (): Promise<void> => {
    const auth = await getAuthState();
    if (!auth.isAuthenticated || !auth.userId) return;

    syncTrace('SyncEngine', 'refetch_accessible_state_start', { userId: auth.userId });
    const snapshot = await fetchAccessibleCloudSnapshot(auth);
    applyCloudSnapshot(snapshot);
    syncTrace('SyncEngine', 'refetch_accessible_state_done', { userId: auth.userId });
};

/**
 * HARD REFETCH STRATEGY
 * Fetch a full trip bundle directly from the DB and replace local cache state.
 */
export const refetchTripActivities = async (tripId: string): Promise<void> => {
    const token = (_tripRefetchTokens.get(tripId) ?? 0) + 1;
    _tripRefetchTokens.set(tripId, token);
    syncTrace('SyncEngine', 'refetch_trip_start', { tripId, token });

    const auth = await getAuthState();
    if (!auth.isAuthenticated || !auth.userId) return;

    // Fetch the entire trip bundle in parallel. This keeps the same cloud-first
    // semantics while cutting the post-write wait caused by serial round-trips.
    const [
        { data: remoteTrip, error: tripErr },
        { data: remoteActivities, error: actErr },
        { data: remoteExpenses, error: expErr },
        { data: remoteWallets, error: walErr },
        { data: remoteFundingLots, error: lotErr },
    ] = await Promise.all([
        supabase
            .from('trips')
            .select('*')
            .is('deleted_at', null)
            .eq('id', tripId)
            .maybeSingle(),
        supabase
            .from('activities')
            .select('*')
            .is('deleted_at', null)
            .eq('trip_id', tripId),
        supabase
            .from('expenses')
            .select('*')
            .is('deleted_at', null)
            .eq('trip_id', tripId),
        supabase
            .from('wallets')
            .select('*')
            .is('deleted_at', null)
            .eq('trip_id', tripId),
        supabase
            .from('funding_lots')
            .select('*')
            .is('deleted_at', null)
            .eq('trip_id', tripId),
    ]);

    if (tripErr) {
        logSyncIssue('[SyncEngine] refetchTripActivities pull trip error:', tripErr);
    }
    if (actErr) {
        logSyncIssue('[SyncEngine] refetchTripActivities pull activities error:', actErr);
        return;
    }
    if (expErr) {
        logSyncIssue('[SyncEngine] refetchTripActivities pull expenses error:', expErr);
        return;
    }
    if (walErr) {
        logSyncIssue('[SyncEngine] refetchTripActivities pull wallets error:', walErr);
    }
    if (lotErr) {
        logSyncIssue('[SyncEngine] refetchTripActivities pull funding lots error:', lotErr);
    }

    syncTrace('SyncEngine', 'refetch_trip_fetched', {
        tripId,
        token,
        remoteTrip: summarizeTrip(remoteTrip ? mapTripFromDb(remoteTrip) : null),
        walletRows: summarizeWallets(remoteWallets || []),
        activityCount: (remoteActivities || []).length,
        expenseCount: (remoteExpenses || []).length,
        fundingLotCount: (remoteFundingLots || []).length,
    });

    if (_tripRefetchTokens.get(tripId) !== token) {
        if (SYNC_RUNTIME_LOGS) {
            console.log(`[SyncEngine] Discarding stale refetch for trip ${tripId} (token ${token})`);
        }
        syncTrace('SyncEngine', 'refetch_trip_discarded_stale', { tripId, token });
        return;
    }

    applyCloudTripBundle({
        trip: remoteTrip ? mapTripFromDb(remoteTrip) : null,
        wallets: remoteWallets || [],
        activities: remoteActivities || [],
        expenses: remoteExpenses || [],
        fundingLots: remoteFundingLots || [],
    });
};
