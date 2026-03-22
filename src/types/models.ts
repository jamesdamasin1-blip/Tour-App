import { FundingLot } from '../finance/wallet/walletTypes';
import { LotDeduction } from '../finance/expense/expenseTypes';

export type ExpenseCategory = 'Food' | 'Transport' | 'Hotel' | 'Sightseeing' | 'Other';

export interface Wallet {
    id: string;
    tripId: string;
    country: string;
    currency: string;
    totalBudget: number;
    spentAmount: number;
    defaultRate: number; // For backward compatibility
    baselineExchangeRate?: number; // 1 WalletCurrency = X HomeCurrency
    baselineSource?: 'initial' | 'user'; // How the baseline was established
    lots: FundingLot[]; // NEW: Universal Ledger lots
    createdAt: number;
    // Sync fields
    version: number;         // Server-managed, monotonically increasing
    updatedBy?: string;      // Supabase auth user_id of last editor
    deletedAt?: string | null; // ISO timestamp if soft-deleted, null if alive
}

export interface Expense {
    id: string;
    tripId: string;
    walletId: string; // REQUIRED: linked to a specific country's wallet
    activityId?: string; // Optional linking to an activity
    name: string;
    amount: number; // Original amount in payment currency
    currency: string; // Original currency
    exchangeRateUsed?: number; // Strictly stored rate: 1 WalletCurrency = X HomeCurrency
    convertedAmountHome: number; // Converted to Home Currency (PHP) at time of entry
    convertedAmountTrip: number; // Converted to Trip Currency (Wallet Currency) at time of entry
    category: ExpenseCategory;
    date: number; // For record keeping
    time: number; // For reverse chronological order
    notes?: string;
    lotBreakdown?: LotDeduction[]; // NEW: FIFO Tracer
    originalAmount?: number; // Legacy
    originalCurrency?: string; // Legacy
    createdBy?: string;      // member id
    lastModifiedBy?: string; // member id
    // Sync fields
    version: number;         // Server-managed, monotonically increasing
    updatedBy?: string;      // Supabase auth user_id of last editor
    deletedAt?: string | null; // ISO timestamp if soft-deleted, null if alive
}

export interface ExchangeEvent {
    id: string;
    tripId: string;
    walletId: string;
    homeAmount: number;
    tripAmount: number;
    rate: number;
    date: number;
    notes?: string;
    // Sync fields
    version: number;
    updatedBy?: string;
    deletedAt?: string | null;
}

export const BUDDY_COLORS = [
    '#14b8a6', // teal
    '#f97316', // orange
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#eab308', // amber
    '#06b6d4', // cyan
    '#ef4444', // red
    '#3b82f6', // blue
    '#10b981', // emerald
    '#a855f7', // purple
] as const;

/** @deprecated Use TripMember instead */
export type TripBuddy = TripMember;

export interface TripMember {
    id: string;
    name: string;
    color: string;      // from BUDDY_COLORS palette
    isCreator?: boolean; // trip owner
    role?: 'editor' | 'viewer'; // undefined defaults to 'editor' for backward compat
    userId?: string;     // linked Supabase auth user id
    email?: string;      // linked user email
    addedAt: number;
}

export interface Activity {
    id: string;
    tripId: string;
    walletId: string; // REQUIRED: linked to a specific country's wallet
    title: string;
    category: ExpenseCategory;
    date: number;
    time: number;
    endTime?: number;
    allocatedBudget: number;
    budgetCurrency: string; // LOCKED: used for allocatedBudget
    isCompleted: boolean;
    isSpontaneous?: boolean;
    lastModified: number;
    expenses: Expense[]; // Keeping for UI compatibility
    description?: string;
    location?: string;
    countries: string[];
    createdBy?: string;      // member id
    lastModifiedBy?: string; // member id
    // Sync fields
    version: number;         // Server-managed, monotonically increasing
    updatedBy?: string;      // Supabase auth user_id of last editor
    deletedAt?: string | null; // ISO timestamp if soft-deleted, null if alive
}

export interface TripInvite {
    id: string;
    tripId: string;
    tripTitle: string;
    fromUserId: string;
    fromDisplayName: string | null;
    fromEmail: string | null;
    toEmail: string;
    role: 'editor' | 'viewer';
    status: 'pending' | 'accepted' | 'declined';
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
}

export interface TripPlan {
    id: string;
    title: string;
    destination?: string;
    startDate: number;
    endDate: number;

    // Currency Architecture
    homeCountry: string; // NEW: immutable baseline
    homeCurrency: string; // User's reference currency (e.g. PHP)

    wallets: Wallet[]; // NEW: Primary architecture

    // Derived Aggregates (can be cached)
    totalBudgetHomeCached: number; // Total budget across all wallets in Home Currency

    // Legacy support (to be transitioned)
    tripCurrency: string;
    totalBudgetTrip: number;
    totalBudget: number;
    currency: string;

    countries: string[];
    members?: TripMember[]; // trip members
    isCompleted: boolean;
    lastModified: number;
    role?: 'admin' | 'viewer';
    isCloudSynced?: boolean;
    // Sync fields
    version: number;         // Server-managed, monotonically increasing
    updatedBy?: string;      // Supabase auth user_id of last editor
    deletedAt?: string | null; // ISO timestamp if soft-deleted, null if alive
}

