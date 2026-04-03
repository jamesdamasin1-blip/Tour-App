import { Expense, Wallet, Activity } from '../types/models';
import { persistTripHideLocally } from '../sync/storeIntegration';
import { supabase } from '../utils/supabase';

// ─── Helpers ───────────────────────────────────────────────────────

/** Persist a device-local hide flag after a successful cloud leave. */
export const persistLocalTripHide = (id: string, data: any) => {
    try {
        persistTripHideLocally(id, data);
    } catch (e) {
        console.error('[Persist] tripHide:', e);
    }
};

/** 
 * Automatically generates a fieldUpdates map for CRDT-lite architectures 
 * based on the keys present in a patch object.
 */
export const stampFieldUpdates = (
    existingUpdates: Record<string, number> | undefined,
    patch: Record<string, any>,
    timestamp: number = Date.now(),
    exclude: string[] = []
): Record<string, number> => {
    const next = { ...(existingUpdates || {}) };
    for (const key of Object.keys(patch)) {
        if (!exclude.includes(key) && patch[key] !== undefined) {
            next[key] = timestamp;
        }
    }
    return next;
};

/** Reverse FIFO: restore lot balances from an expense's lotBreakdown.
 *  Falls back to LIFO restoration (newest lot first) when lotBreakdown is absent —
 *  this happens for expenses pulled from the server which don't carry lotBreakdown. */
export const reverseFIFO = (wallet: Wallet, expense: Expense): Wallet['lots'] => {
    const lots = wallet.lots || [];

    if (expense.lotBreakdown?.length) {
        const breakdownMap = new Map(expense.lotBreakdown.map(b => [b.lotId, b.amount]));
        let remainingFromBreakdown = 0;
        for (const item of expense.lotBreakdown) remainingFromBreakdown += item.amount || 0;

        const restoredFromBreakdown = lots.map(lot => {
            const restore = breakdownMap.get(lot.id);
            if (!restore) return lot;
            remainingFromBreakdown = Number((remainingFromBreakdown - restore).toFixed(4));
            return {
                ...lot,
                remainingAmount: Number((lot.remainingAmount + restore).toFixed(4)),
            };
        });

        // If none of the stored lot ids match the current wallet lots (or only a subset do),
        // fall back to amount-based restoration for the unreconciled remainder.
        if (remainingFromBreakdown <= 0) {
            return restoredFromBreakdown;
        }

        const restored = [...restoredFromBreakdown];
        let remaining = remainingFromBreakdown;
        for (let i = restored.length - 1; i >= 0 && remaining > 0; i--) {
            const lot = restored[i];
            const capacity = Math.max(0, (lot.originalConvertedAmount ?? 0) - lot.remainingAmount);
            if (capacity <= 0) continue;
            const add = Math.min(remaining, capacity);
            restored[i] = { ...lot, remainingAmount: Number((lot.remainingAmount + add).toFixed(4)) };
            remaining = Number((remaining - add).toFixed(4));
        }
        return restored;
    }

    // Fallback: no lotBreakdown — restore by adding back to lots LIFO (newest first).
    // This is exact for single-lot wallets and approximate for multi-lot wallets.
    let remaining = expense.convertedAmountTrip || 0;
    if (remaining <= 0) return lots;

    const restored = [...lots];
    for (let i = restored.length - 1; i >= 0 && remaining > 0; i--) {
        const lot = restored[i];
        // How much was spent from this lot = original - remaining (always >= 0)
        const spent = Math.max(0, (lot.originalConvertedAmount ?? 0) - lot.remainingAmount);
        if (spent <= 0) continue; // nothing was spent from this lot, skip
        const add = Math.min(remaining, spent);
        restored[i] = { ...lot, remainingAmount: Number((lot.remainingAmount + add).toFixed(4)) };
        remaining = Number((remaining - add).toFixed(4));
    }
    return restored;
};

/** Recompute spentAmount from the expense ledger and completed activities — O(n+m) via pre-indexed maps */
export const recomputeWalletSpent = (
    wallets: Wallet[], 
    expenses: Expense[], 
    activities: Activity[] = []
): Wallet[] => {
    const spentByWallet = new Map<string, number>();

    // Sum valid expenses
    for (const e of expenses) {
        spentByWallet.set(e.walletId, (spentByWallet.get(e.walletId) || 0) + (e.convertedAmountTrip || 0));
    }

    return wallets.map(w => ({
        ...w,
        spentAmount: spentByWallet.get(w.id) || 0,
    }));
};

/** Re-export supabase for slices that need it */
export { supabase };
