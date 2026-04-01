/**
 * REALTIME SYNC v3 — Channel lifecycle only.
 *
 * Architecture:
 *  - Subscribes to postgres_changes on trips, activities, expenses, wallets,
 *    funding_lots per trip.
 *  - On each event: reads a state snapshot, delegates to a pure handler,
 *    applies the returned patch to the Zustand store.
 *  - Business logic lives exclusively in sync/realtime/*.handler.ts.
 *  - This hook owns ONLY: channel setup, channel teardown, broadcast relay.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useMountEffect } from './useMountEffect';
import { useStore } from '@/src/store/useStore';
import { supabase } from '@/src/utils/supabase';
import { runSync, refetchTripActivities } from '@/src/sync/syncEngine';
import { handleTripChange } from '@/src/sync/realtime/trip.handler';
import { handleActivityChange } from '@/src/sync/realtime/activity.handler';
import { handleExpenseChange } from '@/src/sync/realtime/expense.handler';
import { handleWalletChange } from '@/src/sync/realtime/wallet.handler';
import { handleFundingLotChange } from '@/src/sync/realtime/fundingLot.handler';
import type { StateSnapshot, HandlerResult } from '@/src/sync/realtime/types';
import type { DeletionRequest } from '@/src/store/slices/settingsSlice';
import { syncTrace, summarizeRealtimePayload } from '@/src/sync/debug';

const sharedChannels: Record<string, any> = {};
let realtimeSyncMountCount = 0;
const sharedRefetchTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const sharedReconnectTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const sharedReconnectAttempts: Record<string, number> = {};
const DEBUG_REALTIME_LOGS = false;
const DEBUG_REALTIME_TIMING = false;

const clearReconnectTimer = (tripId: string) => {
    if (!sharedReconnectTimers[tripId]) return;
    clearTimeout(sharedReconnectTimers[tripId]);
    delete sharedReconnectTimers[tripId];
};

const resetReconnectState = (tripId: string) => {
    clearReconnectTimer(tripId);
    delete sharedReconnectAttempts[tripId];
};

// ─── Dispatch helpers ────────────────────────────────────────────

/** Read a minimal state snapshot for handler consumption — no subscriptions. */
function getSnapshot(): StateSnapshot {
    const s = useStore.getState();
    return {
        trips: s.trips,
        activities: s.activities,
        expenses: s.expenses,
        exchangeEvents: s.exchangeEvents,
        currentUserId: s.currentUserId,
    };
}

/** Apply a HandlerResult to the Zustand store. */
function applyResult(result: HandlerResult, table?: string): void {
    syncTrace('RealtimeDispatch', 'apply_result', {
        table: table ?? '?',
        hasPatch: !!result.patch,
        triggerSync: !!result.triggerSync,
        triggerRefetchTripId: result.triggerRefetchTripId ?? null,
    });
    if (result.patch) {
        // ⏱ T3: patch applied to store
        if (DEBUG_REALTIME_TIMING) {
            console.log(`[SYNC_TIMING] T3_STORE_PATCH table=${table ?? '?'} t=${Date.now()}`);
        }
        useStore.setState(result.patch);
    }
    if (result.triggerSync) {
        runSync().catch(console.error);
    }
    if (result.triggerRefetchTripId) {
        const tripId = result.triggerRefetchTripId;
        if (sharedRefetchTimers[tripId]) {
            clearTimeout(sharedRefetchTimers[tripId]);
        }
        sharedRefetchTimers[tripId] = setTimeout(() => {
            delete sharedRefetchTimers[tripId];
            refetchTripActivities(tripId).catch(console.error);
        }, 250);
    }
}

// ─── Hook ────────────────────────────────────────────────────────

