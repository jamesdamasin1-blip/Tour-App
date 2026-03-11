import axios from 'axios';

const API_KEY = '0986bdfee13409b7570a590a';
const BASE_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest`;

const CACHE_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours (updates once a day)

const getRates = async (baseCode = 'PHP') => {
    try {
        const res = await axios.get(`${BASE_URL}/${baseCode.toUpperCase()}`);
        if (res.data?.result === 'success') {
            return res.data.conversion_rates;
        }
        return null;
    } catch (err) {
        console.error('Currency API Error:', err);
        return null;
    }
};

export const fetchAndCacheRates = async (currentRatesCache, cacheRatesAction) => {
    const isCacheValid = currentRatesCache && 
                         currentRatesCache.timestamp && 
                         (Date.now() - currentRatesCache.timestamp) < CACHE_LIFETIME;
    
    // If cache is fresh, return it immediately
    if (isCacheValid && currentRatesCache.rates && Object.keys(currentRatesCache.rates).length > 5) {
        return currentRatesCache.rates;
    }

    console.log('Fetching fresh exchange rates (Once daily update)...');
    // Fetch with PHP as base to get all rates relative to PHP
    const rates = await getRates('PHP');
    
    if (rates) {
        cacheRatesAction(rates);
        return rates;
    }

    // Fallback logic if API fails
    return currentRatesCache?.rates || { PHP: 1, MYR: 12.5, SGD: 41.5, USD: 0.018, EUR: 0.017 };
};
