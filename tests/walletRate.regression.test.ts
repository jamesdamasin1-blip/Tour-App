import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getNormalizedFundingHomeAmount,
    getNormalizedFundingRate,
    getNormalizedFundingTripAmount,
    getWalletBaselineHomeRate,
} from '../src/finance/wallet/walletRate';

test('wallet baseline converts legacy sub-1 default rates into home-per-wallet rates', () => {
    assert.equal(getWalletBaselineHomeRate({ baselineExchangeRate: undefined, defaultRate: 0.25 }), 4);
});

test('home-currency funding ignores suspicious stored rates and falls back to wallet baseline', () => {
    const wallet = { baselineExchangeRate: 2, defaultRate: 0 };

    assert.equal(
        getNormalizedFundingRate({
            homeCurrency: 'PHP',
            sourceCurrency: 'PHP',
            sourceAmount: 200,
            storedRate: 12,
            wallet,
        }),
        2
    );

    assert.equal(
        getNormalizedFundingTripAmount({
            homeCurrency: 'PHP',
            sourceCurrency: 'PHP',
            sourceAmount: 200,
            storedRate: 12,
            storedTripAmount: 16,
            wallet,
        }),
        100
    );

    assert.equal(
        getNormalizedFundingHomeAmount({
            homeCurrency: 'PHP',
            sourceCurrency: 'PHP',
            sourceAmount: 200,
            storedRate: 12,
            storedTripAmount: 16,
            wallet,
        }),
        200
    );
});

test('foreign-currency funding preserves the stored trip amount when present', () => {
    assert.equal(
        getNormalizedFundingTripAmount({
            homeCurrency: 'PHP',
            sourceCurrency: 'USD',
            sourceAmount: 40,
            storedRate: 2,
            storedTripAmount: 19,
            wallet: { baselineExchangeRate: 2.5, defaultRate: 0 },
        }),
        19
    );
});
