import { mapActivityFromDb } from '../mappers/activity.mapper';
import { mapExpenseFromDb } from '../mappers/expense.mapper';
import { mapTripFromDb, mapTripToDb } from '../mappers/trip.mapper';
import { mapFundingLotFromDb, mapWalletFromDb, mapWalletToDb } from '../mappers/wallet.mapper';
import { syncTrace, summarizeExpenses, summarizeFundingEvents, summarizeTrip, summarizeWallets } from '../sync/debug';
import {
    refetchAccessibleCloudState as syncRefetchAccessibleCloudState,
    refetchTripActivities,
} from '../sync/syncEngine';
import { getStoreState, setStoreState } from './storeBridge';
import { stampFieldUpdates } from './storeHelpers';
import type { Activity, ExchangeEvent, Expense, TripPlan, Wallet } from '../types/models';
import type { AppState } from './useStore';
import { supabase } from '../utils/supabase';

export type TripCloudBundle = {
    trip: TripPlan;
    wallets: Wallet[];
    activities: Activity[];
    expenses: Expense[];
    fundingLots: ExchangeEvent[];
};

type TripCloudBundlePayload = {
    trip?: Record<string, any> | null;
    wallets?: Record<string, any>[];
    activities?: Record<string, any>[];
    expenses?: Record<string, any>[];
    fundingLots?: Record<string, any>[];
};

let tripBundleRpcSupport: 'unknown' | 'supported' | 'unsupported' = 'unknown';

export const setWalletErrorState = (message: string | null): void => {
    setStoreState<AppState>({ walletError: message });
};

export const beginTripCloudMutation = (tripId: string): void => {
    if (!tripId) return;
    syncTrace('TripMutation', 'begin', { tripId });
    setStoreState<AppState>(state => ({
        tripMutationCounts: {
            ...state.tripMutationCounts,
            [tripId]: (state.tripMutationCounts[tripId] || 0) + 1,
        },
    }));
};

export const endTripCloudMutation = (tripId: string): void => {
    if (!tripId) return;
    syncTrace('TripMutation', 'end', { tripId });
    setStoreState<AppState>(state => {
        const current = state.tripMutationCounts[tripId] || 0;
        if (current <= 1) {
            const { [tripId]: _removed, ...rest } = state.tripMutationCounts;
            return { tripMutationCounts: rest };
        }

        return {
            tripMutationCounts: {
                ...state.tripMutationCounts,
                [tripId]: current - 1,
            },
        };
    });
};

export const fetchTripCloudBundle = async (tripId: string): Promise<TripCloudBundle | null> => {
    syncTrace('CloudBundle', 'fetch_start', { tripId, rpcSupport: tripBundleRpcSupport });
    const state = getStoreState<AppState>();
    const localTrip = state.trips.find(t => t.id === tripId);

    if (tripBundleRpcSupport !== 'unsupported') {
        const { data: rpcBundle, error: rpcError } = await supabase.rpc('get_trip_cloud_bundle', {
            p_trip_id: tripId,
        });
        if (!rpcError && rpcBundle) {
            tripBundleRpcSupport = 'supported';
            const mapped = mapTripCloudBundlePayload(rpcBundle as TripCloudBundlePayload, localTrip);
            syncTrace('CloudBundle', 'rpc_success', {
                tripId,
                trip: summarizeTrip(mapped?.trip),
                wallets: summarizeWallets(mapped?.wallets),
                expenses: summarizeExpenses(mapped?.expenses),
                fundingEvents: summarizeFundingEvents(mapped?.fundingLots),
            });
            return mapped;
        }

        if (rpcError && looksLikeMissingTripBundleRpc(rpcError)) {
            tripBundleRpcSupport = 'unsupported';
            syncTrace('CloudBundle', 'rpc_missing_fallback', {
                tripId,
                code: rpcError?.code,
                message: rpcError?.message,
            });
        } else if (rpcError) {
            syncTrace('CloudBundle', 'rpc_error_fallback', {
                tripId,
                code: rpcError?.code,
                message: rpcError?.message,
            });
        }
    }

    const [
        { data: remoteTrip, error: tripErr },
        { data: remoteWallets, error: walletErr },
        { data: remoteActivities, error: activityErr },
        { data: remoteExpenses, error: expenseErr },
        { data: remoteFundingLots, error: fundingErr },
    ] = await Promise.all([
        supabase.from('trips').select('*').is('deleted_at', null).eq('id', tripId).maybeSingle(),
        supabase.from('wallets').select('*').is('deleted_at', null).eq('trip_id', tripId),
        supabase.from('activities').select('*').is('deleted_at', null).eq('trip_id', tripId),
        supabase.from('expenses').select('*').is('deleted_at', null).eq('trip_id', tripId),
        supabase.from('funding_lots').select('*').is('deleted_at', null).eq('trip_id', tripId),
    ]);

    if (tripErr) throw tripErr;
    if (walletErr) throw walletErr;
    if (activityErr) throw activityErr;
    if (expenseErr) throw expenseErr;
    if (fundingErr) throw fundingErr;
    if (!remoteTrip) {
        syncTrace('CloudBundle', 'fetch_no_trip', { tripId });
        return null;
    }

    const mappedWallets = (remoteWallets || []).map(row =>
        mapWalletFromDb(row, localTrip?.wallets.find(wallet => wallet.id === row.id))
    );
    const mappedTrip = {
        ...(localTrip || {}),
        ...mapTripFromDb(remoteTrip),
        wallets: mappedWallets,
        isCloudSynced: true,
    } as TripPlan;
    const mappedExpenses = (remoteExpenses || []).map(mapExpenseFromDb);
    const mappedActivities = (remoteActivities || []).map(row => {
        const activity = { ...mapActivityFromDb(row), expenses: [] as Expense[] } as Activity;
        return {
            ...activity,
            expenses: mappedExpenses.filter(expense => expense.activityId === activity.id),
        };
    });

    const bundle = {
        trip: mappedTrip,
        wallets: mappedWallets,
        activities: mappedActivities,
        expenses: mappedExpenses,
        fundingLots: (remoteFundingLots || []).map(mapFundingLotFromDb),
    };
    syncTrace('CloudBundle', 'query_success', {
        tripId,
        trip: summarizeTrip(bundle.trip),
        wallets: summarizeWallets(bundle.wallets),
        expenses: summarizeExpenses(bundle.expenses),
        fundingEvents: summarizeFundingEvents(bundle.fundingLots),
    });
    return bundle;
};

