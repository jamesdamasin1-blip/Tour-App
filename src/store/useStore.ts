import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { TripSlice, createTripSlice } from './slices/tripSlice';
import { ActivitySlice, createActivitySlice } from './slices/activitySlice';
import { ExpenseSlice, createExpenseSlice } from './slices/expenseSlice';
import { ExchangeEventSlice, createExchangeEventSlice } from './slices/exchangeEventSlice';
import { SettingsSlice, createSettingsSlice } from './slices/settingsSlice';
import { InviteSlice, createInviteSlice } from './slices/inviteSlice';
import { registerStoreBridge } from './storeBridge';

// ─── Composed State ──────────────────────────────────────────────

export type AppState =
    TripSlice &
    ActivitySlice &
    ExpenseSlice &
    ExchangeEventSlice &
    SettingsSlice &
    InviteSlice;

export const useStore = create<AppState>()(
    persist(
        (...a) => ({
            ...createTripSlice(...a),
            ...createActivitySlice(...a),
            ...createExpenseSlice(...a),
            ...createExchangeEventSlice(...a),
            ...createSettingsSlice(...a),
            ...createInviteSlice(...a),
        }),
        {
            name: 'aliqual-storage',
            storage: createJSONStorage(() => AsyncStorage),
            onRehydrateStorage: () => (_state, error) => {
                if (error) {
                    console.error('an error happened during hydration', error);
                }
            },
        }
    )
);

registerStoreBridge<AppState>({
    getState: useStore.getState,
    setState: useStore.setState,
});

export const clearPersistedAppState = async (): Promise<void> => {
    const preservedTheme = useStore.getState().theme;

    await useStore.persist.clearStorage();

    useStore.setState({
        trips: [],
        activities: [],
        expenses: [],
        exchangeEvents: [],
        invites: [],
        inviteLoading: false,
        currencyRates: {
            timestamp: 0,
            rates: { MYR: null, SGD: null, PHP: 1 },
        },
        theme: preservedTheme,
        walletError: null,
        currentUserId: null,
        deletionRequests: [],
        isTripsSidebarOpen: false,
        tripMutationCounts: {},
    });
};
