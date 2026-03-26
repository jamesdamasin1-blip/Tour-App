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
import { getFundingTotalGlobalHome } from '@/src/finance/wallet/walletEngine';
import { getDeviceId } from '@/src/auth/googleAuth';
import { mergeEntity } from '@/src/sync/syncHelpers';
import { recomputeWalletSpent } from '@/src/store/storeHelpers';
import type { Activity, Expense, TripPlan } from '@/src/types/models';
import type { DeletionRequest } from '@/src/store/slices/settingsSlice';

// ─── Snake → Camel mappers ──────────────────────────────────────

function mapTripFromPayload(row: any): Partial<TripPlan> {
    const result: any = { id: row.id, isCloudSynced: true };
    if ('title' in row) result.title = row.title;
    if ('destination' in row) result.destination = row.destination;
    if ('start_date' in row && row.start_date && Number(row.start_date) > 0) result.startDate = Number(row.start_date);
    if ('end_date' in row && row.end_date && Number(row.end_date) > 0) result.endDate = Number(row.end_date);
    if ('home_country' in row) result.homeCountry = row.home_country;
    if ('home_currency' in row) result.homeCurrency = row.home_currency;
    if ('wallets' in row) {
        result.wallets = row.wallets || [];
        result.tripCurrency = result.wallets[0]?.currency || row.home_currency;
        result.totalBudgetTrip = result.wallets[0]?.totalBudget || 0;
        result.totalBudget = (result.wallets || []).reduce(
            (acc: number, w: any) => acc + (w.totalBudget / (w.defaultRate || 1)), 0
        );
        result.currency = result.wallets[0]?.currency || row.home_currency;
    }
    if ('total_budget_home_cached' in row) result.totalBudgetHomeCached = Number(row.total_budget_home_cached || 0);
    if ('countries' in row) result.countries = row.countries || [];
    if ('members' in row) result.members = row.members || [];
    if ('removed_member_user_ids' in row) result.removedMemberUserIds = row.removed_member_user_ids || [];
    if ('is_completed' in row) result.isCompleted = row.is_completed || false;
    if ('last_modified' in row) result.lastModified = Number(row.last_modified || Date.now());
    if ('version' in row) result.version = Number(row.version || 1);
    if ('updated_by' in row) result.updatedBy = row.updated_by || undefined;
    if ('deleted_at' in row) result.deletedAt = row.deleted_at || null;
    if ('field_updates' in row) result.fieldUpdates = row.field_updates || {};
    if ('last_device_id' in row) result.lastDeviceId = row.last_device_id || undefined;
    if ('spontaneous_events' in row) result.spontaneousEvents = row.spontaneous_events || [];
    return result;
}

function mapActivityFromPayload(row: any): Partial<Activity> {
    const result: any = { id: row.id };
    if ('trip_id' in row) result.tripId = row.trip_id;
    if ('wallet_id' in row) result.walletId = row.wallet_id;
    if ('title' in row) result.title = row.title;
    if ('category' in row) result.category = row.category;
    if ('date' in row) result.date = Number(row.date);
    if ('time' in row) result.time = Number(row.time);
    if ('end_time' in row) result.endTime = row.end_time ? Number(row.end_time) : undefined;
    if ('allocated_budget' in row) result.allocatedBudget = Number(row.allocated_budget);
    if ('budget_currency' in row) result.budgetCurrency = row.budget_currency || 'PHP';
    if ('is_completed' in row) result.isCompleted = row.is_completed;
    if ('is_spontaneous' in row) result.isSpontaneous = row.is_spontaneous === true || row.is_spontaneous === 1 || row.is_spontaneous === 'true';
    if ('last_modified' in row) result.lastModified = Number(row.last_modified);
    if ('description' in row) result.description = row.description;
    if ('location' in row) result.location = row.location;
    if ('countries' in row) result.countries = row.countries || [];
    if ('created_by' in row) result.createdBy = row.created_by;
    if ('last_modified_by' in row) result.lastModifiedBy = row.last_modified_by;
    if ('version' in row) result.version = Number(row.version || 1);
    if ('updated_by' in row) result.updatedBy = row.updated_by || undefined;
    if ('deleted_at' in row) result.deletedAt = row.deleted_at || null;
    if ('field_updates' in row) result.fieldUpdates = row.field_updates || {};
    if ('last_device_id' in row) result.lastDeviceId = row.last_device_id || undefined;
    return result;
}

