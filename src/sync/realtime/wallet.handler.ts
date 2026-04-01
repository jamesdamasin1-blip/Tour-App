import { isSelfEmitted } from '../guards/device.guard';
import { isSoftDeleted } from '../guards/deletion.guard';
import { mapWalletFromDb } from '../../mappers/wallet.mapper';
import type { StateSnapshot, HandlerResult } from './types';
import { syncTrace, summarizeRealtimePayload } from '../debug';

export function handleWalletChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) {
        syncTrace('WalletRT', 'skip_self_emitted', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const row = payload.new ?? payload.old;
    if (!row?.id) {
        syncTrace('WalletRT', 'skip_missing_id', summarizeRealtimePayload(payload));
        return { patch: null };
    }
    const trip = state.trips.find(existing => existing.id === row.trip_id);
    if (!trip) {
        syncTrace('WalletRT', 'missing_trip_refetch', summarizeRealtimePayload(payload));
        return {
            patch: null,
            triggerRefetchTripId: row.trip_id,
        };
    }
    if (isSoftDeleted(row)) {
        syncTrace('WalletRT', 'delete_patch_only', summarizeRealtimePayload(payload));
        return {
            patch: {
                trips: state.trips.map(existing =>
                    existing.id !== row.trip_id
                        ? existing
                        : {
                            ...existing,
                            wallets: (existing.wallets || []).filter(wallet => wallet.id !== row.id),
                        }
                ),
            },
        };
    }

    const existingWallet = trip.wallets.find(wallet => wallet.id === row.id);
    const incomingWallet = mapWalletFromDb(row, existingWallet);
    syncTrace('WalletRT', 'patch_wallet_row', summarizeRealtimePayload(payload));
    return {
        patch: {
            trips: state.trips.map(existing =>
                existing.id !== row.trip_id
                    ? existing
                    : {
                        ...existing,
                        wallets: [
                            ...(existing.wallets || []).filter(wallet => wallet.id !== row.id),
                            incomingWallet,
                        ],
                    }
            ),
        },
    };
}
