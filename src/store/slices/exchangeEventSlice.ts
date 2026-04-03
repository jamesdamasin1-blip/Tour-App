import { StateCreator } from 'zustand';
import { ExchangeEvent } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import {
    beginTripCloudMutation,
    endTripCloudMutation,
    fetchTripCloudBundle,
    refreshTripCloudStateInBackground,
} from '../cloudSyncHelpers';
import { syncTrace, summarizeFundingEvent, summarizeTrip, summarizeWallet } from '../../sync/debug';
import { stampFieldUpdates, supabase } from '../storeHelpers';
import type { AppState } from '../useStore';

export interface ExchangeEventSlice {
    exchangeEvents: ExchangeEvent[];
    addExchangeEvent: (event: Omit<ExchangeEvent, 'id'>) => Promise<void>;
    updateExchangeEvent: (id: string, data: Partial<Omit<ExchangeEvent, 'id' | 'tripId'>>) => Promise<void>;
    deleteExchangeEvent: (id: string) => Promise<void>;
}

export const createExchangeEventSlice: StateCreator<AppState, [], [], ExchangeEventSlice> = (_set, get) => ({
    exchangeEvents: [],

    addExchangeEvent: async (eventData) => {
        beginTripCloudMutation(eventData.tripId);
        try {
        syncTrace('BudgetMutation', 'submit_add', { tripId: eventData.tripId, walletId: eventData.walletId, eventData });
        const localTrip = get().trips.find(trip => trip.id === eventData.tripId);
        const localWallet = localTrip?.wallets.find(wallet => wallet.id === eventData.walletId);
        const wallet = localWallet ?? (await fetchTripCloudBundle(eventData.tripId))?.wallets.find(existing => existing.id === eventData.walletId);
        if (!wallet) {
            syncTrace('BudgetMutation', 'missing_wallet_for_add', { tripId: eventData.tripId, walletId: eventData.walletId });
            return;
        }
        syncTrace('BudgetMutation', 'resolved_wallet_for_add', {
            trip: summarizeTrip(localTrip),
            wallet: summarizeWallet(wallet),
        });

        const lastModified = Date.now();
        const newEvent: ExchangeEvent = {
            ...eventData,
            id: generateId(),
            version: 1,
            deletedAt: null,
            fieldUpdates: stampFieldUpdates({}, eventData as Record<string, unknown>, lastModified),
        };
        const { error: eventErr } = await supabase.rpc('add_funding_event_cloud', {
            p_event: { ...newEvent, id: undefined, lastModified },
        });
        if (eventErr) throw eventErr;
        syncTrace('BudgetMutation', 'rpc_add_success', summarizeFundingEvent(newEvent));

        refreshTripCloudStateInBackground(eventData.tripId, 'budget_add');
        syncTrace('BudgetMutation', 'refresh_after_add_deferred', { tripId: eventData.tripId });
        } finally {
            endTripCloudMutation(eventData.tripId);
        }
    },

    updateExchangeEvent: async (id, data) => {
        const tripId = await resolveTripIdForEvent(id, get().exchangeEvents);
        if (!tripId) return;

        beginTripCloudMutation(tripId);
        try {
            syncTrace('BudgetMutation', 'submit_update', { tripId, eventId: id, patch: data });
            const localEvent = get().exchangeEvents.find(existing => existing.id === id);
            const bundle = localEvent ? null : await fetchTripCloudBundle(tripId);
            const event = localEvent ?? bundle?.fundingLots.find(existing => existing.id === id);
            if (!event) {
                syncTrace('BudgetMutation', 'missing_event_for_update', { tripId, eventId: id });
                return;
            }

            if (data.walletId && data.walletId !== event.walletId) {
                throw new Error('Move budget entries by deleting and re-adding them to another wallet.');
            }
            const lastModified = Date.now();
            const updatedEvent = {
                ...event,
                ...data,
                fieldUpdates: stampFieldUpdates(event.fieldUpdates, data as Record<string, unknown>, lastModified),
                lastModified,
            };
            const { error: eventErr } = await supabase.rpc('update_funding_event_cloud', {
                p_event_id: id,
                p_event: updatedEvent,
            });
            if (eventErr) throw eventErr;
            syncTrace('BudgetMutation', 'rpc_update_success', summarizeFundingEvent(updatedEvent));

            refreshTripCloudStateInBackground(tripId, 'budget_update');
            syncTrace('BudgetMutation', 'refresh_after_update_deferred', { tripId, eventId: id });
        } finally {
            endTripCloudMutation(tripId);
        }
    },

    deleteExchangeEvent: async (id) => {
        const tripId = await resolveTripIdForEvent(id, get().exchangeEvents);
        if (!tripId) return;

        beginTripCloudMutation(tripId);
        try {
            syncTrace('BudgetMutation', 'submit_delete', { tripId, eventId: id });
            const { error: eventErr } = await supabase.rpc('delete_funding_event_cloud', {
                p_event_id: id,
            });
            if (eventErr) throw eventErr;
            syncTrace('BudgetMutation', 'rpc_delete_success', { tripId, eventId: id });

            refreshTripCloudStateInBackground(tripId, 'budget_delete');
            syncTrace('BudgetMutation', 'refresh_after_delete_deferred', { tripId, eventId: id });
        } finally {
            endTripCloudMutation(tripId);
        }
    },
});

const resolveTripIdForEvent = async (
    eventId: string,
    localEvents: ExchangeEvent[]
): Promise<string | null> => {
    const localEvent = localEvents.find(event => event.id === eventId);
    if (localEvent?.tripId) return localEvent.tripId;

    const { data, error } = await supabase
        .from('funding_lots')
        .select('trip_id')
        .eq('id', eventId)
        .maybeSingle();

    if (error) throw error;
    return data?.trip_id || null;
};
