import { StateCreator } from 'zustand';
import { TripPlan, Wallet, TripMember, BUDDY_COLORS } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { offlineSync, validateImportedTrip, stampFieldUpdates } from '../storeHelpers';
import type { AppState } from '../useStore';

export interface TripSlice {
    trips: TripPlan[];
    addTrip: (trip: Omit<TripPlan, 'id' | 'isCompleted' | 'lastModified' | 'wallets'> & { id?: string, wallets: (Omit<Wallet, 'id' | 'tripId' | 'spentAmount'> & { id?: string })[] }, fromSync?: boolean) => string;
    updateTrip: (id: string, trip: Partial<TripPlan>, fromSync?: boolean) => void;
    deleteTrip: (id: string, fromSync?: boolean) => void;
    toggleTripCompletion: (id: string, fromSync?: boolean) => void;
    importTrip: (tripData: any) => void;
    updateWalletBaseline: (tripId: string, walletId: string, rate: number, source: 'initial' | 'user', fromSync?: boolean) => void;
    addMember: (tripId: string, name: string, opts?: { userId?: string; email?: string }, fromSync?: boolean) => TripMember | null;
    removeMember: (tripId: string, memberId: string, fromSync?: boolean) => void;
    updateMemberRole: (tripId: string, memberId: string, role: 'editor' | 'viewer', fromSync?: boolean) => void;
    /** @deprecated Use addMember */
    addBuddy: (tripId: string, name: string) => TripMember | null;
    /** @deprecated Use removeMember */
    removeBuddy: (tripId: string, buddyId: string) => void;
}

