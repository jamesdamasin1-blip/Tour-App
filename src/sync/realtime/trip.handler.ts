import { isSelfEmitted } from '../guards/device.guard';
import { isSoftDeleted } from '../guards/deletion.guard';
import { mapTripFromDb } from '../../mappers/trip.mapper';
import type { StateSnapshot, HandlerResult } from './types';
import { syncTrace, summarizeRealtimePayload } from '../debug';

export function handleTripChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) {
        syncTrace('TripRT', 'skip_self_emitted', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const row = payload.new ?? payload.old;
    if (!row?.id) {
        syncTrace('TripRT', 'skip_missing_id', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const incoming = mapTripFromDb(row);

    if (isSoftDeleted(row)) {
        syncTrace('TripRT', 'evict_soft_deleted', summarizeRealtimePayload(payload));
        return {
            patch: {
                trips: state.trips.filter(t => t.id !== incoming.id),
                activities: state.activities.filter(a => a.tripId !== incoming.id),
                expenses: state.expenses.filter(e => e.tripId !== incoming.id),
            },
        };
    }

    const members: any[] = (incoming as any).members ?? [];
    const removedIds: string[] = (incoming as any).removedMemberUserIds ?? [];
    const isSelfRemoved =
        state.currentUserId &&
        (removedIds.includes(state.currentUserId) ||
            members.some((m: any) => m.userId === state.currentUserId && m.removed === true));

    if (isSelfRemoved) {
        syncTrace('TripRT', 'evict_self_removed', {
            payload: summarizeRealtimePayload(payload),
            currentUserId: state.currentUserId,
        });
        return {
            patch: {
                trips: state.trips.filter(t => t.id !== incoming.id),
                activities: state.activities.filter(a => a.tripId !== incoming.id),
                expenses: state.expenses.filter(e => e.tripId !== incoming.id),
            },
        };
    }

    const existingTrip = state.trips.find(t => t.id === incoming.id);
    const nextTrip = {
        ...(existingTrip || {}),
        ...incoming,
        wallets: 'wallets' in incoming ? incoming.wallets : existingTrip?.wallets,
        isCloudSynced: true,
    };

    syncTrace('TripRT', 'patch_trip_row', summarizeRealtimePayload(payload));
    return {
        patch: {
            trips: [
                ...state.trips.filter(t => t.id !== incoming.id),
                nextTrip as any,
            ],
        },
    };
}
