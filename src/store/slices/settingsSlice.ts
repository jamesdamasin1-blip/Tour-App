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
    walletError: string | null;
    clearWalletError: () => void;
    currentUserId: string | null;
    setCurrentUserId: (id: string | null) => void;
    deletionRequests: DeletionRequest[];
    addDeletionRequest: (req: DeletionRequest) => void;
    removeDeletionRequest: (requestId: string) => void;
}

export interface DeletionRequest {
    id: string;
    tripId: string;
    activityId: string;
    activityTitle: string;
    requestedByMemberId: string;
    requestedByName: string;
    requestedByColor: string;
    requestedAt: number;
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

    walletError: null,
    clearWalletError: () => set(() => ({ walletError: null })),

    currentUserId: null as string | null,
    setCurrentUserId: (id: string | null) => set(() => ({ currentUserId: id })),

    deletionRequests: [],
    addDeletionRequest: (req) => set((s) => ({ deletionRequests: [...s.deletionRequests, req] })),
    removeDeletionRequest: (requestId) => set((s) => ({ deletionRequests: s.deletionRequests.filter(r => r.id !== requestId) })),
});