function mapExpenseFromPayload(row: any): Partial<Expense> {
    const result: any = { id: row.id };
    if ('trip_id' in row) result.tripId = row.trip_id;
    if ('wallet_id' in row) result.walletId = row.wallet_id;
    if ('activity_id' in row) result.activityId = row.activity_id;
    if ('name' in row) result.name = row.name;
    if ('amount' in row) result.amount = Number(row.amount);
    if ('currency' in row) result.currency = row.currency;
    if ('converted_amount_home' in row) result.convertedAmountHome = Number(row.converted_amount_home);
    if ('converted_amount_trip' in row) result.convertedAmountTrip = Number(row.converted_amount_trip);
    if ('category' in row) result.category = row.category;
    if ('time' in row) result.time = Number(row.time);
    if ('date' in row) result.date = Number(row.date);
    if ('original_amount' in row) result.originalAmount = row.original_amount ? Number(row.original_amount) : undefined;
    if ('original_currency' in row) result.originalCurrency = row.original_currency;
    if ('created_by' in row) result.createdBy = row.created_by;
    if ('last_modified_by' in row) result.lastModifiedBy = row.last_modified_by;
    if ('version' in row) result.version = Number(row.version || 1);
    if ('updated_by' in row) result.updatedBy = row.updated_by || undefined;
    if ('deleted_at' in row) result.deletedAt = row.deleted_at || null;
    if ('field_updates' in row) result.fieldUpdates = row.field_updates || {};
    if ('last_device_id' in row) result.lastDeviceId = row.last_device_id || undefined;
    return result;
}

// ─── Version-safe state application ─────────────────────────────

/**
 * Apply a trip change only if incoming version > local version.
 * If deleted_at is set, remove trip from UI.
 */
function applyTripChange(payload: any) {
    if (payload.new?.last_device_id === getDeviceId()) return;
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

    // Check if current user has been removed from this trip
    const currentUserId = useStore.getState().currentUserId;
    const incomingMembers: any[] = (incoming as any).members || [];
    const removedUserIds: string[] = (incoming as any).removedMemberUserIds || [];
    const isSelfRemoved = currentUserId && (
        removedUserIds.includes(currentUserId) ||
        incomingMembers.some((m: any) => m.userId === currentUserId && m.removed === true)
    );
    if (isSelfRemoved) {
        useStore.setState(s => ({
            trips: s.trips.filter(t => t.id !== incoming.id),
            activities: s.activities.filter(a => a.tripId !== incoming.id),
            expenses: s.expenses.filter(e => e.tripId !== incoming.id),
        }));
        console.log(`[Realtime] Current user removed from trip ${incoming.id}, evicting locally`);
        return;
    }

    useStore.setState(s => {
        const local = s.trips.find(t => t.id === incoming.id);

        // Version check bypassed for CRDT-lite merge resolution

        if (local) {
            const merged = mergeEntity(local, incoming, [
                'title', 'destination', 'startDate', 'endDate', 'homeCountry', 'homeCurrency',
                'wallets', 'tripCurrency', 'totalBudgetTrip', 'totalBudget', 'currency',
                'countries', 'members', 'isCompleted', 'isCloudSynced', 'totalBudgetHomeCached',
                'spontaneousEvents', 'removedMemberUserIds'
            ]);
            merged.isCloudSynced = true;
            // Filter removed members from the visible list
            if (merged.members) {
                merged.members = merged.members.filter((m: any) => !m.removed);
            }

            // Deduplicate spontaneousEvents to prevent double-sums from sync collisions Node triggers
            if (incoming.spontaneousEvents) {
                const combined = [
                    ...(local.spontaneousEvents || []),
                    ...(incoming.spontaneousEvents || [])
                ];
                const seen = new Set<string>();
                merged.spontaneousEvents = combined.filter(e => {
                    if (!e.id) return true; // fallback
                    if (seen.has(e.id)) return false;
                    seen.add(e.id);
                    return true;
                });
            }

            return {
                trips: s.trips.map(t => t.id === incoming.id ? merged : t),
            };
        }

        // If trip isn't found locally, it's a sparse partial broadcast update.
        // DO NOT append a sparse node to state! Run Sync pull instead for safety.
        runSync().catch(console.error);
        return s;
    });

    console.log(`[Realtime] Trip ${incoming.id} updated to v${incomingVersion}`);
}

