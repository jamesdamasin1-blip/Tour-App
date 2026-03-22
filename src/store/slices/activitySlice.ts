import { StateCreator } from 'zustand';
import { Activity, Expense, Wallet } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { applyExpenseFIFO } from '../../finance/expense/expenseEngine';
import { getDefaultLot } from '../../finance/wallet/walletEngine';
import { offlineSync, reverseFIFO, recomputeWalletSpent } from '../storeHelpers';
import type { AppState } from '../useStore';

export interface ActivitySlice {
    activities: Activity[];
    addActivity: (activity: Omit<Activity, 'id' | 'expenses' | 'lastModified'>) => void;
    updateActivity: (id: string, activity: Partial<Omit<Activity, 'id' | 'expenses' | 'lastModified'>> & { expenses?: Expense[], recalculateExpenses?: boolean }) => void;
    deleteActivity: (id: string) => void;
    toggleActivityCompletion: (id: string) => void;
}

export const createActivitySlice: StateCreator<AppState, [], [], ActivitySlice> = (set) => ({
    activities: [],

    addActivity: (activityData) =>
        set((state) => {
            const newActivity = {
                ...activityData,
                id: generateId(),
                expenses: [],
                lastModified: Date.now(),
                version: 1,
                deletedAt: null,
            };

            offlineSync.activity(newActivity);

            return {
                activities: [...state.activities, newActivity],
                trips: state.trips.map(t => t.id === activityData.tripId ? { ...t, lastModified: newActivity.lastModified } : t)
            };
        }),

    updateActivity: (id, activityData) =>
        set((state) => {
            const activity = state.activities.find(a => a.id === id);
            if (!activity) return state;

            const lastModified = Date.now();
            const trip = state.trips.find(t => t.id === activity.tripId);

            let finalExpenses = activity.expenses;
            if (activityData.expenses) {
                finalExpenses = activityData.expenses.map((exp: any) => {
                    if (exp.convertedAmountHome && exp.convertedAmountTrip && !activityData.recalculateExpenses) {
                        return { ...exp };
                    }

                    const expWallet = trip?.wallets?.find(w => w.id === exp.walletId);
                    const defaultLot = expWallet ? getDefaultLot(expWallet as any) : undefined;
                    const lockedRate: number = defaultLot?.lockedRate ?? (expWallet as any)?.baselineExchangeRate ?? 1;

                    const expenseCurrency = exp.currency || expWallet?.currency || trip?.tripCurrency || 'MYR';
                    const convertedAmountTrip = exp.amount;
                    const convertedAmountHome = Math.round(convertedAmountTrip * lockedRate * 100) / 100;

                    return {
                        ...exp,
                        convertedAmountHome,
                        convertedAmountTrip,
                        currency: expenseCurrency
                    };
                });
            }

            const updated = {
                ...activity,
                ...activityData,
                expenses: finalExpenses,
                lastModified
            };

            offlineSync.activityUpdate(id, updated);
            if (activityData.expenses) {
                finalExpenses.forEach((e: any) => offlineSync.expense(e));
            }

            const updatedExpenses = activityData.expenses
                ? [
                    ...state.expenses.filter(e => e.activityId !== id),
                    ...finalExpenses
                  ]
                : state.expenses;

            return {
                activities: state.activities.map(a => a.id === id ? updated : a),
                expenses: updatedExpenses,
                trips: state.trips.map(t => {
                    if (t.id !== activity.tripId) return t;
                    if (!activityData.expenses) return { ...t, lastModified };

                    let wallets = t.wallets.map((w): Wallet => {
                        const oldExpenses = state.expenses.filter(
                            e => e.activityId === id && e.walletId === w.id
                        );
                        let lots = w.lots || [];
                        for (const exp of oldExpenses) {
                            lots = reverseFIFO({ ...w, lots } as Wallet, exp);
                        }

                        const newExpenses = finalExpenses.filter(
                            (e: any) => e.walletId === w.id
                        );
                        for (const exp of newExpenses) {
                            const amount = exp.convertedAmountTrip || 0;
                            if (amount > 0) {
                                try {
                                    const fifoResult = applyExpenseFIFO(
                                        { ...w, lots } as any, amount
                                    );
                                    lots = fifoResult.updatedWallet.lots;
                                    exp.lotBreakdown = fifoResult.breakdown;
                                } catch (e) {
                                    console.error('[updateActivity] FIFO re-apply failed:', e);
                                }
                            }
                        }

                        return { ...w, lots };
                    });

                    wallets = recomputeWalletSpent(wallets, updatedExpenses);

                    return { ...t, lastModified, wallets };
                })
            };
        }),

    deleteActivity: (id) =>
        set((state) => {
            const activity = state.activities.find(a => a.id === id);
            if (!activity) return state;

            const lastModified = Date.now();

            const activityExpenses = state.expenses.filter(e => e.activityId === id);
            const hasActualCosts = activityExpenses.length > 0;

            offlineSync.activityDelete(id);

            return {
                activities: state.activities.filter(a => a.id !== id),
                expenses: hasActualCosts
                    ? state.expenses.map(e =>
                        e.activityId === id ? { ...e, activityId: undefined } : e
                      )
                    : state.expenses.filter(e => e.activityId !== id),
                trips: state.trips.map(t => t.id === activity.tripId ? { ...t, lastModified } : t)
            };
        }),

    toggleActivityCompletion: (id: string) =>
        set((state) => {
            const activity = state.activities.find(a => a.id === id);
            if (!activity) return state;

            const lastModified = Date.now();
            const isCompleted = !activity.isCompleted;

            offlineSync.activityUpdate(id, { ...activity, isCompleted, lastModified });

            return {
                activities: state.activities.map(a => a.id === id ? { ...a, isCompleted, lastModified } : a),
                trips: state.trips.map(t => t.id === activity.tripId ? { ...t, lastModified } : t)
            };
        }),
});
