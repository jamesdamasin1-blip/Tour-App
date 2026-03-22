import { Calculations } from '@/src/utils/mathUtils';

/**
 * Service for core currency formatting and conversion logic.
 * Follows the "Three Layer Currency" architecture.
 */
export const CurrencyService = {
    /**
     * Formats a number as a human-readable currency string.
     */
    format: (amount: number, currency: string) => {
        return Calculations.formatCurrency(amount, currency);
    },

    /**
     * Formats an input string with commas and decimal points.
     */
    formatInput: (value: string) => {
        return Calculations.formatCurrencyInput(value);
    },

    /**
     * Parses a formatted currency input string back into a number.
     */
    parseInput: (value: string) => {
        return Calculations.parseCurrencyInput(value);
    },

    /**
     * Core conversion logic.
     * @param amount The amount to convert
     * @param fromRate The rate from base to source currency (unused if simplified)
     * @param toRate The rate from base to target currency
     */
    convert: (amount: number, fromRate: number, toRate: number): number => {
        if (!fromRate || fromRate === 0 || !toRate) return amount;
        return (amount / fromRate) * toRate;
    },

    /**
     * Quick conversion from an amount to another using a direct rate.
     */
    convertDirect: (amount: number, rate: number): number => {
        return amount * rate;
    }
};
