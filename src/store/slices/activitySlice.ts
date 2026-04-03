import { StateCreator } from 'zustand';
import { Activity, Expense } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { getDefaultLot } from '../../finance/wallet/walletEngine';
import { getDeviceId } from '../../auth/googleAuth';
import {
    beginTripCloudMutation,
    endTripCloudMutation,
    refreshTripCloudStateInBackground,
} from '../cloudSyncHelpers';
import { stampFieldUpdates } from '../storeHelpers';
import type { AppState } from '../useStore';

export interface ActivitySlice {
    activities: Activity[];
    addActivity: (activity: Omit<Activity, 'id' | 'lastModified'> & { expenses?: Expense[] }) => Promise<void>;
    updateActivity: (id: string, activity: Partial<Omit<Activity, 'id' | 'expenses' | 'lastModified'>> & { expenses?: Expense[], recalculateExpenses?: boolean }) => Promise<void>;
    deleteActivity: (id: string) => Promise<void>;
    toggleActivityCompletion: (id: string) => Promise<void>;
}

/**
 * Convert a raw expense to have correct home/trip amounts using the wallet's locked rate.
 * Skips conversion when pre-computed amounts are already present and recalculation is not forced.
 */
const withConvertedAmounts = (exp: any, trip: any, recalculate: boolean): any => {
    if (exp.convertedAmountHome && exp.convertedAmountTrip && !recalculate) return { ...exp };
    const expWallet = trip?.wallets?.find((w: any) => w.id === exp.walletId);
    const defaultLot = expWallet ? getDefaultLot(expWallet) : undefined;
    const lockedRate = defaultLot?.lockedRate ?? expWallet?.baselineExchangeRate ?? 1;
    const currency = exp.currency || expWallet?.currency || trip?.homeCurrency || 'PHP';
    return {
        ...exp,
        convertedAmountHome: Math.round(exp.amount * lockedRate * 100) / 100,
        convertedAmountTrip: exp.amount,
        currency,
    };
};

const toExpenseSyncSignature = (expense: Partial<Expense> | undefined | null) => ({
    id: expense?.id ?? '',
    walletId: expense?.walletId ?? '',
    name: expense?.name ?? '',
    amount: Number(expense?.amount ?? 0),
    currency: expense?.currency ?? '',
    convertedAmountHome: Number(expense?.convertedAmountHome ?? 0),
    convertedAmountTrip: Number(expense?.convertedAmountTrip ?? expense?.amount ?? 0),
    category: expense?.category ?? '',
    date: Number(expense?.date ?? 0),
    time: Number(expense?.time ?? 0),
    originalAmount: expense?.originalAmount == null ? null : Number(expense.originalAmount),
    originalCurrency: expense?.originalCurrency ?? null,
});

const hasMeaningfulExpenseChanges = (
    currentExpenses: Expense[] = [],
    nextExpenses?: Expense[] | null
): boolean => {
    if (!nextExpenses) return false;
    if (nextExpenses === currentExpenses) return false;
    if (currentExpenses.length !== nextExpenses.length) return true;

    for (let index = 0; index < nextExpenses.length; index += 1) {
        const currentSignature = toExpenseSyncSignature(currentExpenses[index]);
        const nextSignature = toExpenseSyncSignature(nextExpenses[index]);

        if (JSON.stringify(currentSignature) !== JSON.stringify(nextSignature)) {
            return true;
        }
    }

    return false;
};

export const createActivitySlice: StateCreator<AppState, [], [], ActivitySlice> = (set, get) => ({
    activities: [],

    addActivity: async (activityData) => {
        beginTripCloudMutation(activityData.tripId);
        const state = get();
        const trip = state.trips.find(t => t.id === activityData.tripId);
        const deviceId = getDeviceId();
        const inputExpenses = activityData.expenses || [];
        const activityId = generateId();
        const finalExpenses: Expense[] = inputExpenses.map((exp: any) => {
            const normalized = withConvertedAmounts(exp, trip, false);
            return {
                ...normalized,
                tripId: activityData.tripId,
                walletId: normalized.walletId || activityData.walletId,
                activityId,
                name: normalized.name || activityData.title,
            };
        });
        const newActivity = {
            ...activityData,
            id: activityId,
            expenses: finalExpenses,
            lastModified: Date.now(),
            version: 1,
            deletedAt: null,
            lastDeviceId: deviceId,
            fieldUpdates: stampFieldUpdates({}, activityData),
        };
        try {
            const { supabase } = await import('../../utils/supabase');
            const { error } = await supabase.rpc('save_activity_bundle', {
                p_activity: newActivity,
                p_expenses: finalExpenses,
            });
            if (error) {
                console.error('[Activity] Add failed:', error);
                throw error;
            }

            refreshTripCloudStateInBackground(activityData.tripId, 'activity_add');
        } finally {
            endTripCloudMutation(activityData.tripId);
        }
    },

    updateActivity: async (id, activityData) => {
        const state = get();
        const activity = state.activities.find(a => a.id === id);
        if (!activity) return;
        beginTripCloudMutation(activity.tripId);

        try {
            const trip = state.trips.find(t => t.id === activity.tripId);
            const lastModified = Date.now();
            const deviceId = getDeviceId();
            
            const finalExpenses: Expense[] = activityData.expenses
                ? activityData.expenses.map((exp: any) =>
                    withConvertedAmounts(exp, trip, !!activityData.recalculateExpenses)
                  )
                : activity.expenses;

            const fieldUpdates = stampFieldUpdates(activity.fieldUpdates, activityData, lastModified, ['expenses', 'recalculateExpenses']);
            const nextActivity = {
                ...activity,
                ...activityData,
                lastModified,
                lastDeviceId: deviceId,
                fieldUpdates,
            };
            const shouldSyncExpenses = hasMeaningfulExpenseChanges(
                activity.expenses || [],
                activityData.expenses ? finalExpenses : null
            );
            const { supabase } = await import('../../utils/supabase');
            const { error: actErr } = await supabase.rpc('save_activity_bundle', {
                p_activity: nextActivity,
                p_expenses: shouldSyncExpenses ? finalExpenses : null,
            });
            if (actErr) {
                console.error('[Activity] Update failed:', actErr);
                throw actErr;
            }

            refreshTripCloudStateInBackground(activity.tripId, 'activity_update');
        } finally {
            endTripCloudMutation(activity.tripId);
        }
    },

    deleteActivity: async (id) => {
        const activity = get().activities.find(a => a.id === id);
        if (!activity) return;
        beginTripCloudMutation(activity.tripId);

        try {
            const { supabase } = await import('../../utils/supabase');
            const { error } = await supabase.rpc('delete_activity_cascade', {
                p_activity_id: id,
            });
            if (error) {
                console.error('[Activity] Delete failed:', error);
                throw error;
            }

            refreshTripCloudStateInBackground(activity.tripId, 'activity_delete');
        } finally {
            endTripCloudMutation(activity.tripId);
        }
    },

    toggleActivityCompletion: async (id: string) => {
        const state = get();
        const activity = state.activities.find(a => a.id === id);
        if (!activity) return;
        beginTripCloudMutation(activity.tripId);

        try {
            const { supabase } = await import('../../utils/supabase');
            const { error } = await supabase.rpc('toggle_activity_completion', {
                p_activity_id: id,
            });
            if (error) {
                console.error('[Activity] Toggle completion failed:', error);
                throw error;
            }

            refreshTripCloudStateInBackground(activity.tripId, 'activity_toggle_completion');
        } finally {
            endTripCloudMutation(activity.tripId);
        }
    },
});
