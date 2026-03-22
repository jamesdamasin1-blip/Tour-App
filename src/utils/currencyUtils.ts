import { Calculations } from '@/src/utils/mathUtils';
import { fetchAndCacheRates } from './currencyClient';

export const CurrencyUtils = {
    // Re-export common functions if needed, or move them here
    parseInput: Calculations.parseCurrencyInput,
    formatInput: Calculations.formatCurrencyInput,

    fetchRates: async (currentCache: any, cacheAction: any) => {
        return await fetchAndCacheRates(currentCache, cacheAction);
    }
};
