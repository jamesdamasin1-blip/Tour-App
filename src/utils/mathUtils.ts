import { Activity, Expense, ExpenseCategory } from '@/src/types/models';

export function generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export const calculateTotalExpenses = (expenses: Expense[]): number =>
    expenses.reduce((sum, exp) => sum + exp.amount, 0);

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
    getPercentageSpent: (spent: number, total: number) => total === 0 ? 0 : Math.min(Math.round((spent / total) * 100), 100),

    getExpensesByCategory: (activities: Activity[]) => {
        const map: Partial<Record<ExpenseCategory, number>> = { Food: 0, Transport: 0, Hotel: 0, Sightseeing: 0, Other: 0 };
        activities.forEach(a => {
            const cat = mapToStdCat(a.category);
            map[cat] = (map[cat] || 0) + calculateTotalExpenses(a.expenses);
        });
        return map;
    },

    getDailySpending: (activities: Activity[]) => {
        const shortMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const dailyMap: Record<string, any> = {};

        activities.forEach(act => {
            if (!act.date) return;
            const d = new Date(act.date);
            const dateStr = d.toISOString().split('T')[0];
            const actSpent = calculateTotalExpenses(act.expenses);

            if (!dailyMap[dateStr]) {
                dailyMap[dateStr] = {
                    date: dateStr,
                    label: `${shortMonths[d.getMonth()]} ${d.getDate().toString().padStart(2, '0')} ${d.getFullYear()}`,
                    shortLabel: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`,
                    spent: 0, budget: 0, timestamp: d.getTime(),
                    categories: { Food: 0, Transport: 0, Hotel: 0, Sightseeing: 0, Other: 0 }
                };
            }
            dailyMap[dateStr].spent += actSpent;
            dailyMap[dateStr].budget += (act.allocatedBudget || 0);
            dailyMap[dateStr].categories[mapToStdCat(act.category)] += actSpent;
        });

        return Object.values(dailyMap).sort((a: any, b: any) => a.timestamp - b.timestamp);
    },

    formatCurrency: (v: number, currencyCode: string = 'PHP') => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: currencyCode,
            maximumFractionDigits: 2
        }).format(v);
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

    calculateBudgetResult: (allocated: number, actual: number, rate: number) => {
        if (actual === null || actual === undefined || !rate) return { status: "PENDING", message: "Pending" };
        const diff = allocated - (actual * rate);
        return {
            status: diff >= 0 ? "SAVED" : "OVER",
            message: diff >= 0 ? (diff === 0 ? "Matched ₱0.00" : `Saved ₱${diff.toFixed(2)}`) : `Over Budget ₱${Math.abs(diff).toFixed(2)}`
        };
    }
};