export const useRealtimeSync = () => {
    const trips = useStore(state => state.trips);
    const channels = sharedChannels;

    const removeTripChannel = useCallback((tripId: string) => {
        const channel = channels[tripId];
        if (!channel) return;
        void supabase.removeChannel(channel);
        delete channels[tripId];
    }, [channels]);

    const sendDeleteRequest = useCallback((req: DeletionRequest) => {
        channels[req.tripId]?.send({
            type: 'broadcast', event: 'delete_request', payload: req,
        });
    }, [channels]);

    const sendDeleteRequestCancelled = useCallback((tripId: string, requestId: string) => {
        channels[tripId]?.send({
            type: 'broadcast', event: 'delete_request_resolved', payload: { requestId },
        });
    }, [channels]);

    const subscribeToTrip = useCallback((tripId: string) => {
        if (channels[tripId]) return () => {};

        const scheduleReconnect = (reason: 'TIMED_OUT' | 'CHANNEL_ERROR', err?: unknown) => {
            if (sharedReconnectTimers[tripId]) return;

            removeTripChannel(tripId);

            const attempt = (sharedReconnectAttempts[tripId] ?? 0) + 1;
            sharedReconnectAttempts[tripId] = attempt;

            const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10000);
            const suffix = err instanceof Error
                ? ` error=${err.message}`
                : err
                    ? ` error=${JSON.stringify(err)}`
                    : '';

            console.warn(
                `[Realtime] sync-${tripId}: ${reason}; retrying in ${delayMs}ms (attempt ${attempt})${suffix}`
            );

            sharedReconnectTimers[tripId] = setTimeout(() => {
                delete sharedReconnectTimers[tripId];

                const stillSubscribed = useStore.getState().trips.some(trip => trip.id === tripId);
                if (!stillSubscribed) {
                    delete sharedReconnectAttempts[tripId];
                    return;
                }

                subscribeToTrip(tripId);
            }, delayMs);
        };

        // Cross-dispatch protection is handled by column-based guards inside each
        // handler (e.g. 'amount' for expenses, 'allocated_budget' for activities).
        // Do NOT gate on p.table — Supabase JS often omits it from the payload,
        // which would silently block ALL realtime events.

        const channel = supabase.channel(`sync-${tripId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
                (p) => { if (DEBUG_REALTIME_TIMING) console.log(`[SYNC_TIMING] T2_RT_RECV table=trips t=${Date.now()}`); syncTrace('RealtimeHook', 'recv_trips', summarizeRealtimePayload(p)); applyResult(handleTripChange(p, getSnapshot()), 'trips'); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${tripId}` },
                (p) => { if (DEBUG_REALTIME_TIMING) console.log(`[SYNC_TIMING] T2_RT_RECV table=activities t=${Date.now()}`); syncTrace('RealtimeHook', 'recv_activities', summarizeRealtimePayload(p)); applyResult(handleActivityChange(p, getSnapshot()), 'activities'); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` },
                (p) => { if (DEBUG_REALTIME_TIMING) console.log(`[SYNC_TIMING] T2_RT_RECV table=expenses t=${Date.now()}`); syncTrace('RealtimeHook', 'recv_expenses', summarizeRealtimePayload(p)); applyResult(handleExpenseChange(p, getSnapshot()), 'expenses'); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'wallets', filter: `trip_id=eq.${tripId}` },
                (p) => { if (DEBUG_REALTIME_TIMING) console.log(`[SYNC_TIMING] T2_RT_RECV table=wallets t=${Date.now()}`); syncTrace('RealtimeHook', 'recv_wallets', summarizeRealtimePayload(p)); applyResult(handleWalletChange(p, getSnapshot()), 'wallets'); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'funding_lots', filter: `trip_id=eq.${tripId}` },
                (p) => { if (DEBUG_REALTIME_TIMING) console.log(`[SYNC_TIMING] T2_RT_RECV table=funding_lots t=${Date.now()}`); syncTrace('RealtimeHook', 'recv_funding_lots', summarizeRealtimePayload(p)); applyResult(handleFundingLotChange(p, getSnapshot()), 'funding_lots'); })
            .on('broadcast', { event: 'delete_request' }, ({ payload }) => {
                const state = useStore.getState();
                const trip = state.trips.find(t => t.id === tripId);
                const member = (trip?.members ?? []).find(m => m.userId === state.currentUserId);
                if (member?.isCreator) state.addDeletionRequest(payload as DeletionRequest);
            })
            .on('broadcast', { event: 'delete_request_resolved' }, ({ payload }) => {
                useStore.getState().removeDeletionRequest(payload.requestId);
            })
            .subscribe((status, err) => {
                if (DEBUG_REALTIME_LOGS) {
                    console.log(`[Realtime] sync-${tripId}: ${status}${err ? ` error=${JSON.stringify(err)}` : ''}`);
                }
                if (status === 'CHANNEL_ERROR') {
                    scheduleReconnect('CHANNEL_ERROR', err);
                }
                if (status === 'TIMED_OUT') {
                    scheduleReconnect('TIMED_OUT');
                }
                if (status === 'SUBSCRIBED') {
                    resetReconnectState(tripId);
                    // Small delay avoids race with subscription setup
                    setTimeout(() => runSync().catch(err =>
                        console.warn(`[Realtime] Reconnect sync failed for ${tripId}:`, err)
                    ), 100);
                }
            });

        channels[tripId] = channel;
        return () => {
            resetReconnectState(tripId);
            void supabase.removeChannel(channel);
            delete channels[tripId];
        };
    }, [channels, removeTripChannel]);

    // ─── Auto-subscribe to ALL trips (always-on realtime) ──────────
    const tripIdKey = useMemo(
        () => trips.map(t => t.id).sort().join(','),
        [trips]
    );

    useEffect(() => {
        if (!tripIdKey) return;
        const ids = tripIdKey.split(',');
        const idSet = new Set(ids);

        for (const id of ids) {
            if (!channels[id]) subscribeToTrip(id);
        }

        // Unsubscribe from trips that were removed
        for (const id of Object.keys(channels)) {
            if (!idSet.has(id)) {
                resetReconnectState(id);
                removeTripChannel(id);
            }
        }
    }, [channels, tripIdKey, removeTripChannel, subscribeToTrip]);

    // Cleanup all channels on unmount
    useMountEffect(() => {
        realtimeSyncMountCount += 1;

        return () => {
            realtimeSyncMountCount -= 1;
            if (realtimeSyncMountCount > 0) return;

            for (const id of Object.keys(channels)) {
                resetReconnectState(id);
                void supabase.removeChannel(channels[id]);
            }
            for (const id of Object.keys(channels)) {
                delete channels[id];
            }
            for (const tripId of Object.keys(sharedRefetchTimers)) {
                clearTimeout(sharedRefetchTimers[tripId]);
                delete sharedRefetchTimers[tripId];
            }
            for (const tripId of Object.keys(sharedReconnectTimers)) {
                clearTimeout(sharedReconnectTimers[tripId]);
                delete sharedReconnectTimers[tripId];
                delete sharedReconnectAttempts[tripId];
            }
        };
    });

    return { subscribeToTrip, sendDeleteRequest, sendDeleteRequestCancelled };
};
