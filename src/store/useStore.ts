import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { Activity, Expense, TripPlan } from '@/src/types/models';
import { generateId } from '@/src/utils/mathUtils';

interface AppState {
    trips: TripPlan[];
    activities: Activity[];
    currencyRates: {
        timestamp: number;
        rates: { MYR: number | null; SGD: number | null; PHP: number };
    };
    addTrip: (trip: Omit<TripPlan, 'id' | 'isCompleted' | 'lastModified'>) => string;
    updateTrip: (id: string, trip: Partial<TripPlan>) => void;
    deleteTrip: (id: string) => void;
    toggleTripCompletion: (id: string) => void;
    addActivity: (activity: Omit<Activity, 'id' | 'expenses' | 'lastModified'>) => void;
    updateActivity: (id: string, activity: Partial<Omit<Activity, 'id' | 'expenses' | 'lastModified'>>) => void;
    deleteActivity: (id: string) => void;
    toggleActivityCompletion: (id: string) => void;
    addExpense: (activityId: string, expense: Omit<Expense, 'id'>) => void;
    deleteExpense: (activityId: string, expenseId: string) => void;
    importTrip: (tripData: any) => void;
    cacheRates: (rates: any) => void;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            trips: [],
            activities: [],
            currencyRates: {
                timestamp: 0,
                rates: { MYR: null, SGD: null, PHP: 1 }
            },

            addTrip: (tripData) => {
                const id = generateId();
                set((state) => ({
                    trips: [...state.trips, { ...tripData, id, isCompleted: false, lastModified: Date.now() }]
                }));
                return id;
            },

            updateTrip: (id, tripData) =>
                set((state) => ({
                    trips: state.trips.map(t => t.id === id ? { ...t, ...tripData, lastModified: Date.now() } : t)
                })),

            deleteTrip: (id) =>
                set((state) => ({
                    trips: state.trips.filter(t => t.id !== id),
                    activities: state.activities.filter(a => a.tripId !== id)
                })),

            addActivity: (activityData) =>
                set((state) => ({
                    activities: [
                        ...state.activities,
                        {
                            ...activityData,
                            id: generateId(),
                            expenses: [],
                            lastModified: Date.now()
                        }
                    ]
                })),

            updateActivity: (id, activityData) =>
                set((state) => ({
                    activities: state.activities.map(a => a.id === id ? { ...a, ...activityData, lastModified: Date.now() } : a)
                })),

            deleteActivity: (id) =>
                set((state) => ({
                    activities: state.activities.filter(a => a.id !== id)
                })),

            addExpense: (activityId, expenseData) =>
                set((state) => ({
                    activities: state.activities.map(a => a.id === activityId ? {
                        ...a,
                        expenses: [...a.expenses, { ...expenseData, id: generateId() }],
                        lastModified: Date.now()
                    } : a)
                })),
            deleteExpense: (activityId, expenseId) =>
                set((state) => ({
                    activities: state.activities.map(a => a.id === activityId ? {
                        ...a,
                        expenses: a.expenses.filter(e => e.id !== expenseId),
                        lastModified: Date.now()
                    } : a)
                })),

            toggleTripCompletion: (id) =>
                set((state) => ({
                    trips: state.trips.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted, lastModified: Date.now() } : t)
                })),

            importTrip: (tripData) =>
                set((state) => {
                    const existingTrip = state.trips.find(t => t.id === tripData.id);
                    
                    // If trip exists and incoming data is older, skip
                    if (existingTrip && existingTrip.lastModified >= tripData.lastModified) {
                        return state;
                    }

                    const newActivities = (tripData.activities || []).map((a: any) => ({
                        ...a,
                        // If we are updating a trip, we should also handle activity level lastModified 
                        // but for simplicity, we treat the whole trip as a unit for now
                    }));

                    const cleanTrip = { ...tripData };
                    delete cleanTrip.activities;

                    if (existingTrip) {
                        // Update existing
                        return {
                            trips: state.trips.map(t => t.id === tripData.id ? cleanTrip : t),
                            activities: [
                                ...state.activities.filter(a => a.tripId !== tripData.id),
                                ...newActivities
                            ]
                        };
                    }

                    return {
                        trips: [...state.trips, cleanTrip],
                        activities: [...state.activities, ...newActivities]
                    };
                }),

            toggleActivityCompletion: (id: string) =>
                set((state) => ({
                    activities: state.activities.map(a => a.id === id ? { ...a, isCompleted: !a.isCompleted, lastModified: Date.now() } : a)
                })),

            cacheRates: (rates: any) =>
                set(() => ({
                    currencyRates: {
                        timestamp: Date.now(),
                        rates
                    }
                })),

            theme: 'light',
            toggleTheme: () => set((state: AppState) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
        }),
        {
            name: 'paris-getaway-storage',
            storage: createJSONStorage(() => AsyncStorage),
            onRehydrateStorage: () => (state, error) => {
                if (error) {
                    console.error('an error happened during hydration', error);
                }
            },
        }
    )
);
