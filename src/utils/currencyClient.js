export const fetchAndCacheRates = async (currentRatesCache, cacheRatesAction) => {
    return currentRatesCache?.rates || { PHP: 1, MYR: 12.5, SGD: 41.5, USD: 0.018, EUR: 0.017 };
};
