/**
 * EXPENSE REALTIME HANDLER
 * Pure function: postgres_changes payload + state snapshot → HandlerResult
 *
 * DELETE path: reverse FIFO, retry any pending expenses, recompute wallet spent.
 * UPSERT path: merge expense, re-apply FIFO (reverse old → apply new), embed in activity.
 *
 * [SYNC][FIFO] prefixed logs for traceability across devices.
 */
import { isSelfEmitted } from '../guards/device.guard';
import { isDeletion } from '../guards/deletion.guard';
import { mapExpenseFromDb, safeNum } from '../../mappers/expense.mapper';
import { mergeEntity } from '../syncHelpers';
import { applyExpenseFIFO } from '../../finance/expense/expenseEngine';
import { reverseFIFO, recomputeWalletSpent } from '../../store/storeHelpers';
import type { Expense, Wallet } from '../../types/models';
import type { StateSnapshot, HandlerResult } from './types';

const MERGE_FIELDS = [
    'name', 'amount', 'currency', 'convertedAmountHome', 'convertedAmountTrip',
    'category', 'time', 'date', 'originalAmount', 'originalCurrency', 'lotBreakdown',
] as const;

export function handleExpenseChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) return { patch: null, triggerSync: true };

    const row = payload.new ?? payload.old;
    if (!row?.id) return { patch: null };

    // Guard: reject cross-dispatched events from other tables on the same channel.
    // Table specific rows are filtered by the channel subscription, but we check row.id
    // to ensure we have a valid entity.
    if (!row.id) return { patch: null };

    const incoming = mapExpenseFromDb(row);

    if (isDeletion(payload.eventType, row)) {
        return buildDeletePatch(incoming, state);
    }
    return buildUpsertPatch(incoming, state);
}

// ─── DELETE path ──────────────────────────────────────────────────

function buildDeletePatch(incoming: Expense, state: StateSnapshot): HandlerResult {
    const localExpense = state.expenses.find(e => e.id === incoming.id);
    const updatedExpenses = state.expenses.filter(e => e.id !== incoming.id);

    const activityId = incoming.activityId || localExpense?.activityId;
    const tripId = incoming.tripId || localExpense?.tripId;

    const updatedActivities = state.activities.map(a => {
        // When activityId is missing (e.g. minimal payload), scan all activities
        // that could potentially contain this expense.
        if (activityId && a.id !== activityId) return a;
        const filtered = (a.expenses ?? []).filter(e => e.id !== incoming.id);
        return filtered.length === (a.expenses?.length ?? 0) ? a : { ...a, expenses: filtered };
    });

    const updatedTrips = state.trips.map(t => {
        if (t.id !== incoming.tripId) return t;

        const updatedWallets = t.wallets.map((w): Wallet => {
            if (w.id !== (incoming.walletId || localExpense?.walletId) || !localExpense) return w;

            // Spontaneous activities: money is already permanently committed — skip credit-back.
            const linkedActivity = state.activities.find(a => a.id === (localExpense.activityId || activityId));
            if (linkedActivity?.isSpontaneous) return w;

            try {
                let lots = reverseFIFO(w, localExpense);

                // Retry FIFO for expenses that previously failed due to insufficient balance.
                // The reversal above freed funds — they may now succeed.
                const pending = updatedExpenses.filter(e => e.walletId === w.id && !e.lotBreakdown);
                for (const exp of pending) {
                    const amount = safeNum(exp.convertedAmountTrip || exp.amount);
                    if (amount > 0) {
                        try {
                            const result = applyExpenseFIFO({ ...w, lots } as any, amount);
                            lots = result.updatedWallet.lots;
                            (exp as any).lotBreakdown = result.breakdown;
                        } catch { /* still overdrawn — skip */ }
                    }
                }
                return { ...w, lots };
            } catch {
                return w;
            }
        });

        const completedActivityIds = new Set(
            updatedActivities.filter(a => a.tripId === t.id && a.isCompleted).map(a => a.id)
        );
        const validExpenses = updatedExpenses.filter(e => 
            e.tripId === t.id && (!e.activityId || completedActivityIds.has(e.activityId))
        );
        return { ...t, wallets: recomputeWalletSpent(updatedWallets, validExpenses, updatedActivities.filter(a => a.tripId === t.id)) };
    });

    console.log(`[SYNC] Expense ${incoming.id} deleted`);
    return { patch: { expenses: updatedExpenses, activities: updatedActivities, trips: updatedTrips } };
}

// ─── UPSERT path ──────────────────────────────────────────────────

