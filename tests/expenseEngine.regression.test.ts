import assert from 'node:assert/strict';
import test from 'node:test';
import { applyExpenseFIFO } from '../src/finance/expense/expenseEngine';

test('expense FIFO deducts oldest lots first and records the exact breakdown', () => {
    const { updatedWallet, breakdown } = applyExpenseFIFO(
        {
            id: 'wallet-1',
            currency: 'MYR',
            createdAt: 1,
            lots: [
                {
                    id: 'lot-older',
                    walletCurrency: 'MYR',
                    sourceCurrency: 'PHP',
                    sourceAmount: 100,
                    originalConvertedAmount: 10,
                    remainingAmount: 10,
                    lockedRate: 10,
                    createdAt: 1,
                },
                {
                    id: 'lot-newer',
                    walletCurrency: 'MYR',
                    sourceCurrency: 'PHP',
                    sourceAmount: 100,
                    originalConvertedAmount: 8,
                    remainingAmount: 8,
                    lockedRate: 10,
                    createdAt: 2,
                },
            ],
        },
        12
    );

    assert.deepEqual(breakdown, [
        { lotId: 'lot-older', amount: 10 },
        { lotId: 'lot-newer', amount: 2 },
    ]);
    assert.deepEqual(
        updatedWallet.lots.map(lot => ({ id: lot.id, remainingAmount: lot.remainingAmount })),
        [
            { id: 'lot-older', remainingAmount: 0 },
            { id: 'lot-newer', remainingAmount: 6 },
        ]
    );
});

test('expense FIFO rejects zero or negative expense amounts', () => {
    assert.throws(
        () =>
            applyExpenseFIFO(
                {
                    id: 'wallet-1',
                    currency: 'MYR',
                    createdAt: 1,
                    lots: [],
                },
                0
            ),
        /positive expense amount/
    );
});
