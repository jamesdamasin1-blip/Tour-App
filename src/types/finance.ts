export type CurrencyCode = string;

export interface CurrencyRatesMap {
    [key: string]: number | null;
}

export interface CurrencyConversionResult {
    amount: number;
    currency: CurrencyCode;
    convertedHome: number;
    convertedTrip: number;
}
