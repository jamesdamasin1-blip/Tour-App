/**
 * CLOUD SLICE v2 — Version-aware realtime subscription per trip.
 *
 * This slice provides `subscribeToTrip()` which returns an unsubscribe function.
 * It listens to postgres_changes for trips, activities, and expenses.
 *
 * All incoming changes are:
 * 1. Version-checked (incoming.version > local.version to apply)
 * 2. Soft-delete aware (deleted_at != null → remove from UI)
 * 3. Never blindly trusted — DB is the only source of truth
 */
import { StateCreator } from 'zustand';
import { Activity, Expense } from '../../types/models';
import { supabase } from '../storeHelpers';
import type { AppState } from '../useStore';

export interface CloudSlice {
    subscribeToTrip: (tripId: string) => () => void;
}

export const createCloudSlice: StateCreator<AppState, [], [], CloudSlice> = (set, get) => ({
    subscribeToTrip: (tripId: string) => {
        const channel = supabase.channel(`cloud-${tripId}`)
            // ── Trip changes ───────────────────────────────────────
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
                (payload: any) => {
                    const row = payload.new || payload.old;
                    if (!row) return;

                    const incomingVersion = Number(row.version || 1);

                    // Soft delete: remove trip and all its children
                    if (row.deleted_at) {
                        set(state => ({
                            trips: state.trips.filter(t => t.id !== tripId),
                            activities: state.activities.filter(a => a.tripId !== tripId),
                            expenses: state.expenses.filter(e => e.tripId !== tripId),
                        }));
                        return;
                    }

                    set(state => {
                        const local = state.trips.find(t => t.id === tripId);
                        // Version check: skip if local is same or newer
                        if (local && (local.version ?? 0) >= incomingVersion) return state;

                        const updated = {
                            ...(local || {}),
                            id: row.id,
                            title: row.title,
                            destination: row.destination,
                            startDate: Number(row.start_date),
                            endDate: Number(row.end_date),
                            homeCountry: row.home_country,
                            homeCurrency: row.home_currency,
                            wallets: row.wallets || [],
                            totalBudgetHomeCached: Number(row.total_budget_home_cached || 0),
                            countries: row.countries,
                            members: row.members || [],
                            isCompleted: row.is_completed,
                            lastModified: Number(row.last_modified),
                            version: incomingVersion,
                            updatedBy: row.updated_by || undefined,
                            deletedAt: null,
                            isCloudSynced: true,
                        };

                        return {
                            trips: local
                                ? state.trips.map(t => t.id === tripId ? { ...t, ...updated } : t)
                                : [...state.trips, updated as any],
                        };
                    });
                }
            )

            // ── Activity changes ───────────────────────────────────
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${tripId}` },
                (payload: any) => {
                    const row = payload.new || payload.old;
                    if (!row?.id) return;

                    const incomingVersion = Number(row.version || 1);

                    // Soft delete: remove activity from UI
                    if (row.deleted_at) {
                        set(state => ({
                            activities: state.activities.filter(a => a.id !== row.id),
                        }));
                        return;
                    }

                    const newActivity: Activity = {
                        id: row.id,
                        tripId: row.trip_id,
                        walletId: row.wallet_id,
                        title: row.title,
                        category: row.category as any,
                        date: Number(row.date),
                        time: Number(row.time),
                        endTime: row.end_time ? Number(row.end_time) : undefined,
                        allocatedBudget: Number(row.allocated_budget),
                        budgetCurrency: row.budget_currency || 'PHP',
                        isCompleted: row.is_completed,
                        lastModified: Number(row.last_modified),
                        description: row.description,
                        location: row.location,
                        countries: row.countries || [],
                        createdBy: row.created_by,
                        lastModifiedBy: row.last_modified_by,
                        expenses: [],
                        version: incomingVersion,
                        updatedBy: row.updated_by || undefined,
                        deletedAt: null,
                    };

                    set(state => {
                        const local = state.activities.find(a => a.id === newActivity.id);
                        // Version check
                        if (local && (local.version ?? 0) >= incomingVersion) return state;

                        if (local) {
                            return {
                                activities: state.activities.map(a =>
                                    a.id === newActivity.id
                                        ? { ...newActivity, expenses: local.expenses }
                                        : a
                                ),
                            };
                        }
                        return { activities: [...state.activities, newActivity] };
                    });
                }
            )

            // ── Expense changes ────────────────────────────────────
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` },
                (payload: any) => {
                    const row = payload.new || payload.old;
                    if (!row?.id) return;

                    const incomingVersion = Number(row.version || 1);
                    const activityId = row.activity_id;

                    // Soft delete: remove expense from UI + activity.expenses
                    if (row.deleted_at) {
                        set(state => ({
                            expenses: state.expenses.filter(e => e.id !== row.id),
                            activities: activityId
                                ? state.activities.map(a => a.id === activityId
                                    ? { ...a, expenses: a.expenses.filter(e => e.id !== row.id) }
                                    : a
                                )
                                : state.activities,
                        }));
                        return;
                    }

                    const newExpense: Expense = {
                        id: row.id,
                        tripId: tripId,
                        walletId: row.wallet_id,
                        activityId: row.activity_id,
                        name: row.name,
                        amount: Number(row.amount),
                        currency: row.currency,
                        convertedAmountHome: Number(row.converted_amount_home),
                        convertedAmountTrip: Number(row.converted_amount_trip),
                        category: row.category as any,
                        time: Number(row.time),
                        date: row.date ? Number(row.date) : Number(row.time),
                        originalAmount: row.original_amount ? Number(row.original_amount) : undefined,
                        originalCurrency: row.original_currency,
                        createdBy: row.created_by,
                        lastModifiedBy: row.last_modified_by,
                        version: incomingVersion,
                        updatedBy: row.updated_by || undefined,
                        deletedAt: null,
                    };

                    set(state => {
                        const local = state.expenses.find(e => e.id === newExpense.id);
                        // Version check
                        if (local && (local.version ?? 0) >= incomingVersion) return state;

                        const updatedExpenses = local
                            ? state.expenses.map(e => e.id === newExpense.id ? newExpense : e)
                            : [...state.expenses, newExpense];

                        const updatedActivities = activityId
                            ? state.activities.map(a => {
                                if (a.id !== activityId) return a;
                                const exists = a.expenses.some(e => e.id === newExpense.id);
                                return {
                                    ...a,
                                    expenses: exists
                                        ? a.expenses.map(e => e.id === newExpense.id ? newExpense : e)
                                        : [...a.expenses, newExpense],
                                };
                            })
                            : state.activities;

                        return {
                            expenses: updatedExpenses,
                            activities: updatedActivities,
                        };
                    });
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] cloud-${tripId} subscription: ${status}`);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    },
});
