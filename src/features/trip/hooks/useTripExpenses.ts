import { useMemo } from 'react';
import { useStore } from '@/src/store/useStore';
import { Expense } from '@/src/types/models';

export const useTripExpenses = (tripId: string) => {
    const allExpenses = useStore(state => state.expenses);
    const addExpenseAction = useStore(state => state.addExpense);
    const deleteExpenseAction = useStore(state => state.deleteExpense);

    const tripExpenses = useMemo(() => 
        allExpenses.filter(e => e.tripId === tripId), 
    [allExpenses, tripId]);

    const addExpense = (walletId: string, activityId: string | undefined, expenseData: Omit<Expense, 'id' | 'tripId' | 'walletId' | 'activityId'>) => {
        addExpenseAction(tripId, walletId, activityId, expenseData);
    };

    const deleteExpense = (id: string) => {
        deleteExpenseAction(id);
    };

    return {
        tripExpenses,
        addExpense,
        deleteExpense
    };
};
