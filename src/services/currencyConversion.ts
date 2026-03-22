import { Wallet } from '../types/models';

/**
 * Service for stable currency conversion based on baseline rates.
 */
export const CurrencyConversionService = {
    /**
     * Calculates the home currency value using the wallet's baseline rate.
     * 1 WalletCurrency = baselineRate HomeCurrency
     */
    toHome: (amount: number, baselineRate: number): number => {
        return amount * baselineRate;
    },

    /**
     * Calculates the wallet currency value using the baseline rate.
     * Opposite of toHome.
     */
    fromHome: (homeAmount: number, baselineRate: number): number => {
        if (!baselineRate || baselineRate === 0) return homeAmount;
        return homeAmount / baselineRate;
    },

    /**
     * Determines the baseline rate from a home amount and trip amount.
     * Rate = Home / Trip
     */
    calculateRate: (homeAmount: number, tripAmount: number): number => {
        if (!tripAmount) return 0;
        return homeAmount / tripAmount;
    }
};
