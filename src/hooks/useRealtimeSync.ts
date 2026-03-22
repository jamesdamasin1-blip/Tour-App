/**
 * REALTIME SYNC v2 — Database-as-truth via Supabase Postgres Changes.
 *
 * Architecture:
 * - Subscribes to postgres_changes on trips, activities, expenses per trip
 * - NEVER trusts broadcast payloads as source of truth
 * - All incoming changes are version-checked before applying
 * - Soft deletes (deleted_at != null) trigger local removal from UI
 * - Optional lightweight broadcast used ONLY as invalidation signal
 *
 * Conflict resolution: version-based LWW
 * - incoming.version > local.version → apply
 * - incoming.version <= local.version → ignore (local is newer or equal)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/src/store/useStore';
import { supabase } from '@/src/utils/supabase';
import { runSync } from '@/src/sync/syncEngine';
import type { Activity, Expense, TripPlan } from '@/src/types/models';

// ─── Snake → Camel mappers ──────────────────────────────────────

function mapTripFromPayload(row: any): Partial<TripPlan> {
    return {
        id: row.id,
        title: row.title,
        destination: row.destination,
        startDate: Number(row.start_date),
        endDate: Number(row.end_date),
        homeCountry: row.home_country,
        homeCurrency: row.home_currency,
        wallets: row.wallets || [],
        totalBudgetHomeCached: Number(row.total_budget_home_cached || 0),
        tripCurrency: row.wallets?.[0]?.currency || row.home_currency,
        totalBudgetTrip: row.wallets?.[0]?.totalBudget || 0,
        totalBudget: (row.wallets || []).reduce(
            (acc: number, w: any) => acc + (w.totalBudget / (w.defaultRate || 1)), 0
        ),
        currency: row.wallets?.[0]?.currency || row.home_currency,
        countries: row.countries || [],
        members: row.members || [],
        isCompleted: row.is_completed || false,
        lastModified: Number(row.last_modified || Date.now()),
        isCloudSynced: true,
        version: Number(row.version || 1),
        updatedBy: row.updated_by || undefined,
        deletedAt: row.deleted_at || null,
    };
}

function mapActivityFromPayload(row: any): Activity {
    return {
        id: row.id,
        tripId: row.trip_id,
        walletId: row.wallet_id,
        title: row.title,
        category: row.category,
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
        version: Number(row.version || 1),
        updatedBy: row.updated_by || undefined,
        deletedAt: row.deleted_at || null,
    };
}

function mapExpenseFromPayload(row: any): Expense {
    return {
        id: row.id,
        tripId: row.trip_id,
        walletId: row.wallet_id,
        activityId: row.activity_id,
        name: row.name,
        amount: Number(row.amount),
        currency: row.currency,
        convertedAmountHome: Number(row.converted_amount_home),
        convertedAmountTrip: Number(row.converted_amount_trip),
        category: row.category,
        time: Number(row.time),
        date: Number(row.date),
        originalAmount: row.original_amount ? Number(row.original_amount) : undefined,
        originalCurrency: row.original_currency,
        createdBy: row.created_by,
        lastModifiedBy: row.last_modified_by,
        version: Number(row.version || 1),
        updatedBy: row.updated_by || undefined,
        deletedAt: row.deleted_at || null,
    };
}

// ─── Version-safe state application ─────────────────────────────

/**
 * Apply a trip change only if incoming version > local version.
 * If deleted_at is set, remove trip from UI.
 */
function applyTripChange(payload: any) {
    const incoming = mapTripFromPayload(payload.new || payload.old);
    if (!incoming.id) return;

    const incomingVersion = incoming.version ?? 0;

    // Soft delete check
    if (incoming.deletedAt) {
        useStore.setState(s => ({
            trips: s.trips.filter(t => t.id !== incoming.id),
            activities: s.activities.filter(a => a.tripId !== incoming.id),
            expenses: s.expenses.filter(e => e.tripId !== incoming.id),
        }));
        console.log(`[Realtime] Trip ${incoming.id} soft-deleted, removed from UI`);
        return;
    }

    useStore.setState(s => {
        const local = s.trips.find(t => t.id === incoming.id);

        // Version check: only apply if incoming is strictly newer
        // Equal versions → keep local (we are the source of truth for our own edits)
        if (local && (local.version ?? 0) >= incomingVersion) {
            // Exception: if updatedBy differs and versions are equal, remote wins
            // (this handles the case where DB trigger incremented to the same version on both sides)
            if ((local.version ?? 0) === incomingVersion && incoming.updatedBy && incoming.updatedBy !== local.updatedBy) {
                // Fall through — apply the remote update
            } else {
                console.log(`[Realtime] Trip ${incoming.id}: local v${local.version} >= remote v${incomingVersion}, skipping`);
                return s;
            }
        }

        if (local) {
            return {
                trips: s.trips.map(t => t.id === incoming.id
                    ? { ...t, ...incoming, isCloudSynced: true }
                    : t
                ),
            };
        }

        // New trip from remote (e.g. after invite accept on another device)
        return {
            trips: [...s.trips, { ...incoming, isCloudSynced: true } as TripPlan],
        };
    });

    console.log(`[Realtime] Trip ${incoming.id} updated to v${incomingVersion}`);
}

/**
 * Apply an activity change only if incoming version > local version.
 * If deleted_at is set, remove from UI.
 */
