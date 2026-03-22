import { StateCreator } from 'zustand';
import { ExchangeEvent } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { addFundingLot, getFundingTotalGlobalHome } from '../../finance/wallet/walletEngine';
import { offlineSync } from '../storeHelpers';
import type { AppState } from '../useStore';

export interface ExchangeEventSlice {
    exchangeEvents: ExchangeEvent[];
    addExchangeEvent: (event: Omit<ExchangeEvent, 'id'>) => void;
    updateExchangeEvent: (id: string, data: Partial<Omit<ExchangeEvent, 'id' | 'tripId'>>) => void;
    deleteExchangeEvent: (id: string) => void;
}

export const createExchangeEventSlice: StateCreator<AppState, [], [], ExchangeEventSlice> = (set) => ({
    exchangeEvents: [],

    addExchangeEvent: (eventData) =>
        set((state: any) => {
            const id = generateId();
            const trip = state.trips.find((t: any) => t.id === eventData.tripId);
            const wallet = trip?.wallets.find((w: any) => w.id === eventData.walletId);

            if (!wallet) return state;

            const updatedWallet = addFundingLot(wallet, {
                sourceCurrency: trip.homeCurrency || 'PHP',
                targetCurrency: wallet.currency,
                sourceAmount: eventData.homeAmount,
                rate: eventData.rate,
                rateBaseCurrency: 1,
                notes: eventData.notes
            });

            let updatedTrips = state.trips.map((t: any) =>
                t.id === eventData.tripId ? {
                    ...t,
                    lastModified: Date.now(),
                    wallets: t.wallets.map((w: any) =>
                        w.id === eventData.walletId ? updatedWallet : w
                    )
                } : t
            );

            updatedTrips = updatedTrips.map((t: any) => {
                if (t.id === eventData.tripId) {
                    const totalBudgetHomeCached = t.wallets.reduce((sum: number, w: any) => {
                        return sum + getFundingTotalGlobalHome(w, t.homeCurrency || 'PHP');
                    }, 0);

                    return {
                        ...t,
                        totalBudgetHomeCached: Math.round(totalBudgetHomeCached * 100) / 100
                    };
                }
                return t;
            });

            const newEvent = { ...eventData, id, version: 1, deletedAt: null };
            offlineSync.exchangeEvent(newEvent);
            offlineSync.walletUpdate(eventData.walletId, updatedWallet);

            return {
                exchangeEvents: [...state.exchangeEvents, newEvent],
                trips: updatedTrips
            };
        }),

    deleteExchangeEvent: (id) =>
        set((state: any) => {
            const event = state.exchangeEvents.find((e: any) => e.id === id);
            if (!event) return state;

            const updatedEvents = state.exchangeEvents.filter((e: any) => e.id !== id);

            const updatedTrips = state.trips.map((t: any) => {
                if (t.id === event.tripId) {
                    const initialBudgetHome = t.wallets.reduce((sum: number, w: any) => {
                        const rate = w.baselineExchangeRate || (w.defaultRate ? (1 / w.defaultRate) : 1);
                        return sum + (w.totalBudget * rate);
                    }, 0);

                    const addedBudgetHome = updatedEvents
                        .filter((e: any) => e.tripId === t.id)
                        .reduce((sum: number, e: any) => sum + e.homeAmount, 0);

                    return {
                        ...t,
                        totalBudgetHomeCached: Math.round((initialBudgetHome + addedBudgetHome) * 100) / 100,
                        lastModified: Date.now()
                    };
                }
                return t;
            });

            // Persist the updated trip (wallet budget changed)
            const updatedTrip = updatedTrips.find((t: any) => t.id === event.tripId);
            if (updatedTrip) offlineSync.tripUpdate(event.tripId, updatedTrip);

            return {
                exchangeEvents: updatedEvents,
                trips: updatedTrips
            };
        }),

    updateExchangeEvent: (id, data) =>
        set((state: any) => {
            const event = state.exchangeEvents.find((e: any) => e.id === id);
            if (!event) return state;

            const updatedEvents = state.exchangeEvents.map((e: any) => e.id === id ? { ...e, ...data } : e);

            const updatedTrips = state.trips.map((t: any) => {
                if (t.id === event.tripId) {
                    const initialBudgetHome = t.wallets.reduce((sum: number, w: any) => {
                        const rate = w.baselineExchangeRate || (w.defaultRate ? (1 / w.defaultRate) : 1);
                        return sum + (w.totalBudget * rate);
                    }, 0);

                    const addedBudgetHome = updatedEvents
                        .filter((e: any) => e.tripId === t.id)
                        .reduce((sum: number, e: any) => sum + e.homeAmount, 0);

                    return {
                        ...t,
                        totalBudgetHomeCached: Math.round((initialBudgetHome + addedBudgetHome) * 100) / 100,
                        lastModified: Date.now()
                    };
                }
                return t;
            });

            // Persist the updated event + trip
            const updatedEvent = updatedEvents.find((e: any) => e.id === id);
            if (updatedEvent) offlineSync.exchangeEvent(updatedEvent);
            const updatedTrip = updatedTrips.find((t: any) => t.id === event.tripId);
            if (updatedTrip) offlineSync.tripUpdate(event.tripId, updatedTrip);

            return {
                exchangeEvents: updatedEvents,
                trips: updatedTrips
            };
        }),
});
