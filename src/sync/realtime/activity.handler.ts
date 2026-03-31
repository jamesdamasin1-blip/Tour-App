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

export function handleActivityChange(payload: any, _state: StateSnapshot): HandlerResult {
    const row = payload.new ?? payload.old;
    if (!row?.id) return { patch: null };

    console.log(`[REALTIME] Activity ${payload.eventType} for ${row.id} (trip: ${row.trip_id}) received. Delegating to Hard Refetch Strategy.`);

    // HARD REFETCH STRATEGY: Do not patch local state, do not trust incoming payload.
    // Force a full refetch for ALL clients so every device sees the authoritative DB state.
    // NOTE: Do NOT guard on specific columns here — Supabase may omit unchanged columns from
    // the realtime payload (e.g. when only is_completed changes, allocated_budget may be absent),
    // which would silently block the event for all subscribed clients.
    return {
        patch: null,
        triggerRefetchTripId: row.trip_id,
    };
}
