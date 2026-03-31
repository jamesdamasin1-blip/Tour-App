import { StateCreator } from 'zustand';
import { Activity, Expense, Wallet } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { applyExpenseFIFO } from '../../finance/expense/expenseEngine';
import { getDefaultLot } from '../../finance/wallet/walletEngine';
import { reverseFIFO, stampFieldUpdates } from '../storeHelpers';
import type { AppState } from '../useStore';

export interface ActivitySlice {
    activities: Activity[];
    addActivity: (activity: Omit<Activity, 'id' | 'lastModified'> & { expenses?: Expense[] }) => Promise<void>;
    updateActivity: (id: string, activity: Partial<Omit<Activity, 'id' | 'expenses' | 'lastModified'>> & { expenses?: Expense[], recalculateExpenses?: boolean }) => Promise<void>;
    deleteActivity: (id: string) => Promise<void>;
    toggleActivityCompletion: (id: string) => Promise<void>;
}

/**
 * Convert a raw expense to have correct home/trip amounts using the wallet's locked rate.
 * Skips conversion when pre-computed amounts are already present and recalculation is not forced.
 */
const withConvertedAmounts = (exp: any, trip: any, recalculate: boolean): any => {
    if (exp.convertedAmountHome && exp.convertedAmountTrip && !recalculate) return { ...exp };
    const expWallet = trip?.wallets?.find((w: any) => w.id === exp.walletId);
    const defaultLot = expWallet ? getDefaultLot(expWallet) : undefined;
    const lockedRate = defaultLot?.lockedRate ?? expWallet?.baselineExchangeRate ?? 1;
    const currency = exp.currency || expWallet?.currency || trip?.tripCurrency || trip?.homeCurrency || 'PHP';
    return {
        ...exp,
        convertedAmountHome: Math.round(exp.amount * lockedRate * 100) / 100,
        convertedAmountTrip: exp.amount,
        currency,
    };
};

