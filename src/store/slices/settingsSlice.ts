import { StateCreator } from 'zustand';
import type { AppState } from '../useStore';

export interface SettingsSlice {
    currencyRates: {
        timestamp: number;
        rates: { [key: string]: number | null };
    };
    cacheRates: (rates: any) => void;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set) => ({
    currencyRates: {
        timestamp: 0,
        rates: { MYR: null, SGD: null, PHP: 1 }
    },

    cacheRates: (rates: any) =>
        set(() => ({
            currencyRates: {
                timestamp: Date.now(),
                rates
            }
        })),

    theme: 'light',
    toggleTheme: () => set((state: AppState) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
});
