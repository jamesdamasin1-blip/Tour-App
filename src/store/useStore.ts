import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { TripSlice, createTripSlice } from './slices/tripSlice';
import { ActivitySlice, createActivitySlice } from './slices/activitySlice';
import { ExpenseSlice, createExpenseSlice } from './slices/expenseSlice';
import { ExchangeEventSlice, createExchangeEventSlice } from './slices/exchangeEventSlice';
import { SettingsSlice, createSettingsSlice } from './slices/settingsSlice';
import { CloudSlice, createCloudSlice } from './slices/cloudSlice';
import { InviteSlice, createInviteSlice } from './slices/inviteSlice';

// ─── Composed State ──────────────────────────────────────────────

export type AppState =
    TripSlice &
    ActivitySlice &
    ExpenseSlice &
    ExchangeEventSlice &
    SettingsSlice &
    CloudSlice &
    InviteSlice;

export const useStore = create<AppState>()(
    persist(
        (...a) => ({
            ...createTripSlice(...a),
            ...createActivitySlice(...a),
            ...createExpenseSlice(...a),
            ...createExchangeEventSlice(...a),
            ...createSettingsSlice(...a),
            ...createCloudSlice(...a),
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
