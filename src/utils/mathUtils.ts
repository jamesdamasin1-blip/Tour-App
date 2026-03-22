import { Activity, Expense, ExpenseCategory } from '@/src/types/models';
import * as Crypto from 'expo-crypto';

export function generateId(): string {
    return Crypto.randomUUID();
}

export const calculateTotalExpenses = (expenses: Expense[]): number =>
    expenses.reduce((sum, exp) => {
        const val = exp.convertedAmountTrip ?? exp.amount;
        return sum + (Number.isFinite(val) ? val : 0);
    }, 0);

const mapToStdCat = (cat: string): ExpenseCategory => {
    const c = cat.toLowerCase();
    if (c.includes('food')) return 'Food';
    if (c.includes('transport')) return 'Transport';
    if (c.includes('hotel') || c.includes('lodging') || c.includes('accommodation')) return 'Hotel';
    if (c.includes('sightseeing') || c.includes('activity')) return 'Sightseeing';
    return 'Other';
};

export const Calculations = {
    generateId,
    calculateTotalExpenses,
    getTotalTripBudget: (activities: Activity[]) => activities.reduce((s, a) => s + a.allocatedBudget, 0),
    getTotalTripSpent: (activities: Activity[]) => activities.reduce((s, a) => s + calculateTotalExpenses(a.expenses), 0),

    // Multi-wallet aware aggregation (Home Currency)
    getTotalSpentHome: (expenses: Expense[]) =>
        expenses.reduce((sum, exp) => {
            const val = exp.convertedAmountHome || 0;
            return sum + (Number.isFinite(val) ? val : 0);
        }, 0),

    getPercentageSpent: (spent: number, total: number) => total === 0 ? 0 : Math.round((spent / total) * 100),

    getExpensesByCategory: (activities: Activity[]) => {
        const map: Partial<Record<ExpenseCategory, number>> = { Food: 0, Transport: 0, Hotel: 0, Sightseeing: 0, Other: 0 };
        activities.forEach(a => {
            const cat = mapToStdCat(a.category);
            const spentHome = (a.expenses || []).reduce((s, e) => s + (e.convertedAmountHome || 0), 0);
            map[cat] = (map[cat] || 0) + spentHome;
        });
        return map;
    },

    getDailySpending: (activities: Activity[], walletRateMap: Record<string, number> = {}, homeCurrency = '') => {
        const shortMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const dailyMap: Record<string, any> = {};

        activities.forEach(act => {
            if (!act.date) return;
            const d = new Date(act.date);
            const dateStr = d.toISOString().split('T')[0];

            if (!dailyMap[dateStr]) {
                dailyMap[dateStr] = {
                    date: dateStr,
                    label: `${shortMonths[d.getMonth()]} ${d.getDate().toString().padStart(2, '0')} ${d.getFullYear()}`,
                    shortLabel: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`,
                    spent: 0, budget: 0, timestamp: d.getTime(),
                    categories: { Food: 0, Transport: 0, Hotel: 0, Sightseeing: 0, Other: 0 }
                };
            }

            const actSpentHome = (act.expenses || []).reduce((s, e) => s + (e.convertedAmountHome || 0), 0);
            dailyMap[dateStr].spent += actSpentHome;
            dailyMap[dateStr].categories[mapToStdCat(act.category)] += actSpentHome;

            const rawBudget = act.allocatedBudget || 0;
            const budgetCurrency = act.budgetCurrency || '';
            const isAlreadyHome = homeCurrency && budgetCurrency === homeCurrency;
            const walletRate = walletRateMap[act.walletId || ''] ?? 1;
            dailyMap[dateStr].budget += isAlreadyHome ? rawBudget : rawBudget * walletRate;
        });

        return Object.values(dailyMap).sort((a: any, b: any) => a.timestamp - b.timestamp);
    },

    formatCurrency: (v: number, currencyCode: string = 'PHP') => {
        const safeValue = Number.isFinite(v) ? v : 0;
        const safeCurrency = (typeof currencyCode === 'string' && currencyCode.length === 3)
            ? currencyCode.toUpperCase()
            : 'PHP';

        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: safeCurrency,
                maximumFractionDigits: 2
            }).format(safeValue);
        } catch (e) {
            return `${safeCurrency} ${safeValue.toFixed(2)}`;
        }
    },

    formatCurrencyInput: (v: string) => {
        let c = v.replace(/[^0-9.]/g, '');
        const p = c.split('.');
        if (p.length > 2) c = p[0] + '.' + p.slice(1).join('');
        if (p.length === 2 && p[1].length > 2) c = p[0] + '.' + p.slice(1).join('').substring(0, 2);

        const parts = c.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join('.');
    },

    parseCurrencyInput: (v: string) => v ? parseFloat(v.replace(/[^0-9.]/g, '')) || 0 : 0,

};