export const applyTripCloudBundle = (bundle: TripCloudBundle): void => {
    syncTrace('CloudBundle', 'apply_store', {
        tripId: bundle.trip.id,
        trip: summarizeTrip(bundle.trip),
        wallets: summarizeWallets(bundle.wallets),
        expenses: summarizeExpenses(bundle.expenses),
        fundingEvents: summarizeFundingEvents(bundle.fundingLots),
    });
    setStoreState<AppState>(state => ({
        trips: upsertTripById(state.trips, bundle.trip),
        activities: [
            ...state.activities.filter(activity => activity.tripId !== bundle.trip.id),
            ...bundle.activities,
        ],
        expenses: [
            ...state.expenses.filter(expense => expense.tripId !== bundle.trip.id),
            ...bundle.expenses,
        ],
        exchangeEvents: [
            ...state.exchangeEvents.filter(event => event.tripId !== bundle.trip.id),
            ...bundle.fundingLots,
        ],
    }));
};

const buildTripWalletMirror = (
    trip: TripPlan,
    wallets: Wallet[],
    lastModified: number,
    extraPatch: Partial<TripPlan> = {}
): TripPlan => {
    const nextTrip = {
        ...trip,
        ...extraPatch,
        wallets,
        lastModified,
    };
    nextTrip.fieldUpdates = stampFieldUpdates(
        trip.fieldUpdates,
        { wallets, ...extraPatch },
        lastModified
    );
    return nextTrip;
};

export const upsertWalletAndTripMirror = async (
    trip: TripPlan,
    wallets: Wallet[],
    lastModified: number,
    extraTripPatch: Partial<TripPlan> = {}
): Promise<TripPlan> => {
    for (const wallet of wallets) {
        const dbWallet = mapWalletToDb(wallet);
        const { error: walletErr } = await supabase.from('wallets').upsert(dbWallet);
        if (walletErr) throw walletErr;
    }

    const updatedTrip = buildTripWalletMirror(trip, wallets, lastModified, extraTripPatch);
    const dbTrip = mapTripToDb(updatedTrip);
    const { error: tripErr } = await supabase
        .from('trips')
        .update({ ...dbTrip, updated_at: lastModified })
        .eq('id', trip.id);
    if (tripErr) throw tripErr;

    return updatedTrip;
};

export const refreshTripCloudState = async (tripId: string): Promise<void> => {
    syncTrace('CloudBundle', 'refresh_start', { tripId });
    const bundle = await fetchTripCloudBundle(tripId);
    if (bundle) {
        applyTripCloudBundle(bundle);
        syncTrace('CloudBundle', 'refresh_applied_bundle', { tripId });
        return;
    }

    syncTrace('CloudBundle', 'refresh_fallback_refetch', { tripId });
    await refetchTripActivities(tripId);
    syncTrace('CloudBundle', 'refresh_fallback_done', { tripId });
};

export const refreshAccessibleCloudState = async (): Promise<void> => {
    await syncRefetchAccessibleCloudState();
};

const upsertTripById = (trips: TripPlan[], nextTrip: TripPlan): TripPlan[] => {
    const existingIndex = trips.findIndex(trip => trip.id === nextTrip.id);
    if (existingIndex === -1) return [...trips, nextTrip];

    return trips.map(trip => trip.id === nextTrip.id ? nextTrip : trip);
};

const mapTripCloudBundlePayload = (
    payload: TripCloudBundlePayload,
    localTrip?: TripPlan
): TripCloudBundle | null => {
    if (!payload?.trip) return null;

    const remoteWallets = payload.wallets || [];
    const mappedWallets = remoteWallets.map(row =>
        mapWalletFromDb(row, localTrip?.wallets.find(wallet => wallet.id === row.id))
    );
    const mappedTrip = {
        ...(localTrip || {}),
        ...mapTripFromDb({
            ...payload.trip,
            wallets: mappedWallets,
        }),
        wallets: mappedWallets,
        isCloudSynced: true,
    } as TripPlan;

    const mappedExpenses = (payload.expenses || []).map(mapExpenseFromDb);
    const mappedActivities = (payload.activities || []).map(row => {
        const activity = {
            ...mapActivityFromDb(row),
            expenses: [] as Expense[],
        } as Activity;

        return {
            ...activity,
            expenses: mappedExpenses.filter(expense => expense.activityId === activity.id),
        };
    });

    return {
        trip: mappedTrip,
        wallets: mappedWallets,
        activities: mappedActivities,
        expenses: mappedExpenses,
        fundingLots: (payload.fundingLots || []).map(mapFundingLotFromDb),
    };
};

const looksLikeMissingTripBundleRpc = (error: any): boolean => {
    const code = typeof error?.code === 'string' ? error.code : '';
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    return code === '42883' || message.includes('get_trip_cloud_bundle');
};
