import { StateCreator } from 'zustand';
import { Activity, Expense, ExpenseCategory } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { getDefaultLot, getWalletBalance } from '../../finance/wallet/walletEngine';
import type { AppState } from '../useStore';
import {
    beginTripCloudMutation,
    endTripCloudMutation,
    fetchTripCloudBundle,
    refreshTripCloudState,
    setWalletErrorState,
} from '../cloudSyncHelpers';
import { syncTrace, summarizeActivity, summarizeExpenses, summarizeTrip, summarizeWallet } from '../../sync/debug';
import { stampFieldUpdates, supabase } from '../storeHelpers';

export interface ExpenseSlice {
    expenses: Expense[];
    addExpense: (
        tripId: string,
        walletId: string,
        activityId: string | undefined,
        expense: Omit<Expense, 'id' | 'tripId' | 'walletId' | 'activityId'> & { id?: string }
    ) => Promise<void>;
    updateExpense: (
        id: string,
        expense: Partial<Omit<Expense, 'id' | 'tripId' | 'walletId' | 'activityId'>>
    ) => Promise<void>;
    deleteExpense: (id: string) => Promise<void>;
    logSpontaneousExpense: (
        tripId: string,
        walletId: string,
        data: {
            title: string;
            amount: number;
            category: ExpenseCategory;
            originalAmount?: number;
            originalCurrency?: string;
            date: number;
        }
    ) => Promise<void>;
}

const withConvertedAmounts = (
    wallet: any,
    expenseData: Partial<Expense> & { amount?: number; convertedAmountTrip?: number; convertedAmountHome?: number }
) => {
    const tripAmount = expenseData.convertedAmountTrip ?? expenseData.amount ?? 0;
    const defaultLot = getDefaultLot(wallet as any);
    const lockedRate = defaultLot?.lockedRate ?? wallet.baselineExchangeRate ?? 1;

    return {
        currency: expenseData.currency || wallet.currency,
        convertedAmountTrip: tripAmount,
        convertedAmountHome: expenseData.convertedAmountHome ?? Math.round(tripAmount * lockedRate * 100) / 100,
    };
};

const assertSufficientWalletBalance = (
    wallet: any,
    requestedTripAmount: number,
    reclaimableTripAmount = 0
) => {
    const availableTripAmount = Number(getWalletBalance(wallet as any) || 0) + reclaimableTripAmount;
    if (requestedTripAmount > availableTripAmount + 0.01) {
        const currency = wallet?.currency || 'wallet currency';
        const availableFormatted = availableTripAmount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        throw new Error(`Not enough balance in this wallet. Available: ${currency} ${availableFormatted}.`);
    }
};