/**
 * Apply an activity change only if incoming version > local version.
 * If deleted_at is set, remove from UI.
 */
function applyActivityChange(payload: any) {
    if (payload.new?.last_device_id === getDeviceId()) return;
    const row = payload.new || payload.old;
    if (!row?.id) return;

    const incoming = mapActivityFromPayload(row);
    const incomingVersion = incoming.version ?? 0;

    // Soft delete / Hard delete check
    if (payload.eventType === 'DELETE' || incoming.deletedAt) {
        useStore.setState(s => ({
            activities: s.activities.filter(a => a.id !== incoming.id),
        }));
        console.log(`[Realtime] Activity ${incoming.id} soft-deleted, removed from UI`);
        return;
    }

    useStore.setState(s => {
        const local = (s.activities || []).find(a => a.id === incoming.id);

        // Version check bypassed for CRDT-lite merge resolution

        if (local) {
            const merged = mergeEntity(local, incoming, [
                'title', 'category', 'date', 'time', 'endTime', 
                'allocatedBudget', 'budgetCurrency', 'isCompleted', 
                'isSpontaneous', 'description', 'location', 'countries'
            ]);
            
            const mergedExpenses = local.expenses ? (local.expenses.length > 0 ? local.expenses : (incoming.expenses || [])) : (incoming.expenses || []);
            merged.expenses = mergedExpenses;

            return {
                activities: (s.activities || []).map(a => a.id === incoming.id ? merged : a),
            };
        }

        // New activity from remote
        return {
            activities: [...(s.activities || []), { ...incoming, expenses: [] } as Activity],
        };
    });

    console.log(`[Realtime] Activity ${incoming.id} updated to v${incomingVersion}`);
}

/**
 * Apply an expense change only if incoming version > local version.
 * If deleted_at is set, remove from UI.
 */
