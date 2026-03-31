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
import { isSelfEmitted } from '../guards/device.guard';
import { isDeletion } from '../guards/deletion.guard';
import { mapActivityFromDb } from '../../mappers/activity.mapper';
import { mergeEntity } from '../syncHelpers';
import type { Activity } from '../../types/models';
import type { StateSnapshot, HandlerResult } from './types';

const MERGE_FIELDS = [
    'title', 'category', 'date', 'time', 'endTime',
    'allocatedBudget', 'budgetCurrency', 'isCompleted',
    'isSpontaneous', 'description', 'location', 'countries',
] as const;

export function handleActivityChange(payload: any, state: StateSnapshot): HandlerResult {
    const row = payload.new ?? payload.old;
    if (!row?.id) return { patch: null };

    // Guard: reject cross-dispatched events from other tables on the same channel.
    if (!('allocated_budget' in row) && !('budget_currency' in row)) {
        return { patch: null };
    }

    console.log(`[REALTIME] Activity ${payload.eventType} for ${row.id} (trip: ${row.trip_id}) received. Delegating to Hard Refetch Strategy.`);

    // HARD REFETCH STRATEGY: Do not patch local state, do not trust incoming payload (could be out of order).
    // Instead, we force the client to refetch ALL activities for the trip to ensure strict consistency.
    return {
        patch: null,
        triggerRefetchTripId: row.trip_id,
    };
}
