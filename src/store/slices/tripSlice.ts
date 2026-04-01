import { StateCreator } from 'zustand';
import { TripPlan, Wallet, TripMember, BUDDY_COLORS } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { mapTripToDb } from '../../mappers/trip.mapper';
import {
    beginTripCloudMutation,
    endTripCloudMutation,
    fetchTripCloudBundle,
    refreshTripCloudState,
    refreshAccessibleCloudState,
} from '../cloudSyncHelpers';
import { syncTrace, summarizeTrip, summarizeWallets } from '../../sync/debug';
import { persistLocalTripHide, stampFieldUpdates, supabase, validateImportedTrip } from '../storeHelpers';
import type { AppState } from '../useStore';
import {
    applyTripWalletDerivedFields,
    buildNewTripPlan,
    normalizeImportedTripMembers,
    normalizeTripWallet,
    resolveCurrentAuthUserId,
} from './tripSlice.helpers';

export interface TripSlice {
    trips: TripPlan[];
    addTrip: (
        trip: Omit<TripPlan, 'id' | 'isCompleted' | 'lastModified' | 'wallets'> & {
            id?: string;
            wallets: (Omit<Wallet, 'id' | 'tripId' | 'spentAmount'> & { id?: string })[];
        }
    ) => Promise<string>;
    updateTrip: (id: string, trip: Partial<TripPlan>) => Promise<void>;
    deleteTrip: (id: string) => Promise<void>;
    toggleTripCompletion: (id: string) => Promise<void>;
    importTrip: (tripData: any) => void;
    updateWalletBaseline: (
        tripId: string,
        walletId: string,
        rate: number,
        source: 'initial' | 'user'
    ) => Promise<void>;
    addMember: (tripId: string, name: string, opts?: { userId?: string; email?: string }) => Promise<TripMember | null>;
    removeMember: (tripId: string, memberId: string) => Promise<void>;
    updateMemberRole: (tripId: string, memberId: string, role: 'editor' | 'viewer') => Promise<void>;
    addBuddy: (tripId: string, name: string) => Promise<TripMember | null>;
    removeBuddy: (tripId: string, buddyId: string) => Promise<void>;
}