export const createExpenseSlice: StateCreator<AppState, [], [], ExpenseSlice> = (_set, _get) => ({
    expenses: [],

    addExpense: async (tripId, walletId, activityId, expenseData) => {
        beginTripCloudMutation(tripId);
        try {
            setWalletErrorState(null);
            syncTrace('ExpenseMutation', 'submit_add', { tripId, walletId, activityId, expenseData });
            const localTrip = _get().trips.find(trip => trip.id === tripId);
            const localWallet = localTrip?.wallets.find(wallet => wallet.id === walletId);
            const wallet = localWallet ?? (await fetchTripCloudBundle(tripId))?.wallets.find(w => w.id === walletId);
            if (!wallet) {
                syncTrace('ExpenseMutation', 'missing_wallet_for_add', { tripId, walletId, activityId });
                return;
            }
            syncTrace('ExpenseMutation', 'resolved_wallet_for_add', {
                trip: summarizeTrip(localTrip),
                wallet: summarizeWallet(wallet),
            });

            const lastModified = Date.now();
            const { currency, convertedAmountTrip, convertedAmountHome } = withConvertedAmounts(wallet, expenseData);
            assertSufficientWalletBalance(wallet, convertedAmountTrip);
            const expenseId = expenseData.id || generateId();

            const newExpense: Expense = {
                ...(expenseData as Expense),
                id: expenseId,
                tripId,
                walletId,
                activityId,
                currency,
                convertedAmountTrip,
                convertedAmountHome,
                date: expenseData.date || Date.now(),
                time: expenseData.time || Date.now(),
                version: expenseData.version ?? 1,
                deletedAt: null,
                lastModified,
                fieldUpdates: stampFieldUpdates({}, {
                    ...(expenseData as Record<string, unknown>),
                    currency,
                    convertedAmountTrip,
                    convertedAmountHome,
                }, lastModified),
            };
            const { error: expenseErr } = await supabase.rpc('add_expense_cloud', {
                p_expense: newExpense,
            });
            if (expenseErr) throw expenseErr;
            syncTrace('ExpenseMutation', 'rpc_add_success', summarizeExpenses([newExpense]));

            await refreshTripCloudState(tripId);
            syncTrace('ExpenseMutation', 'refresh_after_add_done', { tripId, walletId, activityId });
        } catch (error: any) {
            setWalletErrorState(error?.message || 'Check your wallet balances!');
            syncTrace('ExpenseMutation', 'add_failed', {
                tripId,
                walletId,
                activityId,
                message: error?.message,
            });
            console.error('[Expense] Add failed:', error);
            throw error;
        } finally {
            endTripCloudMutation(tripId);
        }
    },

    updateExpense: async (id, expenseData) => {
        const localExpense = _get().expenses.find(expense => expense.id === id);
        const tripId = localExpense?.tripId;
        if (!tripId) return;

        beginTripCloudMutation(tripId);
        try {
            setWalletErrorState(null);
            syncTrace('ExpenseMutation', 'submit_update', { tripId, expenseId: id, patch: expenseData });

            const localTrip = _get().trips.find(trip => trip.id === tripId);
            const bundle = (!localExpense || !localTrip)
                ? await fetchTripCloudBundle(tripId)
                : null;
            const expense = localExpense ?? bundle?.expenses.find(existing => existing.id === id);
            if (!expense) {
                syncTrace('ExpenseMutation', 'missing_expense_for_update', { tripId, expenseId: id });
                return;
            }

            const wallet = localTrip?.wallets.find(existing => existing.id === expense.walletId)
                ?? bundle?.wallets.find(existing => existing.id === expense.walletId);
            if (!wallet) {
                syncTrace('ExpenseMutation', 'missing_wallet_for_update', { tripId, expenseId: id, walletId: expense.walletId });
                return;
            }
            syncTrace('ExpenseMutation', 'resolved_expense_for_update', {
                trip: summarizeTrip(localTrip ?? bundle?.trip),
                wallet: summarizeWallet(wallet),
                expense: summarizeExpenses([expense]),
            });

            const lastModified = Date.now();
            const amountOrCurrencyChanged = expenseData.amount !== undefined || expenseData.currency !== undefined;
            const converted = amountOrCurrencyChanged
                ? withConvertedAmounts(wallet, {
                    amount: expenseData.amount ?? expense.amount,
                    currency: expenseData.currency ?? expense.currency,
                    convertedAmountTrip: expenseData.convertedAmountTrip,
                    convertedAmountHome: expenseData.convertedAmountHome,
                })
                : {
                    currency: expense.currency,
                    convertedAmountTrip: expense.convertedAmountTrip,
                    convertedAmountHome: expense.convertedAmountHome,
                };
            assertSufficientWalletBalance(
                wallet,
                converted.convertedAmountTrip,
                expense.convertedAmountTrip || expense.amount || 0
            );

            let updatedExpense: Expense = {
                ...expense,
                ...expenseData,
                ...converted,
                lastModified,
            };
            updatedExpense.fieldUpdates = stampFieldUpdates(
                expense.fieldUpdates,
                { ...expenseData, ...converted },
                lastModified
            );
            const { error: expenseErr } = await supabase.rpc('update_expense_cloud', {
                p_expense_id: id,
                p_expense: updatedExpense,
            });
            if (expenseErr) throw expenseErr;
            syncTrace('ExpenseMutation', 'rpc_update_success', summarizeExpenses([updatedExpense]));

            await refreshTripCloudState(tripId);
            syncTrace('ExpenseMutation', 'refresh_after_update_done', { tripId, expenseId: id });
        } catch (error: any) {
            setWalletErrorState(error?.message || 'Check your wallet balances!');
            syncTrace('ExpenseMutation', 'update_failed', {
                tripId,
                expenseId: id,
                message: error?.message,
            });
            console.error('[Expense] Update failed:', error);
            throw error;
        } finally {
            endTripCloudMutation(tripId);
        }
    },

    deleteExpense: async (id) => {
        const tripId = _get().expenses.find(expense => expense.id === id)?.tripId;
        if (!tripId) return;

        beginTripCloudMutation(tripId);
        try {
            setWalletErrorState(null);
            syncTrace('ExpenseMutation', 'submit_delete', { tripId, expenseId: id });

            const { error: expenseErr } = await supabase.rpc('delete_expense_cloud', {
                p_expense_id: id,
            });
            if (expenseErr) throw expenseErr;
            syncTrace('ExpenseMutation', 'rpc_delete_success', { tripId, expenseId: id });

            await refreshTripCloudState(tripId);
            syncTrace('ExpenseMutation', 'refresh_after_delete_done', { tripId, expenseId: id });
        } catch (error: any) {
            setWalletErrorState(error?.message || 'Check your wallet balances!');
            syncTrace('ExpenseMutation', 'delete_failed', {
                tripId,
                expenseId: id,
                message: error?.message,
            });
            console.error('[Expense] Delete failed:', error);
            throw error;
        } finally {
            endTripCloudMutation(tripId);
        }
    },

    logSpontaneousExpense: async (tripId, walletId, data) => {
        beginTripCloudMutation(tripId);
        try {
            setWalletErrorState(null);
            syncTrace('ExpenseMutation', 'submit_spontaneous', { tripId, walletId, data });
            const localTrip = _get().trips.find(trip => trip.id === tripId);
            const localWallet = localTrip?.wallets.find(wallet => wallet.id === walletId);
            const wallet = localWallet ?? (await fetchTripCloudBundle(tripId))?.wallets.find(existing => existing.id === walletId);
            if (!wallet) {
                syncTrace('ExpenseMutation', 'missing_wallet_for_spontaneous', { tripId, walletId });
                return;
            }
            syncTrace('ExpenseMutation', 'resolved_wallet_for_spontaneous', {
                trip: summarizeTrip(localTrip),
                wallet: summarizeWallet(wallet),
            });

            const lastModified = Date.now();
            const activityId = generateId();
            const expenseId = generateId();
            const defaultLot = getDefaultLot(wallet as any);
            const lockedRate = defaultLot?.lockedRate ?? wallet.baselineExchangeRate ?? 1;
            const convertedAmountTrip = data.amount;
            const convertedAmountHome = Math.round(convertedAmountTrip * lockedRate * 100) / 100;
            assertSufficientWalletBalance(wallet, convertedAmountTrip);

            const newExpense: Expense = {
                id: expenseId,
                tripId,
                walletId,
                activityId,
                name: data.title,
                amount: data.amount,
                currency: wallet.currency,
                convertedAmountTrip,
                convertedAmountHome,
                category: data.category,
                date: data.date,
                time: lastModified,
                originalAmount: data.originalAmount,
                originalCurrency: data.originalCurrency,
                version: 1,
                deletedAt: null,
                lastModified,
                fieldUpdates: stampFieldUpdates({}, {
                    tripId,
                    walletId,
                    activityId,
                    name: data.title,
                    amount: data.amount,
                    currency: wallet.currency,
                    convertedAmountTrip,
                    convertedAmountHome,
                    category: data.category,
                    date: data.date,
                    time: lastModified,
                    originalAmount: data.originalAmount,
                    originalCurrency: data.originalCurrency,
                }, lastModified),
            };

            const newActivity: Activity = {
                id: activityId,
                tripId,
                walletId,
                title: data.title,
                category: data.category,
                date: data.date,
                time: lastModified,
                allocatedBudget: data.amount,
                budgetCurrency: wallet.currency,
                isCompleted: true,
                isSpontaneous: true,
                lastModified,
                expenses: [newExpense],
                countries: [],
                version: 1,
                deletedAt: null,
                fieldUpdates: stampFieldUpdates({}, {
                    tripId,
                    walletId,
                    title: data.title,
                    category: data.category,
                    date: data.date,
                    time: lastModified,
                    allocatedBudget: data.amount,
                    budgetCurrency: wallet.currency,
                    isCompleted: true,
                    isSpontaneous: true,
                    countries: [],
                }, lastModified),
            };
            const { error } = await supabase.rpc('log_spontaneous_expense_cloud', {
                p_activity: newActivity,
                p_expense: newExpense,
            });
            if (error) throw error;
            syncTrace('ExpenseMutation', 'rpc_spontaneous_success', {
                activity: summarizeActivity(newActivity),
                expense: summarizeExpenses([newExpense]),
            });

            await refreshTripCloudState(tripId);
            syncTrace('ExpenseMutation', 'refresh_after_spontaneous_done', { tripId, walletId });
        } catch (error: any) {
            setWalletErrorState(error?.message || 'Check your wallet balances!');
            syncTrace('ExpenseMutation', 'spontaneous_failed', {
                tripId,
                walletId,
                message: error?.message,
            });
            console.error('[Expense] Spontaneous expense failed:', error);
            throw error;
        } finally {
            endTripCloudMutation(tripId);
        }
    },
});