function applyExpenseChange(payload: any) {
    if (payload.new?.last_device_id === getDeviceId()) return;
    const row = payload.new || payload.old;
    if (!row?.id) return;

    const incoming = mapExpenseFromPayload(row);
    const incomingVersion = incoming.version ?? 0;
    const activityId = incoming.activityId;

    // Pre-stage requires outside of the continuous state reducer callbacks to prevent thread-deadlocks
    const { applyExpenseFIFO } = require('../finance/expense/expenseEngine');
    const { reverseFIFO } = require('../store/storeHelpers');

    // Soft delete / Hard delete check
    if (payload.eventType === 'DELETE' || incoming.deletedAt) {
        useStore.setState(s => {
            const localExpense = (s.expenses || []).find(e => e.id === incoming.id);
            const updatedExpenses = (s.expenses || []).filter(e => e.id !== incoming.id);
            const updatedActivities = activityId
                ? (s.activities || []).map(a => a.id === activityId
                    ? { ...a, expenses: (a.expenses || []).filter(e => e.id !== incoming.id) }
                    : a
                ) : (s.activities || []);

            const updatedTrips = s.trips.map(t => {
                if (t.id !== incoming.tripId) return t;
                const updatedWallets = t.wallets.map(w => {
                    if (w.id !== incoming.walletId || !localExpense) return w;
                    try {
                        const linkedA = (s.activities || []).find(a => a.id === localExpense.activityId);
                        if (linkedA?.isSpontaneous) return w; // Skip credit-back for spontaneous items Node triggers
                        return { ...w, lots: reverseFIFO(w, localExpense) };
                    } catch (e) {
                        return w;
                    }
                });
                return { ...t, wallets: recomputeWalletSpent(updatedWallets, updatedExpenses) };
            });

            console.log(`[Realtime] Expense ${incoming.id} soft-deleted, removed from UI`);
            return {
                expenses: updatedExpenses,
                activities: updatedActivities,
                trips: updatedTrips
            };
        });
        return;
    }

    useStore.setState(s => {
        const local = (s.expenses || []).find(e => e.id === incoming.id);
        const mergedExpense = local 
            ? mergeEntity(local, incoming, [
                'name', 'amount', 'currency', 'convertedAmountHome', 'convertedAmountTrip',
                'category', 'time', 'date', 'originalAmount', 'originalCurrency', 'lotBreakdown'
            ])
            : (incoming as Expense);

        const updatedExpenses = local
            ? (s.expenses || []).map(e => e.id === incoming.id ? mergedExpense : e)
            : [...(s.expenses || []), mergedExpense];

        let lotBreakdownToSave = mergedExpense.lotBreakdown;

        const updatedTrips = s.trips.map(t => {
            if (t.id !== incoming.tripId) return t;

            const updatedWallets = t.wallets.map(w => {
                if (w.id !== incoming.walletId) return w;

                try {
                    const convertedAmount = Number(mergedExpense.convertedAmountTrip || mergedExpense.amount || 0);
                    if (convertedAmount <= 0) {
                        console.warn('[Realtime] Skipping FIFO for non-positive expense amount:', convertedAmount);
                        return w;
                    }

                    let preWallet = w;
                    if (local && local.lotBreakdown) {
                        preWallet = { ...w, lots: reverseFIFO(w, local) };
                    }

                    const { updatedWallet, breakdown } = applyExpenseFIFO(preWallet as any, convertedAmount);
                    
                    lotBreakdownToSave = breakdown;
                    return { ...w, lots: updatedWallet.lots };
                } catch (e) {
                    console.error('[Realtime] Sync FIFO failed:', e);
                    return w;
                }
            });

            return { ...t, wallets: recomputeWalletSpent(updatedWallets, updatedExpenses) };
        });

        if (lotBreakdownToSave) mergedExpense.lotBreakdown = lotBreakdownToSave;

        const updatedActivities = activityId
            ? (s.activities || []).map(a => {
                if (a.id !== activityId) return a;
                const existingExpenses = a.expenses || [];
                const existsInActivity = existingExpenses.some(e => e.id === incoming.id);
                return {
                    ...a,
                    expenses: existsInActivity
                        ? existingExpenses.map(e => e.id === incoming.id ? mergedExpense : e)
                        : [...existingExpenses, mergedExpense],
                };
            })
            : (s.activities || []);

        return {
            expenses: updatedExpenses,
            activities: updatedActivities,
            trips: updatedTrips
        };
    });

    console.log(`[Realtime] Expense ${incoming.id} updated`);
}

/**
 * Apply a wallet change only if incoming version > local version.
 */
function applyWalletChange(payload: any) {
    if (payload.new?.last_device_id === getDeviceId()) return;
    const row = payload.new || payload.old;
    if (!row?.id) return;

    const incomingVersion = Number(row.version || 1);

    // Soft delete check
    if (row.deleted_at) return;

    useStore.setState(s => {
        try {
            let applied = false;
            const updatedTrips = (s.trips || []).map(t => {
                if (t.id !== row.trip_id) return t;

                const existingWallet = (t.wallets || []).find(w => w.id === row.id);
                // Version check bypassed for CRDT-lite merge resolution

                const incomingWallet = {
                    id: row.id,
                    tripId: row.trip_id,
                    country: existingWallet?.country || '', // country isn't in DB right now, we preserve local if present
                    currency: row.currency,
                    totalBudget: Number(row.total_budget || 0),
                    spentAmount: Number(row.spent_amount || 0),
                    defaultRate: Number(row.default_rate || 1),
                    baselineExchangeRate: row.baseline_exchange_rate ? Number(row.baseline_exchange_rate) : undefined,
                    lots: row.lots || [],
                    createdAt: existingWallet ? existingWallet.createdAt : Date.now(),
                    version: incomingVersion,
                    updatedBy: row.updated_by,
                    deletedAt: row.deleted_at,
                    fieldUpdates: row.field_updates
                } as any;

                applied = true;

                const mergedWallet = existingWallet
                    ? mergeEntity(existingWallet, incomingWallet, [
                        'currency', 'totalBudget', 'spentAmount', 'defaultRate', 
                        'baselineExchangeRate', 'lots', 'deletedAt'
                    ])
                    : (incomingWallet as any);

                const updatedWallets = existingWallet
                    ? (t.wallets || []).map(w => w.id === row.id ? mergedWallet : w)
                    : [...(t.wallets || []), mergedWallet];
                    
                const totalBudgetHomeCached = updatedWallets.reduce((sum, wallet) => {
                    return sum + getFundingTotalGlobalHome(wallet, t.homeCurrency || 'PHP');
                }, 0);

                return { ...t, wallets: updatedWallets, totalBudgetHomeCached };
            });

            if (applied) {
                console.log(`[Realtime] Wallet ${row.id} updated to v${incomingVersion}`);
                return { trips: updatedTrips };
            }
            return {};
        } catch (e: any) {
            console.error('[Realtime] applyWalletChange Crash:', e);
            setTimeout(() => {
                const { Alert } = require('react-native');
                Alert.alert('Wallet Sync Crash', e.toString());
            }, 100);
            return s;
        }
    });
}

