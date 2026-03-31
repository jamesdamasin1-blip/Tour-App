/**
 * WALLET REALTIME HANDLER
 * Pure function: postgres_changes payload + state snapshot → HandlerResult
 *
 * Responsibilities:
 *  - CRDT-lite merge for wallet fields
 *  - totalBudgetHomeCached recomputation after wallet update
 *
 * Note: wallet deletions are handled at the trip level (trip.handler).
 * A deleted wallet shows up as a trip update with the wallet removed from the wallets array.
 *
 * [SYNC][MERGE] prefixed logs for traceability across devices.
 */
import { isSelfEmitted } from '../guards/device.guard';
import { isSoftDeleted } from '../guards/deletion.guard';
import { mapWalletFromDb } from '../../mappers/wallet.mapper';
import { mergeEntity } from '../syncHelpers';
import { getFundingTotalGlobalHome } from '../../finance/wallet/walletEngine';
import type { StateSnapshot, HandlerResult } from './types';

const MERGE_FIELDS = [
    'currency', 'totalBudget', 'spentAmount', 'defaultRate',
    'baselineExchangeRate', 'lots', 'deletedAt',
] as const;

export function handleWalletChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) return { patch: null };

    const row = payload.new ?? payload.old;
    if (!row?.id) return { patch: null };

    // Guard: reject cross-dispatched events from other tables on the same channel.
    // Wallet rows have 'default_rate'; activity/expense/lot rows do not.
    if (!('default_rate' in row)) return { patch: null };

    // Wallet soft-deletes are reflected via trip.wallets JSONB in the trip handler.
    if (isSoftDeleted(row)) return { patch: null };

    let applied = false;

    const updatedTrips = state.trips.map(t => {
        if (t.id !== row.trip_id) return t;

        const existingWallet = (t.wallets ?? []).find(w => w.id === row.id);
        const incomingWallet = mapWalletFromDb(row, existingWallet);

        const mergedWallet = existingWallet
            ? mergeEntity(existingWallet, incomingWallet, MERGE_FIELDS as any)
            : incomingWallet;

        const updatedWallets = existingWallet
            ? t.wallets.map(w => (w.id === row.id ? mergedWallet : w))
            : [...(t.wallets ?? []), mergedWallet];

        const totalBudgetHomeCached = updatedWallets.reduce((sum, wallet) => {
            return sum + getFundingTotalGlobalHome(wallet as any, t.homeCurrency ?? 'PHP');
        }, 0);

        applied = true;
        return { ...t, wallets: updatedWallets, totalBudgetHomeCached };
    });

    if (!applied) return { patch: null };

    console.log(`[MERGE] Wallet ${row.id} merged to v${Number(row.version ?? 1)}`);
    return { patch: { trips: updatedTrips } };
}
