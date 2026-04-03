import type { Wallet } from '@/src/types/models';
import type { FundingLot } from './walletTypes';

const MAX_SUSPICIOUS_RATE_RATIO = 4;

type WalletRateSource = Pick<Wallet, 'baselineExchangeRate' | 'defaultRate'> | null | undefined;

type FundingRateInput = {
    homeCurrency: string;
    sourceAmount?: number | null;
    sourceCurrency?: string | null;
    storedRate?: number | null;
    storedTripAmount?: number | null;
    wallet?: WalletRateSource;
};

export const getWalletBaselineHomeRate = (wallet?: WalletRateSource): number => {
    const baselineRate = Number(wallet?.baselineExchangeRate || 0);
    if (baselineRate > 0) return baselineRate;

    const legacyRate = Number(wallet?.defaultRate || 0);
    if (legacyRate <= 0) return 0;

    return legacyRate < 1 ? 1 / legacyRate : legacyRate;
};

export const isSuspiciousWalletRate = (storedRate: number, expectedRate: number): boolean => {
    if (storedRate <= 0 || expectedRate <= 0) return false;
    const driftRatio = Math.max(storedRate, expectedRate) / Math.min(storedRate, expectedRate);
    return driftRatio >= MAX_SUSPICIOUS_RATE_RATIO;
};

export const getNormalizedFundingRate = ({
    homeCurrency,
    sourceCurrency,
    storedRate,
    wallet,
}: FundingRateInput): number => {
    const safeStoredRate = Number(storedRate || 0);
    const expectedRate = getWalletBaselineHomeRate(wallet);
    const safeSourceCurrency = sourceCurrency || homeCurrency;

    if (safeStoredRate <= 0) return expectedRate;
    if (safeSourceCurrency !== homeCurrency) return safeStoredRate;

    return isSuspiciousWalletRate(safeStoredRate, expectedRate)
        ? expectedRate || safeStoredRate
        : safeStoredRate;
};

export const getNormalizedFundingTripAmount = ({
    homeCurrency,
    sourceAmount,
    sourceCurrency,
    storedRate,
    storedTripAmount,
    wallet,
}: FundingRateInput): number => {
    const safeSourceAmount = Number(sourceAmount || 0);
    const safeTripAmount = Number(storedTripAmount || 0);
    const safeSourceCurrency = sourceCurrency || homeCurrency;
    const normalizedRate = getNormalizedFundingRate({
        homeCurrency,
        sourceCurrency: safeSourceCurrency,
        storedRate,
        wallet,
    });

    if (safeSourceCurrency === homeCurrency && safeSourceAmount > 0 && normalizedRate > 0) {
        return safeSourceAmount / normalizedRate;
    }

    if (safeTripAmount > 0) return safeTripAmount;
    if (safeSourceAmount > 0 && normalizedRate > 0) return safeSourceAmount / normalizedRate;
    return 0;
};

export const getNormalizedFundingHomeAmount = ({
    homeCurrency,
    sourceAmount,
    sourceCurrency,
    storedRate,
    storedTripAmount,
    wallet,
}: FundingRateInput): number => {
    const safeSourceAmount = Number(sourceAmount || 0);
    const safeSourceCurrency = sourceCurrency || homeCurrency;
    const normalizedTripAmount = getNormalizedFundingTripAmount({
        homeCurrency,
        sourceAmount: safeSourceAmount,
        sourceCurrency: safeSourceCurrency,
        storedRate,
        storedTripAmount,
        wallet,
    });

    if (safeSourceCurrency === homeCurrency) return safeSourceAmount;

    const normalizedRate = getNormalizedFundingRate({
        homeCurrency,
        sourceCurrency: safeSourceCurrency,
        storedRate,
        wallet,
    });
    if (normalizedRate > 0) return normalizedTripAmount * normalizedRate;
    return safeSourceAmount;
};

export const getNormalizedLotTripAmount = (
    lot: Partial<FundingLot> & { convertedAmount?: number },
    wallet: WalletRateSource,
    homeCurrency: string
): number => getNormalizedFundingTripAmount({
    homeCurrency,
    sourceAmount: Number(lot.sourceAmount || 0),
    sourceCurrency: lot.sourceCurrency,
    storedRate: Number(lot.lockedRate || 0),
    storedTripAmount: Number(lot.originalConvertedAmount ?? lot.convertedAmount ?? 0),
    wallet,
});

export const getNormalizedLotHomeAmount = (
    lot: Partial<FundingLot> & { convertedAmount?: number },
    wallet: WalletRateSource,
    homeCurrency: string
): number => getNormalizedFundingHomeAmount({
    homeCurrency,
    sourceAmount: Number(lot.sourceAmount || 0),
    sourceCurrency: lot.sourceCurrency,
    storedRate: Number(lot.lockedRate || 0),
    storedTripAmount: Number(lot.originalConvertedAmount ?? lot.convertedAmount ?? 0),
    wallet,
});
