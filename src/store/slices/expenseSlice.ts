import { StateCreator } from 'zustand';
import { Expense, ExpenseCategory, Wallet } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { applyExpenseFIFO } from '../../finance/expense/expenseEngine';
import { getDefaultLot } from '../../finance/wallet/walletEngine';
import { offlineSync, reverseFIFO, recomputeWalletSpent } from '../storeHelpers';
import type { AppState } from '../useStore';

export interface ExpenseSlice {
    expenses: Expense[];
    addExpense: (tripId: string, walletId: string, activityId: string | undefined, expense: Omit<Expense, 'id' | 'tripId' | 'walletId' | 'activityId'>) => void;
    updateExpense: (id: string, expense: Partial<Omit<Expense, 'id' | 'tripId' | 'walletId' | 'activityId'>>) => void;
    deleteExpense: (id: string) => void;
    logSpontaneousExpense: (tripId: string, walletId: string, data: { title: string, amount: number, category: ExpenseCategory, originalAmount?: number, originalCurrency?: string, date: number }) => void;
}

export const createExpenseSlice: StateCreator<AppState, [], [], ExpenseSlice> = (set) => ({
    expenses: [],

    addExpense: (tripId, walletId, activityId, expenseData) =>
        set((state) => {
            const expenseId = generateId();
            const lastModified = Date.now();
            const trip = state.trips.find(t => t.id === tripId);
            const wallet = trip?.wallets?.find(w => w.id === walletId);

            if (!wallet) return state;

            const expenseCurrency = (expenseData as any).currency || wallet.currency;
            const expenseAmount: number = (expenseData as any).amount || 0;
            const convertedAmountTrip: number = (expenseData as any).convertedAmountTrip ?? expenseAmount;

            let updatedWallet;
            let breakdown = [];
            try {
                const fifoResult = applyExpenseFIFO(wallet as any, convertedAmountTrip);
                updatedWallet = fifoResult.updatedWallet;
                breakdown = fifoResult.breakdown;
            } catch (e: any) {
                console.error('applyExpenseFIFO Failed:', e);
                return state;
            }

            const defaultLot = getDefaultLot(wallet as any);
            const lockedRate: number = defaultLot?.lockedRate ?? (wallet as any).baselineExchangeRate ?? 1;

            const convertedAmountHome: number = (expenseData as any).convertedAmountHome ??
                Math.round(convertedAmountTrip * lockedRate * 100) / 100;

            const newExpense: Expense = {
                ...(expenseData as any),
                id: expenseId,
                tripId,
                walletId,
                activityId,
                currency: expenseCurrency,
                convertedAmountHome,
                convertedAmountTrip,
                lotBreakdown: breakdown,
                date: (expenseData as any).date || Date.now(),
                time: (expenseData as any).time || Date.now(),
                version: 1,
                deletedAt: null,
            };

            let updatedActivities = state.activities;
            if (activityId) {
                updatedActivities = state.activities.map(a =>
                    a.id === activityId ? { ...a, expenses: [...(a.expenses || []), newExpense], lastModified } : a
                );
            }

            offlineSync.expense(newExpense);

            const allExpensesAfterAdd = [...state.expenses, newExpense];

            return {
                expenses: allExpensesAfterAdd,
                activities: updatedActivities,
                trips: state.trips.map(t => {
                    if (t.id === tripId) {
                        return {
                            ...t,
                            lastModified,
                            wallets: (t.wallets || []).map((w): Wallet => w.id === walletId ? {
                                ...w,
                                lots: updatedWallet.lots,
                                spentAmount: allExpensesAfterAdd
                                    .filter(e => e.walletId === w.id)
                                    .reduce((sum, e) => sum + (e.convertedAmountTrip || 0), 0)
                            } : w)
                        };
                    }
                    return t;
                })
            };
        }),

    updateExpense: (id, expenseData) =>
        set((state) => {
            const expense = state.expenses.find(e => e.id === id);
            if (!expense) return state;

            const trip = state.trips.find(t => t.id === expense.tripId);
            const lastModified = Date.now();

            const newAmount = expenseData.amount ?? expense.amount;
            const amountOrCurrencyChanged = expenseData.amount !== undefined || expenseData.currency !== undefined;

            let convertedAmountHome = expense.convertedAmountHome;
            let convertedAmountTrip = expense.convertedAmountTrip;

            if (amountOrCurrencyChanged) {
                const walletForExpense = trip?.wallets?.find(w => w.id === expense.walletId);
                const defaultLot = walletForExpense ? getDefaultLot(walletForExpense as any) : undefined;
                const lockedRate: number = defaultLot?.lockedRate ?? (walletForExpense as any)?.baselineExchangeRate ?? 1;

                convertedAmountTrip = newAmount;
                convertedAmountHome = Math.round(convertedAmountTrip * lockedRate * 100) / 100;
            }

            const updatedExpense: Expense = {
                ...expense,
                ...expenseData,
                convertedAmountHome,
                convertedAmountTrip,
            };

            let updatedActivities = state.activities;
            if (expense.activityId) {
                updatedActivities = state.activities.map(a =>
                    a.id === expense.activityId
                        ? {
                            ...a,
                            expenses: a.expenses.map(e => e.id === id ? updatedExpense : e),
                            lastModified
                        }
                        : a
                );
            }

            offlineSync.expenseUpdate(id, updatedExpense);

            const updatedExpenses = state.expenses.map(e => e.id === id ? updatedExpense : e);
            return {
                expenses: updatedExpenses,
                activities: updatedActivities,
                trips: state.trips.map(t => {
                    if (t.id === expense.tripId) {
                        return {
                            ...t,
                            lastModified,
                            wallets: recomputeWalletSpent(t.wallets, updatedExpenses),
                        };
                    }
                    return t;
                })
            };
        }),

    deleteExpense: (id) =>
        set((state) => {
            const expense = state.expenses.find(e => e.id === id);
            if (!expense) return state;

            const lastModified = Date.now();
            const trip = state.trips.find(t => t.id === expense.tripId);

            let updatedActivities = state.activities;
            if (expense.activityId) {
                updatedActivities = state.activities.map(a =>
                    a.id === expense.activityId ? { ...a, expenses: (a.expenses || []).filter(e => e.id !== id), lastModified } : a
                );
            }

            offlineSync.expenseDelete(id);

            const expensesAfterDelete = state.expenses.filter(e => e.id !== id);

            return {
                expenses: expensesAfterDelete,
                activities: updatedActivities,
                trips: state.trips.map(t => {
                    if (t.id === expense.tripId) {
                        const restoredWallets: Wallet[] = t.wallets.map(w => {
                            if (w.id === expense.walletId) {
                                return { ...w, lots: reverseFIFO(w, expense) };
                            }
                            return w;
                        });

                        return {
                            ...t,
                            lastModified,
                            wallets: recomputeWalletSpent(restoredWallets, expensesAfterDelete),
                        };
                    }
                    return t;
                })
            };
        }),

    logSpontaneousExpense: (tripId, walletId, data) =>
        set((state) => {
            const activityId = generateId();
            const expenseId = generateId();
            const curTime = Date.now();
            const trip = state.trips.find(t => t.id === tripId);
            const wallet = trip?.wallets?.find(w => w.id === walletId);

            if (!wallet) return state;

            const walletCurrency = wallet.currency;

            let updatedWallet;
            let breakdown = [];
            try {
                const fifoResult = applyExpenseFIFO(wallet as any, data.amount);
                updatedWallet = fifoResult.updatedWallet;
                breakdown = fifoResult.breakdown;
            } catch (e: any) {
                console.error('applyExpenseFIFO Failed (spontaneous):', e);
                return state;
            }

            const defaultLot = getDefaultLot(wallet as any);
            const lockedRate: number = defaultLot?.lockedRate ?? (wallet as any).baselineExchangeRate ?? 1;

            const convertedAmountTrip: number = (data as any).convertedAmountTrip ?? data.amount;
            const convertedAmountHome: number = (data as any).convertedAmountHome ?? Math.round(convertedAmountTrip * lockedRate * 100) / 100;

            const newExpense: Expense = {
                id: expenseId,
                tripId,
                walletId,
                activityId,
                name: data.title,
                amount: data.amount,
                currency: walletCurrency,
                convertedAmountHome,
                convertedAmountTrip,
                category: data.category,
                date: data.date,
                time: curTime,
                originalAmount: data.originalAmount,
                originalCurrency: data.originalCurrency,
                lotBreakdown: breakdown,
                version: 1,
                deletedAt: null,
            };

            const newActivity = {
                id: activityId,
                tripId: tripId,
                walletId,
                title: data.title,
                category: data.category,
                date: data.date,
                time: curTime,
                allocatedBudget: data.amount,
                budgetCurrency: walletCurrency,
                isCompleted: true,
                isSpontaneous: true,
                lastModified: curTime,
                expenses: [newExpense],
                countries: [],
                version: 1,
                deletedAt: null,
            };

            offlineSync.activity(newActivity);
            offlineSync.expense(newExpense);

            const allExpensesAfterSpontaneous = [...state.expenses, newExpense];
            return {
                activities: [...state.activities, newActivity],
                expenses: allExpensesAfterSpontaneous,
                trips: state.trips.map(t => {
                    if (t.id === tripId) {
                        return {
                            ...t,
                            lastModified: curTime,
                            wallets: (t.wallets || []).map((w): Wallet => w.id === walletId ? {
                                ...w,
                                lots: updatedWallet.lots,
                                spentAmount: allExpensesAfterSpontaneous
                                    .filter(e => e.walletId === w.id)
                                    .reduce((sum, e) => sum + (e.convertedAmountTrip || 0), 0)
                            } : w)
                        };
                    }
                    return t;
                })
            };
        }),
});