function buildUpsertPatch(incoming: Expense, state: StateSnapshot): HandlerResult {
    try {
        const local = state.expenses.find(e => e.id === incoming.id);
        let merged: Expense;
        if (!local) {
            merged = { ...incoming };
        } else if ((incoming.version ?? 0) > (local.version ?? 0)) {
            // Version-based fast path: incoming is strictly newer — take all incoming
            // fields, preserving local-only data (lotBreakdown) that isn't in the DB.
            merged = { ...local, ...incoming, lotBreakdown: local.lotBreakdown };
        } else {
            // Same or older version — fall back to field-level CRDT merge
            merged = mergeEntity(local, incoming, MERGE_FIELDS as any);
        }

        // Defensive: ensure all numeric fields are valid finite numbers.
        merged.convertedAmountHome = safeNum(merged.convertedAmountHome);
        merged.convertedAmountTrip = safeNum(merged.convertedAmountTrip);
        merged.amount = safeNum(merged.amount);

        // Derive trip-currency amount from home amount when trip amount is missing.
        // Prevents FIFO from being skipped for expenses recorded in home currency.
        if (merged.convertedAmountTrip === 0 && merged.convertedAmountHome > 0) {
            const wallet = (state.trips.find(t => t.id === incoming.tripId)?.wallets ?? [])
                .find(w => w.id === incoming.walletId);
            const rate = (wallet as any)?.baselineExchangeRate ?? (wallet as any)?.defaultRate ?? 1;
            merged.convertedAmountTrip = safeNum(merged.convertedAmountHome / rate);
        }

        const updatedExpenses = local
            ? state.expenses.map(e => (e.id === incoming.id ? merged : e))
            : [...state.expenses, merged];

        // For brand-new expenses: apply FIFO locally for instant feedback — BUT only when the
        // linked activity is already completed (or the expense is spontaneous/unlinked).
        // Incomplete-activity expenses must NOT touch wallet lots here: the creator's device
        // defers FIFO to toggleActivityCompletion, so applying it on remote devices early
        // would make member wallets diverge from the creator's until the activity is completed.
        // For updates: recompute spentAmount immediately from the expense ledger.
        // Wallet lots are synced separately via wallet realtime/pull — no FIFO here for updates.
        // FIFO is only eligible when we can positively confirm the activity is complete.
        // If the activity isn't in local state yet (race: expenses arrive before activity),
        // we must NOT apply FIFO — it will be applied when toggleActivityCompletion runs.
        const linkedActivity = incoming.activityId
            ? state.activities.find(a => a.id === incoming.activityId)
            : undefined;
        const isEligibleForFIFO = !incoming.activityId   // spontaneous / unlinked expense
            || linkedActivity?.isCompleted === true       // activity explicitly completed
            || (linkedActivity as any)?.isSpontaneous === true; // spontaneous activity

        const updatedTrips = state.trips.map(t => {
            if (t.id !== incoming.tripId) return t;

            let updatedWallets = t.wallets;
            if (!local && isEligibleForFIFO) {
                // Brand-new expense on a completed/spontaneous activity: apply FIFO for instant lot deduction
                updatedWallets = t.wallets.map((w): Wallet => {
                    if (w.id !== incoming.walletId) return w;
                    try {
                        const amount = safeNum(merged.convertedAmountTrip || merged.amount);
                        if (amount <= 0) return w;
                        const { updatedWallet, breakdown } = applyExpenseFIFO(w as any, amount);
                        merged.lotBreakdown = breakdown;
                        return { ...w, lots: updatedWallet.lots };
                    } catch (err) {
                        console.error('[FIFO] Sync FIFO failed:', err);
                        return w;
                    }
                });
            }

            const completedActivityIds = new Set(
                state.activities.filter(a => a.tripId === t.id && a.isCompleted).map(a => a.id)
            );
            const validExpenses = updatedExpenses.filter(e => 
                e.tripId === t.id && (!e.activityId || completedActivityIds.has(e.activityId))
            );
            return { ...t, wallets: recomputeWalletSpent(updatedWallets, validExpenses, state.activities.filter(a => a.tripId === t.id)) };
        });

        const activityId = merged.activityId || local?.activityId;
        const updatedActivities = state.activities.map(a => {
            // Find parent activity: explicitly by activityId, or by scanning existing expenses
            const isTarget = (activityId && a.id === activityId) || 
                           (a.expenses ?? []).some(e => e.id === incoming.id);
            
            if (!isTarget) return a;

            const existing = a.expenses ?? [];
            const existsInActivity = existing.some(e => e.id === incoming.id);
            return {
                ...a,
                expenses: existsInActivity
                    ? existing.map(e => (e.id === incoming.id ? merged : e))
                    : [...existing, merged],
            };
        });

        console.log(`[SYNC] Expense ${incoming.id} upserted (${local ? 'update' : 'new'})`);
        return { patch: { expenses: updatedExpenses, activities: updatedActivities, trips: updatedTrips } };
    } catch (err) {
        console.error('[SYNC][expense.handler] crash prevented:', err);
        return { patch: null };
    }
}
