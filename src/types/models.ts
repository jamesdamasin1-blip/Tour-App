export type ExpenseCategory = 'Food' | 'Transport' | 'Hotel' | 'Sightseeing' | 'Other';

export interface Expense {
    id: string;
    name: string;
    amount: number;
    category: ExpenseCategory;
    time: number;
    originalAmount?: number;
    originalCurrency?: string;
}

export interface Activity {
    id: string;
    tripId: string;
    title: string;
    category: ExpenseCategory;
    date: number;
    time: number;
    endTime?: number;
    allocatedBudget: number;
    isCompleted: boolean;
    lastModified: number;
    expenses: Expense[];
    description?: string;
    location?: string;
    countries: string[];
}

export interface TripPlan {
    id: string;
    title: string;
    destination?: string;
    startDate: number;
    endDate: number;
    totalBudget: number;
    currency: string;
    countries: string[];
    isCompleted: boolean;
    lastModified: number;
}