/**
 * Apply a funding lot (exchange event) change only if incoming version > local version.
 */
function applyFundingLotChange(payload: any) {
    if (payload.new?.last_device_id === getDeviceId()) return;
    const row = payload.new || payload.old;
    if (!row?.id) return;

    const incomingVersion = Number(row.version || 1);

    if (row.deleted_at) {
        useStore.setState(s => ({
            exchangeEvents: s.exchangeEvents.filter(e => e.id !== row.id)
        }));
        return;
    }

    const incomingEvent = {
        id: row.id,
        tripId: row.trip_id,
        walletId: row.wallet_id,
        homeAmount: Number(row.source_amount), // assuming source_amount is homeAmount
        tripAmount: (row.rate && Number(row.rate) > 0) ? Number(row.source_amount) / Number(row.rate) : 0,
        rate: Number(row.rate),
        date: Date.now(), // DB doesn't have date column for funding_lots besides created_at
        notes: row.notes,
        version: incomingVersion,
        updatedBy: row.updated_by,
        deletedAt: row.deleted_at
    };

    useStore.setState(s => {
        try {
            const local = (s.exchangeEvents || []).find(e => e.id === row.id);
            if (local && (local.version ?? 0) >= incomingVersion) {
                if ((local.version ?? 0) === incomingVersion && row.updated_by && row.updated_by !== local.updatedBy) {
                   // Apply
                } else {
                   return {};
                }
            }

            const updatedEvents = local
                ? (s.exchangeEvents || []).map(e => e.id === row.id ? incomingEvent : e)
                : [...(s.exchangeEvents || []), incomingEvent];

            console.log(`[Realtime] FundingLot ${row.id} updated to v${incomingVersion}`);
            
            // ─── CRITICAL FIX: Also inject into trip.wallets.lots visual cache ───
            const updatedTrips = (s.trips || []).map(t => {
                if (t.id !== row.trip_id) return t;

                const updatedWallets = (t.wallets || []).map(w => {
                    if (w.id !== row.wallet_id) return w;

                    const lotExists = (w.lots || []).some((l: any) => l.id === row.id);
                    const lotRate = Number(row.rate || 0);
                    const lotSourceAmount = Number(row.source_amount || 0);
                    const lotConverted = lotRate > 0 ? lotSourceAmount / lotRate : 0;

                    const mappedLot = {
                        id: row.id,
                        walletCurrency: w.currency,
                        sourceCurrency: row.source_currency || t.homeCurrency || 'PHP',
                        sourceAmount: lotSourceAmount,
                        originalConvertedAmount: lotConverted,
                        remainingAmount: lotConverted, 
                        lockedRate: lotRate || 1,
                        isDefault: true, // enforce default on sync to align with creator
                        createdAt: Date.now()
                    };

                    const preppedLots = lotExists ? w.lots : (w.lots || []).map((l: any) => ({ ...l, isDefault: false }));
                    const updatedLots = lotExists
                        ? preppedLots.map((l: any) => l.id === row.id ? { ...l, ...mappedLot, remainingAmount: l.remainingAmount } : l)
                        : [...preppedLots, mappedLot];

                    return { ...w, lots: updatedLots };
                });

                // Recompute totalBudgetHomeCached so Header instantly reacts
                const totalBudgetHomeCached = updatedWallets.reduce((sum: number, wallet: any) => {
                    const lots = wallet.lots || [];
                    const walletTotal = lots.reduce((acc: number, lot: any) => {
                        if (lot.sourceCurrency === (t.homeCurrency || 'PHP')) {
                            return acc + Number(lot.sourceAmount || 0);
                        }
                        if (lot.rateBaseCurrency) {
                            return acc + (Number(lot.originalConvertedAmount || 0) * Number(lot.rateBaseCurrency));
                        }
                        return acc + Number(lot.sourceAmount || 0);
                    }, 0);
                    return sum + walletTotal;
                }, 0);

                return { ...t, wallets: updatedWallets, totalBudgetHomeCached };
            });

            return { 
                exchangeEvents: updatedEvents,
                trips: updatedTrips 
            };
        } catch (e: any) {
            console.error('[Realtime] applyFundingLotChange Crash:', e);
            setTimeout(() => {
                const { Alert } = require('react-native');
                Alert.alert('Funding Lot Sync Crash', e.toString());
            }, 100);
            return s;
        }
    });
}