function applyActivityChange(payload: any) {
    const row = payload.new || payload.old;
    if (!row?.id) return;

    const incoming = mapActivityFromPayload(row);
    const incomingVersion = incoming.version ?? 0;

    // Soft delete check
    if (incoming.deletedAt) {
        useStore.setState(s => ({
            activities: s.activities.filter(a => a.id !== incoming.id),
        }));
        console.log(`[Realtime] Activity ${incoming.id} soft-deleted, removed from UI`);
        return;
    }

    useStore.setState(s => {
        const local = s.activities.find(a => a.id === incoming.id);

        // Version check
        if (local && (local.version ?? 0) >= incomingVersion) {
            if ((local.version ?? 0) === incomingVersion && incoming.updatedBy && incoming.updatedBy !== local.updatedBy) {
                // Same version but different author — apply remote
            } else {
                console.log(`[Realtime] Activity ${incoming.id}: local v${local.version} >= remote v${incomingVersion}, skipping`);
                return s;
            }
        }

        if (local) {
            // Merge: use remote activity fields but keep local expenses
            // (expenses have their own version-checked sync path)
            const mergedExpenses = local.expenses.length > 0 ? local.expenses : incoming.expenses;
            return {
                activities: s.activities.map(a => a.id === incoming.id
                    ? { ...incoming, expenses: mergedExpenses }
                    : a
                ),
            };
        }

        // New activity from remote
        return {
            activities: [...s.activities, incoming],
        };
    });

    console.log(`[Realtime] Activity ${incoming.id} updated to v${incomingVersion}`);
}

/**
 * Apply an expense change only if incoming version > local version.
 * If deleted_at is set, remove from UI.
 */
function applyExpenseChange(payload: any) {
    const row = payload.new || payload.old;
    if (!row?.id) return;

    const incoming = mapExpenseFromPayload(row);
    const incomingVersion = incoming.version ?? 0;
    const activityId = incoming.activityId;

    // Soft delete check
    if (incoming.deletedAt) {
        useStore.setState(s => ({
            expenses: s.expenses.filter(e => e.id !== incoming.id),
            activities: activityId
                ? s.activities.map(a => a.id === activityId
                    ? { ...a, expenses: a.expenses.filter(e => e.id !== incoming.id) }
                    : a
                )
                : s.activities,
        }));
        console.log(`[Realtime] Expense ${incoming.id} soft-deleted, removed from UI`);
        return;
    }

    useStore.setState(s => {
        const local = s.expenses.find(e => e.id === incoming.id);

        // Version check
        if (local && (local.version ?? 0) >= incomingVersion) {
            if ((local.version ?? 0) === incomingVersion && incoming.updatedBy && incoming.updatedBy !== local.updatedBy) {
                // Same version but different author — apply remote
            } else {
                console.log(`[Realtime] Expense ${incoming.id}: local v${local.version} >= remote v${incomingVersion}, skipping`);
                return s;
            }
        }

        const updatedExpenses = local
            ? s.expenses.map(e => e.id === incoming.id ? incoming : e)
            : [...s.expenses, incoming];

        const updatedActivities = activityId
            ? s.activities.map(a => {
                if (a.id !== activityId) return a;
                const existsInActivity = a.expenses.some(e => e.id === incoming.id);
                return {
                    ...a,
                    expenses: existsInActivity
                        ? a.expenses.map(e => e.id === incoming.id ? incoming : e)
                        : [...a.expenses, incoming],
                };
            })
            : s.activities;

        return {
            expenses: updatedExpenses,
            activities: updatedActivities,
        };
    });

    console.log(`[Realtime] Expense ${incoming.id} updated to v${incomingVersion}`);
}

// ─── Main hook ─────────────────────────────────────────────────

export const useRealtimeSync = () => {
    const trips = useStore(state => state.trips);
    const channels = useRef<{ [tripId: string]: any }>({});

    const subscribeToTrip = useCallback((tripId: string) => {
        if (channels.current[tripId]) return;

        const channel = supabase.channel(`sync-${tripId}`)
            // Trip-level changes
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
                (payload) => {
                    applyTripChange(payload);
                }
            )
            // Activity changes for this trip
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${tripId}` },
                (payload) => {
                    applyActivityChange(payload);
                }
            )
            // Expense changes for this trip
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` },
                (payload) => {
                    applyExpenseChange(payload);
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] sync-${tripId}: ${status}`);

                // On reconnect after disconnect, trigger a full sync to catch
                // any changes that were missed while offline
                if (status === 'SUBSCRIBED') {
                    // Small delay to avoid race with the subscription setup
                    setTimeout(() => {
                        runSync().catch(err =>
                            console.error(`[Realtime] Reconnect sync failed for ${tripId}:`, err)
                        );
                    }, 500);
                }
            });

        channels.current[tripId] = channel;
    }, []);

    // Subscribe to postgres_changes for each trip
    useEffect(() => {
        const activeTripIds = new Set(trips.map(t => t.id));

        // Subscribe to new trips
        for (const trip of trips) {
            if (!channels.current[trip.id]) {
                subscribeToTrip(trip.id);
            }
        }

        // Cleanup channels for removed trips
        for (const id of Object.keys(channels.current)) {
            if (!activeTripIds.has(id)) {
                supabase.removeChannel(channels.current[id]);
                delete channels.current[id];
                console.log(`[Realtime] Unsubscribed from sync-${id}`);
            }
        }
    }, [trips, subscribeToTrip]);

    // Cleanup all channels on unmount
    useEffect(() => {
        return () => {
            for (const id of Object.keys(channels.current)) {
                supabase.removeChannel(channels.current[id]);
            }
            channels.current = {};
        };
    }, []);
};
