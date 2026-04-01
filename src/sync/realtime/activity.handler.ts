/**
 * ACTIVITY REALTIME HANDLER
 * Pure function: postgres_changes payload + state snapshot → HandlerResult
 *
 * Responsibilities:
 *  - Soft/hard delete eviction
 *  - CRDT-lite merge for existing activities
 *  - Expense seeding for out-of-order arrivals (expense before activity)
 *
 * [SYNC][MERGE] prefixed logs for traceability across devices.
 */
import type { StateSnapshot, HandlerResult } from './types';
import { isSelfEmitted } from '../guards/device.guard';
import { isDeletion } from '../guards/deletion.guard';
import { mapActivityFromDb } from '../../mappers/activity.mapper';
import { syncTrace, summarizeRealtimePayload } from '../debug';

export function handleActivityChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) {
        syncTrace('ActivityRT', 'skip_self_emitted', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const row = payload.new ?? payload.old;
    if (!row?.id) {
        syncTrace('ActivityRT', 'skip_missing_id', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const incoming = { ...mapActivityFromDb(row), expenses: [] as any[] };

    if (isDeletion(payload.eventType, row)) {
        syncTrace('ActivityRT', 'delete_patch_only', summarizeRealtimePayload(payload));
        return {
            patch: {
                activities: state.activities.filter(a => a.id !== incoming.id),
                expenses: state.expenses.filter(e => e.activityId !== incoming.id),
            },
        };
    }

    const existing = state.activities.find(a => a.id === incoming.id);
    const tripExists = state.trips.some(t => t.id === incoming.tripId);
    if (!tripExists) {
        syncTrace('ActivityRT', 'missing_trip_refetch', summarizeRealtimePayload(payload));
        return {
            patch: null,
            triggerRefetchTripId: incoming.tripId,
        };
    }

    syncTrace('ActivityRT', 'patch_activity_row', summarizeRealtimePayload(payload));
    return {
        patch: {
            activities: [
                ...state.activities.filter(a => a.id !== incoming.id),
                {
                    ...(existing || {}),
                    ...incoming,
                    expenses: state.expenses.filter(e => e.activityId === incoming.id),
                } as any,
            ],
        },
    };
}
