import { StateCreator } from 'zustand';
import { inviteService } from '../../services/inviteService';
import { TripInvite } from '../../types/models';
import type { AppState } from '../useStore';

export interface InviteSlice {
    invites: TripInvite[];
    inviteLoading: boolean;

    /** Send an email invite for a trip */
    sendEmailInvite: (params: {
        tripId: string;
        tripTitle: string;
        toEmail: string;
        fromUserId: string;
        fromDisplayName: string | null;
        fromEmail: string | null;
        role?: 'editor' | 'viewer';
    }) => Promise<TripInvite>;

    /** Load pending invites addressed to the current user */
    loadReceivedInvites: (email: string) => Promise<void>;

    /** Accept an invite and import the trip */
    acceptInvite: (inviteId: string) => Promise<void>;

    /** Decline an invite */
    declineInvite: (inviteId: string) => Promise<void>;

    /** Add a realtime invite to the list */
    addRealtimeInvite: (invite: TripInvite) => void;
}

export const createInviteSlice: StateCreator<AppState, [], [], InviteSlice> = (set, get) => ({
    invites: [],
    inviteLoading: false,

    sendEmailInvite: async (params) => {
        // Force-sync the trip (and its activities/expenses) directly to Supabase
        // before creating the invite, so the RPC can find it when the invitee accepts.
        const trip = get().trips.find(t => t.id === params.tripId);
        if (trip) {
            const { supabase } = await import('../storeHelpers');

            // Push trip directly
            const { error: tripErr } = await supabase.from('trips').upsert({
                id: trip.id,
                title: trip.title,
                destination: trip.destination,
                start_date: trip.startDate,
                end_date: trip.endDate,
                home_country: trip.homeCountry,
                home_currency: trip.homeCurrency,
                wallets: trip.wallets,
                total_budget_home_cached: trip.totalBudgetHomeCached,
                countries: trip.countries,
                members: trip.members,
                is_completed: trip.isCompleted,
                last_modified: trip.lastModified,
                user_id: params.fromUserId,
            });
            if (tripErr) {
                throw new Error(`Failed to sync trip to cloud: ${tripErr.message}`);
            }

            // Push activities
            const tripActivities = get().activities.filter(a => a.tripId === trip.id);
            if (tripActivities.length > 0) {
                const { error: actErr } = await supabase.from('activities').upsert(
                    tripActivities.map(a => ({
                        id: a.id, trip_id: a.tripId, wallet_id: a.walletId,
                        title: a.title, category: a.category, date: a.date, time: a.time,
                        end_time: a.endTime, allocated_budget: a.allocatedBudget,
                        budget_currency: a.budgetCurrency, is_completed: a.isCompleted,
                        last_modified: a.lastModified, description: a.description,
                        location: a.location, countries: a.countries,
                        created_by: a.createdBy, last_modified_by: a.lastModifiedBy,
                        user_id: params.fromUserId,
                    }))
                );
                if (actErr) console.warn('[InviteSlice] Failed to sync activities:', actErr.message);
            }

            // Push expenses
            const tripExpenses = get().expenses.filter(e => e.tripId === trip.id);
            if (tripExpenses.length > 0) {
                const { error: expErr } = await supabase.from('expenses').upsert(
                    tripExpenses.map(e => ({
                        id: e.id, trip_id: e.tripId, wallet_id: e.walletId,
                        activity_id: e.activityId, name: e.name, amount: e.amount,
                        currency: e.currency, converted_amount_home: e.convertedAmountHome,
                        converted_amount_trip: e.convertedAmountTrip, category: e.category,
                        time: e.time, date: e.date, original_amount: e.originalAmount,
                        original_currency: e.originalCurrency,
                        created_by: e.createdBy, last_modified_by: e.lastModifiedBy,
                        user_id: params.fromUserId,
                    }))
                );
                if (expErr) console.warn('[InviteSlice] Failed to sync expenses:', expErr.message);
            }
        }

        const invite = await inviteService.sendInvite({
            ...params,
            role: params.role || 'editor',
        });
        return invite;
    },

    loadReceivedInvites: async (email) => {
        set({ inviteLoading: true });
        try {
            const invites = await inviteService.getReceivedInvites(email);
            set({ invites });
        } finally {
            set({ inviteLoading: false });
        }
    },

    acceptInvite: async (inviteId) => {
        const invite = get().invites.find(i => i.id === inviteId);
        if (!invite) return;

        const { supabase } = await import('../storeHelpers');
        const { getAuthState } = await import('../../auth/googleAuth');
        const { BUDDY_COLORS } = await import('../../types/models');
        const auth = await getAuthState();

        const memberName = auth.displayName || invite.toEmail.split('@')[0];
        const existingMembers = get().trips.find(t => t.id === invite.tripId)?.members || [];
        const usedColors = existingMembers.map((m: any) => m.color);
        const memberColor = BUDDY_COLORS.find((c: string) => !usedColors.includes(c)) ||
            BUDDY_COLORS[existingMembers.length % BUDDY_COLORS.length];

        let importSuccess = false;

        // Try the RPC function first (handles RLS, atomically accepts + adds member + returns data)
        const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_trip_invite', {
            p_invite_id: inviteId,
            p_member_name: memberName,
            p_member_color: memberColor,
        });

        if (rpcError) {
            // Surface the actual RPC error — the fallback direct query can't work
            // because RLS blocks the invitee from reading a trip they don't own yet.
            // Common causes: RPC function not deployed, or email mismatch.
            console.error('[InviteSlice] accept_trip_invite RPC error:', rpcError.message, rpcError);
            throw new Error(
                rpcError.message === 'Could not find the function public.accept_trip_invite(p_invite_id, p_member_name, p_member_color) in the schema cache'
                    ? 'The server is not set up to accept invites yet. Please ask the trip owner to deploy the latest database migration.'
                    : rpcError.message || 'Failed to accept invite. Please try again.'
            );
        }

        if (rpcResult?.invite_accepted && !rpcResult?.trip) {
            set(state => ({
                invites: state.invites.map(i =>
                    i.id === inviteId ? { ...i, status: 'accepted' as const } : i
                ),
            }));
            throw new Error('The trip has been deleted by its owner.');
        }

        if (rpcResult?.trip) {
            const tripRow = rpcResult.trip;
            const activityRows = rpcResult.activities || [];
            const expenseRows = rpcResult.expenses || [];

            await importTripFromCloud(tripRow, activityRows, expenseRows, invite, get, set);
            importSuccess = true;
        } else {
            throw new Error('Unexpected response from server. Please try again.');
        }

        // Only mark accepted locally if the import actually succeeded
        if (importSuccess) {
            set(state => ({
                invites: state.invites.map(i =>
                    i.id === inviteId ? { ...i, status: 'accepted' as const } : i
                ),
            }));
        }
    },

    declineInvite: async (inviteId) => {
        await inviteService.declineInvite(inviteId);
        set(state => ({
            invites: state.invites.map(i =>
                i.id === inviteId ? { ...i, status: 'declined' as const } : i
            ),
        }));
    },

    addRealtimeInvite: (invite) => {
        set(state => {
            if (state.invites.some(i => i.id === invite.id)) return state;
            return { invites: [invite, ...state.invites] };
        });
    },
});

