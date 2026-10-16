import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildTripDisplayFields,
    getPrimaryWalletBudget,
    getPrimaryWalletCurrency,
    getTotalBudgetHomeCached,
} from '../src/utils/tripDisplayFields';

test('trip display fields derive primary wallet display values and total home budget', () => {
    const wallets = [
        {
            currency: 'MYR',
            totalBudget: 999,
            lots: [
                {
                    originalConvertedAmount: 50,
                    sourceAmount: 250,
                    sourceCurrency: 'PHP',
                    lockedRate: 5,
                    rateBaseCurrency: 1,
                },
                {
                    originalConvertedAmount: 20,
                    sourceAmount: 100,
                    sourceCurrency: 'PHP',
                    lockedRate: 5,
                    rateBaseCurrency: 1,
                },
            ],
        },
        {
            currency: 'USD',
            totalBudget: 10,
            baselineExchangeRate: 60,
            defaultRate: 1 / 60,
            lots: [],
        },
    ] as any;

    assert.equal(getPrimaryWalletCurrency(wallets, 'PHP'), 'MYR');
    assert.equal(getPrimaryWalletBudget(wallets), 70);
    assert.equal(getTotalBudgetHomeCached(wallets, 'PHP'), 950);

    assert.deepEqual(buildTripDisplayFields(wallets, 'PHP'), {
        tripCurrency: 'MYR',
        currency: 'MYR',
        totalBudgetTrip: 70,
        totalBudget: 950,
        totalBudgetHomeCached: 950,
    });
});

test('trip display field helpers fall back to home currency defaults without wallets', () => {
    assert.equal(getPrimaryWalletCurrency([], 'PHP'), 'PHP');
    assert.equal(getPrimaryWalletBudget([]), 0);
    assert.equal(getTotalBudgetHomeCached([], 'PHP'), 0);
});
