import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildActualExpense,
    calculateDisplayedActualTotal,
    reconcileActualExpenses,
} from '../src/features/activity/hooks/createActivity.helpers';

test('displayed actual total follows the selected display currency', () => {
    const expenses = [
        {
            amount: 10,
            convertedAmountTrip: 10,
            convertedAmountHome: 50,
            currency: 'MYR',
        },
        {
            amount: 20,
            convertedAmountTrip: 20,
            convertedAmountHome: 100,
            currency: 'USD',
        },
    ] as any;

    assert.equal(calculateDisplayedActualTotal(expenses, 'MYR', 'MYR', 'PHP', 5), 30);
    assert.equal(calculateDisplayedActualTotal(expenses, 'PHP', 'MYR', 'PHP', 5), 150);
    assert.equal(calculateDisplayedActualTotal(expenses, 'USD', 'MYR', 'PHP', 5), 20);
});

test('buildActualExpense normalizes home-currency input into trip and home amounts', () => {
    const expense = buildActualExpense({
        actualCost: '500',
        actualCurrency: 'PHP',
        activeWalletCurrency: 'MYR',
        category: 'Food',
        currentMemberId: 'member-1',
        dateValue: 123,
        effectiveRate: 5,
        homeCurrency: 'PHP',
        title: 'Dinner',
        tripCurrency: 'MYR',
        tripId: 'trip-1',
        walletId: 'wallet-1',
    });

    assert.ok(expense);
    assert.equal(expense?.amount, 100);
    assert.equal(expense?.convertedAmountTrip, 100);
    assert.equal(expense?.convertedAmountHome, 500);
    assert.equal(expense?.currency, 'MYR');
    assert.equal(expense?.originalAmount, 500);
    assert.equal(expense?.originalCurrency, 'PHP');
});

test('reconcileActualExpenses appends an adjustment when actual spend increases', () => {
    const nextExpenses = reconcileActualExpenses({
        actualCost: '150',
        actualCurrency: 'PHP',
        activeWalletCurrency: 'MYR',
        currentMemberId: 'member-1',
        currentSpent: 100,
        editingActivity: {
            title: 'Boat ride',
            category: 'Transport',
            expenses: [],
        },
        effectiveRate: 5,
        homeCurrency: 'PHP',
        tripCurrency: 'MYR',
        tripId: 'trip-1',
        walletId: 'wallet-1',
        activityId: 'activity-1',
    });

    assert.equal(nextExpenses.length, 1);
    assert.equal(nextExpenses[0]?.convertedAmountTrip, 10);
    assert.equal(nextExpenses[0]?.convertedAmountHome, 50);
    assert.equal(nextExpenses[0]?.originalAmount, 50);
});

test('reconcileActualExpenses rewrites the primary expense when actual spend decreases', () => {
    const nextExpenses = reconcileActualExpenses({
        actualCost: '80',
        actualCurrency: 'PHP',
        activeWalletCurrency: 'MYR',
        currentMemberId: 'member-2',
        currentSpent: 100,
        editingActivity: {
            title: 'Lunch',
            category: 'Food',
            expenses: [{
                id: 'expense-1',
                date: 1000,
                time: 2000,
                createdBy: 'member-1',
                lastModifiedBy: 'member-1',
            } as any],
        },
        effectiveRate: 4,
        homeCurrency: 'PHP',
        tripCurrency: 'MYR',
        tripId: 'trip-1',
        walletId: 'wallet-1',
        activityId: 'activity-1',
    });

    assert.equal(nextExpenses.length, 1);
    assert.equal(nextExpenses[0]?.id, 'expense-1');
    assert.equal(nextExpenses[0]?.convertedAmountTrip, 20);
    assert.equal(nextExpenses[0]?.convertedAmountHome, 80);
    assert.equal(nextExpenses[0]?.createdBy, 'member-1');
    assert.equal((nextExpenses[0] as any)?.lastModifiedBy, 'member-2');
});