/**
 * Import a trip + activities + expenses from Supabase rows into local state.
 * IMPORTANT: We do NOT call offlineSync.trip()/activity()/expense() here because
 * the data already exists on the server. Enqueuing sync events would push the trip
 * back with the joiner's user_id, effectively stealing ownership from the creator.
 * We only persist to local SQLite (for the sync engine's pull queries) marked as 'synced'.
 */
async function importTripFromCloud(
    tripRow: any,
    activityRows: any[],
    expenseRows: any[],
    invite: TripInvite,
    get: () => AppState,
    set: (fn: (s: AppState) => Partial<AppState>) => void,
) {
    const { upsertRecord } = await import('../../storage/localDB');
    const state = get();

    // Build the trip object from the cloud row
    const trip = {
        id: tripRow.id,
        userId: tripRow.user_id || undefined,
        title: tripRow.title,
        destination: tripRow.destination,
        startDate: Number(tripRow.start_date),
        endDate: Number(tripRow.end_date),
        homeCountry: tripRow.home_country,
        homeCurrency: tripRow.home_currency,
        wallets: tripRow.wallets || [],
        totalBudgetHomeCached: Number(tripRow.total_budget_home_cached || 0),
        tripCurrency: tripRow.wallets?.[0]?.currency || tripRow.home_currency,
        totalBudgetTrip: tripRow.wallets?.[0]?.totalBudget || 0,
        totalBudget: (tripRow.wallets || []).reduce(
            (acc: number, w: any) => acc + (w.totalBudget / (w.defaultRate || 1)), 0
        ),
        currency: tripRow.wallets?.[0]?.currency || tripRow.home_currency,
        countries: tripRow.countries || [],
        members: tripRow.members || [],
        isCompleted: tripRow.is_completed || false,
        lastModified: Number(tripRow.last_modified || Date.now()),
        role: 'admin' as const,
        isCloudSynced: true,
        version: Number(tripRow.version || 1),
        updatedBy: tripRow.updated_by || undefined,
        deletedAt: null,
    };

    // Persist to local SQLite without enqueuing a sync push
    upsertRecord('trips', trip.id, trip, { userId: tripRow.user_id || '' });

    // Update local trip if it already exists, otherwise add it
    const existingTrip = state.trips.find(t => t.id === invite.tripId);
    if (existingTrip) {
        const updatedTrip = { ...existingTrip, members: trip.members, lastModified: trip.lastModified };
        set(s => ({ trips: s.trips.map(t => t.id === existingTrip.id ? updatedTrip : t) }));
    } else {
        set(s => ({ trips: [...s.trips, trip] }));
    }

    // Import activities
    const newActivities = activityRows.map((a: any) => ({
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
        deletedAt: null,
    }));

    // Import expenses
    let newExpenses: any[] = [];
    if (expenseRows.length) {
        newExpenses = expenseRows.map((e: any) => ({
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
            deletedAt: null,
        }));

        // Persist expenses to local DB only (no sync push)
        newExpenses.forEach((e: any) => {
            upsertRecord('expenses', e.id, e, { walletId: e.walletId, tripId: e.tripId, activityId: e.activityId });
        });

        newActivities.forEach(a => {
            a.expenses = newExpenses.filter(e => e.activityId === a.id);
        });
    }

    // Persist activities to local DB only (no sync push)
    newActivities.forEach(a => {
        upsertRecord('activities', a.id, a, { tripId: a.tripId, walletId: a.walletId });
    });

    set(s => ({
        activities: [
            ...s.activities.filter(a => a.tripId !== invite.tripId),
            ...newActivities,
        ],
        expenses: [
            ...s.expenses.filter(e => e.tripId !== invite.tripId),
            ...newExpenses,
        ],
    }));
}
