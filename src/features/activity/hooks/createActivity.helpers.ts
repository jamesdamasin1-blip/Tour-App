import { Calculations as MathUtils } from '../../../utils/mathUtils';
import { Expense } from '../../../types/models';

interface BuildActualExpenseParams {
    actualCost: string;
    actualCurrency: string;
    activeWalletCurrency: string;
    category: string;
    currentMemberId: string | null;
    dateValue: number;
    effectiveRate: number;
    homeCurrency: string;
    title: string;
    tripCurrency: string;
    tripId: string;
    walletId: string;
    expenseActivityId?: string;
}

interface ReconcileActualExpenseParams {
    actualCost: string;
    actualCurrency: string;
    activeWalletCurrency: string;
    currentMemberId: string | null;
    currentSpent: number;
    editingActivity: { title?: string; category?: string; expenses?: Expense[] };
    effectiveRate: number;
    homeCurrency: string;
    tripCurrency: string;
    tripId: string;
    walletId: string;
    activityId: string;
}

export function calculateDisplayedActualTotal(
    expenses: Expense[] = [],
    selectedCurrency: string,
    tripCurrency: string,
    homeCurrency: string,
    effectiveRate: number
) {
    return expenses.reduce((sum, expense) => {
        if (selectedCurrency === tripCurrency) {
            return sum + (expense.convertedAmountTrip || expense.amount);
        }
        if (selectedCurrency === homeCurrency) {
            return sum + (expense.convertedAmountHome || (expense.amount / (effectiveRate || 1)));
        }
        if (expense.currency === selectedCurrency) return sum + expense.amount;
        return sum;
    }, 0);
}

export function buildActualExpense({
    actualCost,
    actualCurrency,
    activeWalletCurrency,
    category,
    currentMemberId,
    dateValue,
    effectiveRate,
    homeCurrency,
    title,
    tripCurrency,
    tripId,
    walletId,
    expenseActivityId,
}: BuildActualExpenseParams): Expense | null {
    const numericActualCost = actualCost.trim() !== '' ? MathUtils.parseCurrencyInput(actualCost) : null;
    if (numericActualCost === null || numericActualCost <= 0) return null;

    const { amountInHome, amountInTrip } = normalizeActualAmounts(
        numericActualCost,
        actualCurrency,
        homeCurrency,
        effectiveRate
    );

    return {
        id: MathUtils.generateId(),
        tripId,
        walletId,
        activityId: expenseActivityId,
        name: title.trim() || 'Manual Entry',
        category: category as any,
        amount: amountInTrip,
        currency: activeWalletCurrency || homeCurrency,
        convertedAmountHome: amountInHome,
        convertedAmountTrip: amountInTrip,
        date: dateValue,
        time: Date.now(),
        originalAmount: numericActualCost,
        originalCurrency: actualCurrency,
        createdBy: currentMemberId || undefined,
        lastModifiedBy: currentMemberId || undefined,
        version: 1,
    };
}

export function reconcileActualExpenses({
    actualCost,
    actualCurrency,
    activeWalletCurrency,
    currentMemberId,
    currentSpent,
    editingActivity,
    effectiveRate,
    homeCurrency,
    tripCurrency,
    tripId,
    walletId,
    activityId,
}: ReconcileActualExpenseParams) {
    const numericActualCost = actualCost.trim() !== '' ? MathUtils.parseCurrencyInput(actualCost) : null;
    if (numericActualCost === null) {
        return [...(editingActivity.expenses || [])];
    }

    const diff = numericActualCost - currentSpent;
    if (diff > 0.01) {
        const { amountInHome, amountInTrip } = normalizeActualAmounts(
            diff,
            actualCurrency,
            homeCurrency,
            effectiveRate
        );

        return [
            ...(editingActivity.expenses || []),
            {
                id: MathUtils.generateId(),
                tripId,
                walletId,
                activityId,
                name: editingActivity.title || 'Cost Adjustment',
                category: (editingActivity.category as any) || 'Other',
                amount: amountInTrip,
                currency: activeWalletCurrency || homeCurrency,
                convertedAmountHome: amountInHome,
                convertedAmountTrip: amountInTrip,
                date: Date.now(),
                time: Date.now(),
                originalAmount: diff,
                originalCurrency: actualCurrency,
                createdBy: currentMemberId || undefined,
                version: 1,
            },
        ];
    }

    if (diff < -0.01) {
        const { amountInHome, amountInTrip } = normalizeActualAmounts(
            numericActualCost,
            actualCurrency,
            homeCurrency,
            effectiveRate
        );

        return [{
            id: MathUtils.generateId(),
            tripId,
            walletId,
            activityId,
            name: editingActivity.title || 'Manual Entry',
            category: (editingActivity.category as any) || 'Other',
            amount: amountInTrip,
            currency: activeWalletCurrency || homeCurrency,
            convertedAmountHome: amountInHome,
            convertedAmountTrip: amountInTrip,
            date: Date.now(),
            time: Date.now(),
            originalAmount: numericActualCost,
            originalCurrency: actualCurrency,
            createdBy: currentMemberId || undefined,
            version: 1,
        }];
    }

    return [...(editingActivity.expenses || [])];
}

function normalizeActualAmounts(
    amount: number,
    actualCurrency: string,
    homeCurrency: string,
    effectiveRate: number
) {
    if (actualCurrency === homeCurrency) {
        return {
            amountInTrip: amount / (effectiveRate || 1),
            amountInHome: amount,
        };
    }

    return {
        amountInTrip: amount,
        amountInHome: amount * (effectiveRate || 1),
    };
}
