/**
 * FUNDING LOT REALTIME HANDLER
 * Pure function: postgres_changes payload + state snapshot → HandlerResult
 *
 * Responsibilities:
 *  - Soft-delete eviction from exchangeEvents
 *  - Strict version-based LWW (funding lots have no field-level merge)
 *  - Injection into trip.wallets.lots visual cache for instant Header budget update
 *  - totalBudgetHomeCached recomputation from lot sources
 *
 * [SYNC][GUARD] prefixed logs for traceability across devices.
 */
import { isSelfEmitted } from '../guards/device.guard';
import { isSoftDeleted } from '../guards/deletion.guard';
import { shouldApplyStrict } from '../guards/version.guard';
import { mapFundingLotFromDb } from '../../mappers/wallet.mapper';
import { safeNum } from '../../mappers/expense.mapper';
import type { StateSnapshot, HandlerResult } from './types';

export function handleFundingLotChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) return { patch: null };

    const row = payload.new ?? payload.old;
    if (!row?.id) return { patch: null };

    // Guard: reject cross-dispatched events from other tables on the same channel.
    // Funding lot rows have 'source_amount'; activity/expense/wallet rows do not.
    if (!('source_amount' in row)) return { patch: null };

    // ── Soft delete: remove from exchange events ───────────────────
    if (isSoftDeleted(row)) {
        console.log(`[SYNC] FundingLot ${row.id} soft-deleted — evicting`);
        return {
            patch: {
                exchangeEvents: state.exchangeEvents.filter(e => e.id !== row.id),
            },
        };
    }

    const incoming = mapFundingLotFromDb(row);
    const local = state.exchangeEvents.find(e => e.id === row.id);

    // ── Strict LWW version guard ───────────────────────────────────
    if (local && !shouldApplyStrict(local, incoming)) {
        console.log(`[GUARD] FundingLot ${row.id} skipped — local v${local.version} >= incoming v${incoming.version}`);
        return { patch: null };
    }

    const updatedEvents = local
        ? state.exchangeEvents.map(e => (e.id === row.id ? incoming : e))
        : [...state.exchangeEvents, incoming];

    // ── Inject into trip.wallets.lots visual cache ─────────────────
    // The wallets table stores lots as JSONB. Realtime updates to the wallets
    // table arrive on a separate channel. This injection ensures the Header
    // budget reacts immediately without waiting for the wallet channel update.
    const updatedTrips = state.trips.map(t => {
        if (t.id !== row.trip_id) return t;

        const updatedWallets = t.wallets.map(w => {
            if (w.id !== row.wallet_id) return w;

            const lotRate = safeNum(row.rate);
            const lotSourceAmount = safeNum(row.source_amount);
            const lotConverted = lotRate > 0 ? lotSourceAmount / lotRate : 0;

            const mappedLot = {
                id: row.id,
                walletCurrency: w.currency,
                sourceCurrency: row.source_currency ?? t.homeCurrency ?? 'PHP',
                sourceAmount: lotSourceAmount,
                originalConvertedAmount: lotConverted,
                remainingAmount: lotConverted,
                lockedRate: lotRate || 1,
                isDefault: true, // enforce default on sync to align with creator
                createdAt: Date.now(),
            };

            const existingLots = w.lots ?? [];
            const lotExists = existingLots.some((l: any) => l.id === row.id);

            // When adding a new default lot, demote all previous lots to non-default.
            const preppedLots = lotExists
                ? existingLots
                : existingLots.map((l: any) => ({ ...l, isDefault: false }));

            const updatedLots = lotExists
                ? preppedLots.map((l: any) =>
                    l.id === row.id
                        // Preserve existing remainingAmount — FIFO deductions are authoritative locally.
                        ? { ...l, ...mappedLot, remainingAmount: l.remainingAmount }
                        : l
                  )
                : [...preppedLots, mappedLot];

            return { ...w, lots: updatedLots };
        });

        // Recompute totalBudgetHomeCached from lot source amounts.
        const totalBudgetHomeCached = updatedWallets.reduce((sum, wallet) => {
            return (wallet.lots ?? []).reduce((acc: number, lot: any) => {
                if (lot.sourceCurrency === (t.homeCurrency ?? 'PHP')) {
                    return acc + safeNum(lot.sourceAmount);
                }
                if (lot.rateBaseCurrency) {
                    return acc + safeNum(lot.originalConvertedAmount) * safeNum(lot.rateBaseCurrency);
                }
                return acc + safeNum(lot.sourceAmount);
            }, sum);
        }, 0);

        return { ...t, wallets: updatedWallets, totalBudgetHomeCached };
    });

    console.log(`[SYNC] FundingLot ${row.id} applied to v${incoming.version}`);
    return { patch: { exchangeEvents: updatedEvents, trips: updatedTrips } };
}