export const createActivitySlice: StateCreator<AppState, [], [], ActivitySlice> = (set, get) => ({
    activities: [],

    addActivity: async (activityData) => {
        const state = get();
        const trip = state.trips.find(t => t.id === activityData.tripId);
        const inputExpenses = activityData.expenses || [];
        const activityId = generateId();
        const finalExpenses: Expense[] = inputExpenses.map((exp: any) => {
            const normalized = withConvertedAmounts(exp, trip, false);
            return {
                ...normalized,
                tripId: activityData.tripId,
                walletId: normalized.walletId || activityData.walletId,
                activityId,
                name: normalized.name || activityData.title,
            };
        });
        const newActivity = {
            ...activityData,
            id: activityId,
            expenses: finalExpenses,
            lastModified: Date.now(),
            version: 1,
            deletedAt: null,
            fieldUpdates: stampFieldUpdates({}, activityData),
        };
        console.log(`[STORE] Adding activity ${newActivity.id} to trip ${newActivity.tripId} directly to DB`);
        
        const { mapActivityToDb } = await import('../../mappers/activity.mapper');
        // @ts-ignore
        const dbActivity = mapActivityToDb(newActivity);
        
        // 1. Direct DB Write
        const { supabase } = await import('../../utils/supabase');
        const { error } = await supabase.from('activities').insert(dbActivity);
        
        if (error) {
            console.error('[Activity] Add failed:', error);
            return;
        }

        if (finalExpenses.length > 0) {
            const { mapExpenseToDb } = await import('../../mappers/expense.mapper');
            // @ts-ignore
            const dbExpenses = finalExpenses.map((e: any) => ({ ...mapExpenseToDb(e), updated_at: newActivity.lastModified }));
            const { error: expErr } = await supabase.from('expenses').upsert(dbExpenses);
            if (expErr) {
                console.error('[Activity] Add expenses failed:', expErr);
                return;
            }
        }

        // 2. Hard Refetch
        const { refetchTripActivities } = await import('../../sync/syncEngine');
        await refetchTripActivities(activityData.tripId);
    },

    updateActivity: async (id, activityData) => {
        const state = get();
        const activity = state.activities.find(a => a.id === id);
        if (!activity) return;

        // Guard: Prevent actual cost edits when completed
        if (activity.isCompleted && activityData.expenses) {
            console.warn('[Activity] Cannot edit cost of a completed activity.');
            return;
        }

        const trip = state.trips.find(t => t.id === activity.tripId);
        
        const finalExpenses: Expense[] = activityData.expenses
            ? activityData.expenses.map((exp: any) =>
                withConvertedAmounts(exp, trip, !!activityData.recalculateExpenses)
              )
            : activity.expenses;

        const { mapActivityToDb } = await import('../../mappers/activity.mapper');
        const lastModified = Date.now();
        const fieldUpdates = stampFieldUpdates(activity.fieldUpdates, activityData, lastModified, ['expenses', 'recalculateExpenses']);
        
        // @ts-ignore
        const dbActivity = mapActivityToDb({ ...activity, ...activityData, lastModified, fieldUpdates });
        
        // 1. Direct DB Read/Write
        const { supabase } = await import('../../utils/supabase');
        const { error: actErr } = await supabase.from('activities').update(dbActivity).eq('id', id);
        
        if (actErr) {
            console.error('[Activity] Update failed:', actErr);
            return;
        }

        // 2. Direct DB mutations for expenses (actual cost representation)
        if (activityData.expenses) {
            const { mapExpenseToDb } = await import('../../mappers/expense.mapper');
            const newIds = new Set(finalExpenses.map((e: any) => e.id));
            
            // Soft delete removed
            const removedIds = activity.expenses.filter(e => !newIds.has(e.id)).map(e => e.id);
            if (removedIds.length > 0) {
                await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).in('id', removedIds);
            }
            
            // Upsert remaining/new
            if (finalExpenses.length > 0) {
                // @ts-ignore
                const dbExpenses = finalExpenses.map((e: any) => ({ ...mapExpenseToDb(e), updated_at: lastModified }));
                await supabase.from('expenses').upsert(dbExpenses);
            }
        }

        // 3. Hard Refetch
        const { refetchTripActivities } = await import('../../sync/syncEngine');
        await refetchTripActivities(activity.tripId);
    },

    deleteActivity: async (id) => {
        const activity = get().activities.find(a => a.id === id);
        if (!activity) return;

        const { supabase } = await import('../../utils/supabase');
        // Direct DB Soft Delete
        const { error } = await supabase.from('activities').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        
        if (error) {
            console.error('[Activity] Delete failed:', error);
            return;
        }

        const { refetchTripActivities } = await import('../../sync/syncEngine');
        await refetchTripActivities(activity.tripId);
    },

    toggleActivityCompletion: async (id: string) => {
        const state = get();
        const activity = state.activities.find(a => a.id === id);
        if (!activity) return;

        const { supabase } = await import('../../utils/supabase');

        // Always fetch current DB status before toggling
        const { data: dbRow, error: fetchErr } = await supabase
            .from('activities')
            .select('is_completed')
            .eq('id', id)
            .single();

        if (fetchErr || !dbRow) {
            console.error('[Activity] Toggle completion: failed to fetch current DB status:', fetchErr);
            return;
        }

        const isCompleted = !dbRow.is_completed;
        const lastModified = Date.now();

        // Start Deferred FIFO Logic
        const trip = state.trips.find(t => t.id === activity.tripId);
        if (!trip) return;

        // Clone wallets for modification
        let updatedWallets = [...trip.wallets];
        const activityExpenses = state.expenses.filter(e => e.activityId === id);
        const expensesToUpdate: Expense[] = [];

        for (const exp of activityExpenses) {
            const walletIndex = updatedWallets.findIndex(w => w.id === exp.walletId);
            if (walletIndex === -1) continue;

            const wallet = updatedWallets[walletIndex];

            if (isCompleted && !exp.lotBreakdown) {
                // Apply FIFO
                try {
                    const amount = typeof exp.convertedAmountTrip === 'number' && exp.convertedAmountTrip > 0 
                        ? exp.convertedAmountTrip 
                        : typeof exp.amount === 'number' ? exp.amount : 0;
                    
                    if (amount > 0) {
                        const { updatedWallet, breakdown } = applyExpenseFIFO(wallet as any, amount);
                        updatedWallets[walletIndex] = updatedWallet as Wallet;
                        expensesToUpdate.push({ ...exp, lotBreakdown: breakdown, lastModified });
                    }
                } catch (e) {
                    console.error('[FIFO] Failed to apply FIFO during activity completion:', e);
                }
            } else if (!isCompleted && exp.lotBreakdown) {
                // Reverse FIFO
                try {
                    const restoredLots = reverseFIFO(wallet as any, exp as any);
                    updatedWallets[walletIndex] = { ...wallet, lots: restoredLots };
                    // Reset lotBreakdown
                    const { lotBreakdown, ...clearedExp } = exp;
                    expensesToUpdate.push({ ...clearedExp, lastModified } as Expense);
                } catch (e) {
                    console.error('[FIFO] Failed to reverse FIFO during activity un-completion:', e);
                }
            }
        }

        // Send updates to Database
        
        // 1. Update expenses with lotBreakdowns
        if (expensesToUpdate.length > 0) {
            const { mapExpenseToDb } = await import('../../mappers/expense.mapper');
            // @ts-ignore
            const dbExpenses = expensesToUpdate.map(e => ({ ...mapExpenseToDb(e), updated_at: lastModified }));
            await supabase.from('expenses').upsert(dbExpenses);
        }

        // 2. Update the authoritative wallets table with new lot arrays
        if (expensesToUpdate.length > 0) {
            const { mapWalletToDb } = await import('../../mappers/wallet.mapper');
            for (const wallet of updatedWallets) {
                const originalWallet = trip.wallets.find(w => w.id === wallet.id);
                // Only send UPSERT if the lot breakdown actually changed for this wallet
                if (originalWallet && JSON.stringify(originalWallet.lots) !== JSON.stringify(wallet.lots)) {
                    // @ts-ignore
                    const dbWallet = mapWalletToDb({ ...wallet, lastModified });
                    await supabase.from('wallets').upsert(dbWallet);
                }
            }
        }

        // 3. Update the activity itself
        const { error } = await supabase.from('activities').update({
            is_completed: isCompleted,
            last_modified: lastModified,
            updated_at: lastModified,
        }).eq('id', id);

        if (error) {
            console.error('[Activity] Toggle completion failed:', error);
            return;
        }

        // Hard Refetch — updates this device immediately.
        const { refetchTripActivities } = await import('../../sync/syncEngine');
        await refetchTripActivities(activity.tripId);
    },
});
