export const COUNTRY_CURRENCY_MAPPING: Record<string, string> = {
    "Philippines": "PHP",
    "Singapore": "SGD",
    "Malaysia": "MYR",
    "United States": "USD",
    "United Kingdom": "GBP",
    "Japan": "JPY",
    "South Korea": "KRW",
    "China": "CNY",
    "France": "EUR",
    "Germany": "EUR",
    "Italy": "EUR",
    "Spain": "EUR",
    "Netherlands": "EUR",
    "Australia": "AUD",
    "Canada": "CAD",
    "Thailand": "THB",
    "Vietnam": "VND",
    "Indonesia": "IDR",
    "Taiwan": "TWD",
    "Hong Kong": "HKD",
    "United Arab Emirates": "AED",
    "Saudi Arabia": "SAR",
    "Switzerland": "CHF",
    "Sweden": "SEK",
    "Norway": "NOK",
    "Denmark": "DKK",
    "New Zealand": "NZD",
    "India": "INR",
    "Brazil": "BRL",
    "Russia": "RUB",
    "South Africa": "ZAR",
    "Mexico": "MXN",
    "Israel": "ILS",
    "Turkey": "TRY",
    "Egypt": "EGP",
    "Macau": "MOP",
};

export const ALL_CURRENCIES = Array.from(new Set([
    "PHP", "USD", "EUR", "JPY", "GBP", "AUD", "CAD", "CHF", "CNY", "HKD", "NZD", "SEK", "KRW", "SGD", "MYR",
    "NOK", "MXN", "INR", "RUB", "ZAR", "TRY", "BRL", "TWD", "DKK", "PLN", "THB", "IDR", "HUF", "CZK", "ILS",
    "CLP", "AED", "COP", "SAR", "RON", "VND", "KWD", "DZD"
])).sort();

export const getCurrencyForCountry = (country: string): string => {
    return COUNTRY_CURRENCY_MAPPING[country] || 'PHP';
};
