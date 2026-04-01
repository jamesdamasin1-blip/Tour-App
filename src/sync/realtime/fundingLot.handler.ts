import { isSelfEmitted } from '../guards/device.guard';
import { isSoftDeleted } from '../guards/deletion.guard';
import { mapFundingLotFromDb } from '../../mappers/wallet.mapper';
import type { StateSnapshot, HandlerResult } from './types';
import { syncTrace, summarizeRealtimePayload } from '../debug';

export function handleFundingLotChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) {
        syncTrace('FundingLotRT', 'skip_self_emitted', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const row = payload.new ?? payload.old;
    if (!row?.id) {
        syncTrace('FundingLotRT', 'skip_missing_id', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    if (isSoftDeleted(row)) {
        syncTrace('FundingLotRT', 'delete_patch_only', summarizeRealtimePayload(payload));
        return {
            patch: {
                exchangeEvents: state.exchangeEvents.filter(e => e.id !== row.id),
            },
        };
    }

    const incoming = mapFundingLotFromDb(row);
    const tripExists = state.trips.some(t => t.id === incoming.tripId);
    if (!tripExists) {
        syncTrace('FundingLotRT', 'missing_trip_refetch', summarizeRealtimePayload(payload));
        return {
            patch: null,
            triggerRefetchTripId: incoming.tripId,
        };
    }

    syncTrace('FundingLotRT', 'patch_event_row', summarizeRealtimePayload(payload));
    return {
        patch: {
            exchangeEvents: [
                ...state.exchangeEvents.filter(e => e.id !== incoming.id),
                incoming,
            ],
        },
    };
}