export const createTripSlice: StateCreator<AppState, [], [], TripSlice> = (set, _get) => ({
    trips: [],

    addTrip: (tripData, fromSync) => {
        const id = tripData.id || generateId();
        const lastModified = Date.now();

        const wallets: Wallet[] = tripData.wallets.map(w => ({
            ...w,
            id: w.id || generateId(),
            tripId: id,
            spentAmount: 0,
            version: 1,
            createdAt: Date.now(),
            deletedAt: null,
            fieldUpdates: {},
        }));
        wallets.forEach(w => w.fieldUpdates = stampFieldUpdates({}, w));

        const newTrip: TripPlan = {
            ...tripData,
            id,
            wallets,
            isCompleted: false,
            lastModified,
            tripCurrency: wallets[0]?.currency || tripData.homeCurrency,
            totalBudgetTrip: wallets[0]?.totalBudget || 0,
            totalBudget: wallets.reduce((acc, w) => acc + (w.totalBudget / (w.defaultRate || 1)), 0),
            currency: wallets[0]?.currency || tripData.homeCurrency,
            version: 1,
            deletedAt: null,
        } as TripPlan;
        newTrip.fieldUpdates = stampFieldUpdates({}, newTrip);

        set((state) => ({
            trips: [...state.trips, newTrip]
        }));

        if (!fromSync) {
            offlineSync.trip(newTrip);
            wallets.forEach(w => offlineSync.wallet(w));
        }

        return id;
    },

    updateTrip: (id, tripData, fromSync) =>
        set((state) => {
            const lastModified = Date.now();
            const updated = state.trips.map(t => {
                if (t.id === id) {
                    const result = { ...t, ...tripData, lastModified };
                    result.fieldUpdates = stampFieldUpdates(t.fieldUpdates, tripData, lastModified);
                    return result;
                }
                return t;
            });
            const trip = updated.find(t => t.id === id);
            if (trip && !fromSync) offlineSync.tripUpdate(id, trip);
            return { trips: updated };
        }),

    deleteTrip: (id, fromSync) =>
        set((state) => {
            const trip = state.trips.find(t => t.id === id);
            if (!trip) return state;

            if (!fromSync) {
                // Determine if we're a member leaving or just hiding an owned trip
                const isCreator = !trip.isCloudSynced || (state as any).userId === (trip as any).user_id;

                if (!isCreator && trip.id) {
                    // MEMBER LEAVING: Sync removal to server then hide locally
                    const currentUserId = (state as any).userId;
                    const updatedMembers = (trip.members || []).filter(m => m.userId !== currentUserId);
                    const lastModified = Date.now();
                    const updatedTrip = { 
                        ...trip, 
                        members: updatedMembers, 
                        lastModified,
                        fieldUpdates: stampFieldUpdates(trip.fieldUpdates, { members: updatedMembers }, lastModified)
                    };
                    
                    // Push the member removal to server
                    offlineSync.tripUpdate(id, updatedTrip);
                    // Mark hidden locally in SQLite
                    offlineSync.tripHide(id, updatedTrip);
                } else {
                    // CREATOR/OWNER HIDING: Just mark hidden locally in SQLite (never syncs)
                    offlineSync.tripHide(id, trip);
                }
            }

            // Remove from local UI immediately
            return {
                trips: state.trips.filter(t => t.id !== id),
                activities: state.activities.filter(a => a.tripId !== id),
                expenses: state.expenses.filter(e => e.tripId !== id),
            };
        }),

    toggleTripCompletion: (id, fromSync) =>
        set((state) => {
            const trip = state.trips.find(t => t.id === id);
            if (!trip) return state;

            const lastModified = Date.now();
            const isCompleted = !trip.isCompleted;
            const fieldUpdates = stampFieldUpdates(trip.fieldUpdates, { isCompleted }, lastModified);

            const updatedTrip = { ...trip, isCompleted, lastModified, fieldUpdates };

            if (!fromSync) offlineSync.tripUpdate(id, updatedTrip);

            return {
                trips: state.trips.map(t => t.id === id ? updatedTrip : t)
            };
        }),

    importTrip: (tripData: any) =>
        set((state) => {
            if (!validateImportedTrip(tripData)) {
                console.error('[importTrip] Invalid trip data — schema validation failed');
                return state;
            }

            const existingTrip = state.trips.find(t => t.id === tripData.id);

            if (existingTrip && existingTrip.lastModified >= tripData.lastModified) {
                return state;
            }

            const newActivities = (tripData.activities || []).map((a: any) => ({ ...a }));
            const { activities: _stripped, ...cleanTrip } = tripData;

            // Only enqueue sync pushes for LOCAL trips. Cloud-synced trips (from QR/code
            // invites) already exist on the server — pushing them would overwrite the
            // creator's data with the joiner's user_id and stale snapshot.
            const isCloudImport = tripData.isCloudSynced === true;
            if (!isCloudImport) {
                if (existingTrip) {
                    offlineSync.tripUpdate(tripData.id, cleanTrip);
                } else {
                    offlineSync.trip(cleanTrip);
                }
                newActivities.forEach((a: any) => offlineSync.activity(a));
            }

            // Extract embedded expenses from activities into the top-level expenses
            // array so they're available for broadcasting and expense-based calculations.
            const embeddedExpenses: any[] = [];
            for (const a of newActivities) {
                if (a.expenses?.length) {
                    for (const e of a.expenses) {
                        embeddedExpenses.push({ ...e, tripId: a.tripId, activityId: a.id });
                    }
                }
            }

            if (existingTrip) {
                return {
                    trips: state.trips.map(t => t.id === tripData.id ? cleanTrip : t),
                    activities: [
                        ...state.activities.filter(a => a.tripId !== tripData.id),
                        ...newActivities
                    ],
                    expenses: [
                        ...state.expenses.filter(e => e.tripId !== tripData.id),
                        ...embeddedExpenses
                    ],
                };
            }

            return {
                trips: [...state.trips, cleanTrip],
                activities: [...state.activities, ...newActivities],
                expenses: [...state.expenses, ...embeddedExpenses],
            };
        }),

    addMember: (tripId, name, opts, fromSync) => {
        let newMember: TripMember | null = null;
        set((state) => {
            const trip = state.trips.find(t => t.id === tripId);
            if (!trip) return state;

            const existing = trip.members || [];
            const usedColors = existing.map(m => m.color);
            const availableColor = BUDDY_COLORS.find(c => !usedColors.includes(c)) || BUDDY_COLORS[existing.length % BUDDY_COLORS.length];

            // If no members yet, auto-add creator as first member
            let members = [...existing];
            if (members.length === 0) {
                const creatorColor = BUDDY_COLORS.find(c => c !== availableColor) || BUDDY_COLORS[0];
                members.push({
                    id: generateId(),
                    name: 'Me',
                    color: creatorColor,
                    isCreator: true,
                    addedAt: Date.now() - 1,
                });
            }

            newMember = {
                id: generateId(),
                name: name.trim(),
                color: availableColor,
                role: 'editor',
                userId: opts?.userId,
                email: opts?.email,
                addedAt: Date.now(),
            };
            members.push(newMember);

            const lastModified = Date.now();
            const updated = state.trips.map(t => {
                if (t.id === tripId) {
                    return { ...t, members, lastModified, fieldUpdates: stampFieldUpdates(t.fieldUpdates, { members }, lastModified) };
                }
                return t;
            });
            const trip2 = updated.find(t => t.id === tripId);
            if (trip2 && !fromSync) offlineSync.tripUpdate(tripId, trip2);
            return { trips: updated };
        });
        return newMember;
    },

    removeMember: (tripId, memberId, fromSync) =>
        set((state) => {
            const trip = state.trips.find(t => t.id === tripId);
            if (!trip) return state;
            const removedMember = (trip.members || []).find(m => m.id === memberId);
            // Mark member as removed (keep entry so their userId can be checked on their device)
            const members = (trip.members || []).map(m =>
                m.id === memberId ? { ...m, removed: true } : m
            );
            // Track removed userId for sync blocking
            const removedUserId = removedMember?.userId;
            const removedMemberUserIds = [
                ...((trip as any).removedMemberUserIds || []),
                ...(removedUserId ? [removedUserId] : []),
            ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
            const lastModified = Date.now();
            const updated = state.trips.map(t => {
                if (t.id === tripId) {
                    return { ...t, members, removedMemberUserIds, lastModified, fieldUpdates: stampFieldUpdates(t.fieldUpdates, { members }, lastModified) };
                }
                return t;
            });
            const trip2 = updated.find(t => t.id === tripId);
            if (trip2 && !fromSync) offlineSync.tripUpdate(tripId, trip2);
            return { trips: updated };
        }),

    updateMemberRole: (tripId, memberId, role, fromSync) =>
        set((state) => {
            const trip = state.trips.find(t => t.id === tripId);
            if (!trip) return state;
            const members = (trip.members || []).map(m =>
                m.id === memberId ? { ...m, role } : m
            );
            const lastModified = Date.now();
            const updated = state.trips.map(t => {
                if (t.id === tripId) {
                    return { ...t, members, lastModified, fieldUpdates: stampFieldUpdates(t.fieldUpdates, { members }, lastModified) };
                }
                return t;
            });
            const trip2 = updated.find(t => t.id === tripId);
            if (trip2 && !fromSync) offlineSync.tripUpdate(tripId, trip2);
            return { trips: updated };
        }),

    // Deprecated aliases
    addBuddy: (tripId, name) => {
        const self = _get();
        return self.addMember(tripId, name);
    },
    removeBuddy: (tripId, buddyId) => {
        const self = _get();
        self.removeMember(tripId, buddyId);
    },

    updateWalletBaseline: (tripId, walletId, rate, source, fromSync) =>
        set((state) => {
            const lastModified = Date.now();
            const trips = state.trips.map(t => {
                if (t.id === tripId) {
                    const updated = {
                        ...t,
                        lastModified,
                        wallets: (t.wallets || []).map(w => {
                            if (w.id === walletId) {
                                const newW = { ...w, baselineExchangeRate: rate, baselineSource: source };
                                newW.fieldUpdates = stampFieldUpdates(w.fieldUpdates, { baselineExchangeRate: rate, baselineSource: source }, lastModified);
                                if (!fromSync) offlineSync.walletUpdate(walletId, newW);
                                return newW;
                            }
                            return w;
                        })
                    };
                    updated.fieldUpdates = stampFieldUpdates(t.fieldUpdates, { wallets: updated.wallets }, lastModified);
                    if (!fromSync) offlineSync.tripUpdate(tripId, updated);
                    return updated;
                }
                return t;
            });
            return { trips };
        }),
});