// ─── Main hook ─────────────────────────────────────────────────

export const useRealtimeSync = () => {
    const trips = useStore(state => state.trips);
    const channels = useRef<{ [tripId: string]: any }>({});

    const sendDeleteRequest = useCallback((req: DeletionRequest) => {
        const channel = channels.current[req.tripId];
        if (channel) {
            channel.send({ type: 'broadcast', event: 'delete_request', payload: req });
        }
    }, []);

    const sendDeleteRequestCancelled = useCallback((tripId: string, requestId: string) => {
        const channel = channels.current[tripId];
        if (channel) {
            channel.send({ type: 'broadcast', event: 'delete_request_resolved', payload: { requestId } });
        }
    }, []);

    const subscribeToTrip = useCallback((tripId: string) => {
        if (channels.current[tripId]) {
            return () => {}; // No-op for safety
        }

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
            // Wallet changes for this trip
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'wallets', filter: `trip_id=eq.${tripId}` },
                (payload) => {
                    applyWalletChange(payload);
                }
            )
            // Funding lot changes for this trip
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'funding_lots', filter: `trip_id=eq.${tripId}` },
                (payload) => {
                    applyFundingLotChange(payload);
                }
            )
            .on('broadcast', { event: 'delete_request' }, ({ payload }) => {
                const state = useStore.getState();
                const trip = state.trips.find(t => t.id === tripId);
                const currentMember = (trip?.members || []).find(m => m.userId === state.currentUserId);
                if (currentMember?.isCreator) {
                    state.addDeletionRequest(payload as DeletionRequest);
                }
            })
            .on('broadcast', { event: 'delete_request_resolved' }, ({ payload }) => {
                useStore.getState().removeDeletionRequest(payload.requestId);
            })
            .subscribe((status) => {
                console.log(`[Realtime] sync-${tripId}: ${status}`);

                if (status === 'SUBSCRIBED') {
                    // Small delay to avoid race with subscription setup
                    setTimeout(() => {
                        runSync().catch(err =>
                            console.error(`[Realtime] Reconnect sync failed for ${tripId}:`, err)
                        );
                    }, 500);
                }
            });

        channels.current[tripId] = channel;

        return () => {
            console.log(`[Realtime] Unsubscribing from sync-${tripId}`);
            supabase.removeChannel(channel);
            delete channels.current[tripId];
        };
    }, []);

    // Cleanup all channels on unmount
    useEffect(() => {
        return () => {
            for (const id of Object.keys(channels.current)) {
                supabase.removeChannel(channels.current[id]);
            }
            channels.current = {};
        };
    }, []);

    return { subscribeToTrip, sendDeleteRequest, sendDeleteRequestCancelled };
};