export const createTripSlice: StateCreator<AppState, [], [], TripSlice> = (_set, get) => ({
    trips: [],

    addTrip: async (tripData) => {
        const id = tripData.id || generateId();
        const lastModified = Date.now();
        const authUserId = await resolveCurrentAuthUserId(get().currentUserId);
        if (!authUserId) throw new Error('Not authenticated');
        const { getAuthState } = await import('../../auth/googleAuth');
        const authState = await getAuthState();
        beginTripCloudMutation(id);

        try {
            const wallets: Wallet[] = tripData.wallets.map(wallet => normalizeTripWallet(id, wallet));
            const newTrip = buildNewTripPlan(tripData, id, wallets, lastModified, authUserId, {
                displayName: authState.displayName,
                email: authState.email,
            });
            syncTrace('TripMutation', 'submit_add_trip', {
                tripId: id,
                authUserId,
                trip: summarizeTrip(newTrip),
                wallets: summarizeWallets(wallets),
            });

            const { error } = await supabase.rpc('create_trip_bundle', {
                p_trip: newTrip,
                p_wallets: wallets,
            });
            if (error) throw error;
            syncTrace('TripMutation', 'rpc_add_trip_success', { tripId: id });

            await refreshTripCloudState(id);
            syncTrace('TripMutation', 'refresh_after_add_trip_done', { tripId: id });
            return id;
        } catch (error: any) {
            syncTrace('TripMutation', 'add_trip_failed', {
                tripId: id,
                message: error?.message,
                code: error?.code,
            });
            throw error;
        } finally {
            endTripCloudMutation(id);
        }
    },

    updateTrip: async (id, tripData) => {
        beginTripCloudMutation(id);
        try {
            const bundle = await fetchTripCloudBundle(id);
            if (!bundle) return;

            const lastModified = Date.now();
            const nextTrip: TripPlan = {
                ...bundle.trip,
                ...tripData,
                lastModified,
            };
            nextTrip.fieldUpdates = stampFieldUpdates(bundle.trip.fieldUpdates, tripData as Record<string, unknown>, lastModified);

            let nextWallets = bundle.wallets;
            let removedWalletIds: string[] = [];

            if (tripData.wallets) {
                const nextWalletIds = new Set(tripData.wallets.map(wallet => wallet.id));
                removedWalletIds = bundle.wallets
                    .filter(wallet => !nextWalletIds.has(wallet.id))
                    .map(wallet => wallet.id);

                const blockedRemoval = bundle.expenses.some(expense => removedWalletIds.includes(expense.walletId));
                if (blockedRemoval) {
                    throw new Error('Cannot remove a wallet that already has expenses.');
                }

                nextWallets = tripData.wallets.map(wallet =>
                    normalizeTripWallet(id, wallet as Wallet, bundle.wallets.find(existing => existing.id === wallet.id))
                );

                Object.assign(nextTrip, applyTripWalletDerivedFields(nextTrip, nextWallets));
            }

            const { error } = await supabase.rpc('update_trip_bundle', {
                p_trip_id: id,
                p_trip: nextTrip,
                p_wallets: tripData.wallets ? nextWallets : null,
                p_removed_wallet_ids: removedWalletIds,
            });
            if (error) throw error;

            await refreshAccessibleCloudState();
        } finally {
            endTripCloudMutation(id);
        }
    },

    deleteTrip: async (id) => {
        const localTrip = get().trips.find(trip => trip.id === id);
        if (!localTrip) return;

        const currentUserId = await resolveCurrentAuthUserId(get().currentUserId);
        const ownerUserId = (localTrip as any).userId;
        const isCreator = !localTrip.isCloudSynced || (!!currentUserId && ownerUserId === currentUserId);
        const lastModified = Date.now();

        if (isCreator) {
            const { error } = await supabase.rpc('soft_delete_trip', {
                p_trip_id: id,
                p_user_id: currentUserId,
            });
            if (error) throw error;

            await refreshAccessibleCloudState();
            return;
        }

        const { error } = await supabase.rpc('leave_trip', {
            p_trip_id: id,
        });
        if (error) throw error;

        persistLocalTripHide(id, {
            ...localTrip,
            members: (localTrip.members || []).filter(member => member.userId !== currentUserId),
            lastModified,
        });
        await refreshTripCloudState(id);
    },

    toggleTripCompletion: async (id) => {
        const bundle = await fetchTripCloudBundle(id);
        if (!bundle) return;

        const lastModified = Date.now();
        const isCompleted = !bundle.trip.isCompleted;
        const fieldUpdates = stampFieldUpdates(bundle.trip.fieldUpdates, { isCompleted }, lastModified);

        const { error } = await supabase
            .from('trips')
            .update({
                ...mapTripToDb({ ...bundle.trip, isCompleted, lastModified, fieldUpdates }),
                updated_at: lastModified,
            })
            .eq('id', id);
        if (error) throw error;

        await refreshAccessibleCloudState();
    },

    importTrip: (tripData: any) =>
        _set((state) => {
            if (!validateImportedTrip(tripData)) {
                console.error('[importTrip] Invalid trip data - schema validation failed');
                return state;
            }

            const existingTrip = state.trips.find(trip => trip.id === tripData.id);
            if (existingTrip && existingTrip.lastModified >= tripData.lastModified) {
                return state;
            }

            const newActivities = (tripData.activities || []).map((activity: any) => ({ ...activity }));
            const { activities: _ignoredActivities, ...rawTrip } = tripData;
            const cleanTrip = {
                ...rawTrip,
                members: normalizeImportedTripMembers(rawTrip.members),
            };
            const embeddedExpenses: any[] = [];

            for (const activity of newActivities) {
                if (!activity.expenses?.length) continue;
                for (const expense of activity.expenses) {
                    embeddedExpenses.push({ ...expense, tripId: activity.tripId, activityId: activity.id });
                }
            }

            if (existingTrip) {
                return {
                    trips: state.trips.map(trip => trip.id === tripData.id ? cleanTrip : trip),
                    activities: [
                        ...state.activities.filter(activity => activity.tripId !== tripData.id),
                        ...newActivities,
                    ],
                    expenses: [
                        ...state.expenses.filter(expense => expense.tripId !== tripData.id),
                        ...embeddedExpenses,
                    ],
                };
            }

            return {
                trips: [...state.trips, cleanTrip],
                activities: [...state.activities, ...newActivities],
                expenses: [...state.expenses, ...embeddedExpenses],
            };
        }),

    updateWalletBaseline: async (tripId, walletId, rate, source) => {
        beginTripCloudMutation(tripId);
        try {
            const bundle = await fetchTripCloudBundle(tripId);
            if (!bundle) return;

            const lastModified = Date.now();
            const nextWallets = bundle.wallets.map(wallet => {
                if (wallet.id !== walletId) return wallet;
                return {
                    ...wallet,
                    baselineExchangeRate: rate,
                    baselineSource: source,
                    lastModified,
                    fieldUpdates: stampFieldUpdates(
                        wallet.fieldUpdates,
                        { baselineExchangeRate: rate, baselineSource: source },
                        lastModified
                    ),
                };
            });

            const updatedTrip = {
                ...bundle.trip,
                wallets: nextWallets,
                lastModified,
            };
            updatedTrip.fieldUpdates = stampFieldUpdates(bundle.trip.fieldUpdates, { wallets: nextWallets }, lastModified);

            const { error } = await supabase.rpc('update_trip_bundle', {
                p_trip_id: tripId,
                p_trip: updatedTrip,
                p_wallets: nextWallets,
                p_removed_wallet_ids: [],
            });
            if (error) throw error;
            await refreshTripCloudState(tripId);
        } finally {
            endTripCloudMutation(tripId);
        }
    },

    addMember: async (tripId, name, opts) => {
        const localTrip = get().trips.find(trip => trip.id === tripId);
        const bundle = localTrip ? null : await fetchTripCloudBundle(tripId);
        const existing = (localTrip?.members || bundle?.trip.members || []);
        const usedColors = existing.map(member => member.color);
        const availableColor = BUDDY_COLORS.find(color => !usedColors.includes(color))
            || BUDDY_COLORS[existing.length % BUDDY_COLORS.length];

        const newMember: TripMember = {
            id: generateId(),
            name: name.trim(),
            color: availableColor,
            role: 'editor',
            userId: opts?.userId,
            email: opts?.email,
            addedAt: Date.now(),
        };
        const { error } = await supabase.rpc('add_trip_member', {
            p_trip_id: tripId,
            p_member: newMember,
        });
        if (error) throw error;

        await refreshTripCloudState(tripId);
        return newMember;
    },

    removeMember: async (tripId, memberId) => {
        const { error } = await supabase.rpc('remove_trip_member', {
            p_trip_id: tripId,
            p_member_id: memberId,
        });
        if (error) throw error;

        await refreshTripCloudState(tripId);
    },

    updateMemberRole: async (tripId, memberId, role) => {
        const { error } = await supabase.rpc('update_trip_member_role', {
            p_trip_id: tripId,
            p_member_id: memberId,
            p_role: role,
        });
        if (error) throw error;

        await refreshTripCloudState(tripId);
    },

    addBuddy: async (tripId, name) => {
        const self = get();
        return self.addMember(tripId, name);
    },

    removeBuddy: async (tripId, buddyId) => {
        const self = get();
        await self.removeMember(tripId, buddyId);
    },
});
