import { Expense, Wallet } from '../types/models';
import {
    syncTrip, syncTripUpdate, syncTripDelete,
    syncActivity, syncActivityUpdate, syncActivityDelete,
    syncExpense, syncExpenseUpdate, syncExpenseDelete,
    syncExchangeEvent, syncWallet, syncWalletUpdate,
} from '../sync/storeIntegration';
import { supabase } from '../utils/supabase';

// ─── Helpers ───────────────────────────────────────────────────────

/** Persist mutation to local DB + sync queue. Safe to call always. */
export const offlineSync = {
    trip: (data: any) => { try { syncTrip(data); } catch (e) { console.error('[Persist] trip:', e); } },
    tripUpdate: (id: string, data: any) => { try { syncTripUpdate(id, data); } catch (e) { console.error('[Persist] tripUpdate:', e); } },
    tripDelete: (id: string) => { try { syncTripDelete(id); } catch (e) { console.error('[Persist] tripDelete:', e); } },
    activity: (data: any) => { try { syncActivity(data); } catch (e) { console.error('[Persist] activity:', e); } },
    activityUpdate: (id: string, data: any) => { try { syncActivityUpdate(id, data); } catch (e) { console.error('[Persist] activityUpdate:', e); } },
    activityDelete: (id: string) => { try { syncActivityDelete(id); } catch (e) { console.error('[Persist] activityDelete:', e); } },
    expense: (data: any) => { try { syncExpense(data); } catch (e) { console.error('[Persist] expense:', e); } },
    expenseUpdate: (id: string, data: any) => { try { syncExpenseUpdate(id, data); } catch (e) { console.error('[Persist] expenseUpdate:', e); } },
    expenseDelete: (id: string) => { try { syncExpenseDelete(id); } catch (e) { console.error('[Persist] expenseDelete:', e); } },
    exchangeEvent: (data: any) => { try { syncExchangeEvent(data); } catch (e) { console.error('[Persist] exchangeEvent:', e); } },
    wallet: (data: any) => { try { syncWallet(data); } catch (e) { console.error('[Persist] wallet:', e); } },
    walletUpdate: (id: string, data: any) => { try { syncWalletUpdate(id, data); } catch (e) { console.error('[Persist] walletUpdate:', e); } },
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
        return lots.map(lot => {
            const restore = breakdownMap.get(lot.id);
            if (!restore) return lot;
            return {
                ...lot,
                remainingAmount: Number((lot.remainingAmount + restore).toFixed(4)),
            };
        });
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

/** Recompute spentAmount from the expense ledger — O(n+m) via pre-indexed map */
export const recomputeWalletSpent = (wallets: Wallet[], expenses: Expense[]): Wallet[] => {
    const spentByWallet = new Map<string, number>();
    for (const e of expenses) {
        spentByWallet.set(e.walletId, (spentByWallet.get(e.walletId) || 0) + (e.convertedAmountTrip || 0));
    }
    return wallets.map(w => ({
        ...w,
        spentAmount: spentByWallet.get(w.id) || 0,
    }));
};

// ─── Schema validation for importTrip ─────────────────────────────

const isValidString = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 500;
const isValidNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isValidId = (v: unknown): v is string => typeof v === 'string' && v.length >= 8 && v.length <= 64;

const VALID_CATEGORIES: Set<string> = new Set(['Food', 'Transport', 'Hotel', 'Sightseeing', 'Other']);

export const validateImportedTrip = (data: any): boolean => {
    if (!data || typeof data !== 'object') return false;
    if (!isValidId(data.id)) return false;
    if (!isValidString(data.title)) return false;
    if (!isValidNumber(data.startDate) || !isValidNumber(data.endDate)) return false;
    if (!isValidString(data.homeCurrency) || data.homeCurrency.length !== 3) return false;
    if (!isValidNumber(data.lastModified)) return false;
    if (!Array.isArray(data.wallets)) return false;

    for (const w of data.wallets) {
        if (!isValidId(w.id)) return false;
        if (!isValidString(w.currency) || w.currency.length !== 3) return false;
        if (!isValidNumber(w.totalBudget) || w.totalBudget < 0) return false;
    }

    if (data.activities && !Array.isArray(data.activities)) return false;
    if (data.activities) {
        for (const a of data.activities) {
            if (!isValidId(a.id)) return false;
            if (!isValidString(a.title)) return false;
            if (!VALID_CATEGORIES.has(a.category)) return false;
            if (!isValidNumber(a.date)) return false;
            if (!isValidNumber(a.allocatedBudget) || a.allocatedBudget < 0) return false;
        }
    }

    return true;
};

/** Re-export supabase for slices that need it */
export { supabase };
