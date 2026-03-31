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
import { useRef, useCallback, useEffect, useMemo } from 'react';
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
    if (result.patch) {
        // ⏱ T3: patch applied to store
        console.log(`[SYNC_TIMING] T3_STORE_PATCH table=${table ?? '?'} t=${Date.now()}`);
        useStore.setState(result.patch);
    }
    if (result.triggerSync) {
        runSync().catch(console.error);
    }
    if (result.triggerRefetchTripId) {
        refetchTripActivities(result.triggerRefetchTripId).catch(console.error);
    }
}

// ─── Hook ────────────────────────────────────────────────────────

export const useRealtimeSync = () => {
    const trips = useStore(state => state.trips);
    const channels = useRef<Record<string, any>>({});

    const sendDeleteRequest = useCallback((req: DeletionRequest) => {
        channels.current[req.tripId]?.send({
            type: 'broadcast', event: 'delete_request', payload: req,
        });
    }, []);

    const sendDeleteRequestCancelled = useCallback((tripId: string, requestId: string) => {
        channels.current[tripId]?.send({
            type: 'broadcast', event: 'delete_request_resolved', payload: { requestId },
        });
    }, []);

    const subscribeToTrip = useCallback((tripId: string) => {
        if (channels.current[tripId]) return () => {};

        // Cross-dispatch protection is handled by column-based guards inside each
        // handler (e.g. 'amount' for expenses, 'allocated_budget' for activities).
        // Do NOT gate on p.table — Supabase JS often omits it from the payload,
        // which would silently block ALL realtime events.

        const channel = supabase.channel(`sync-${tripId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
                (p) => { console.log(`[SYNC_TIMING] T2_RT_RECV table=trips t=${Date.now()}`); applyResult(handleTripChange(p, getSnapshot()), 'trips'); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${tripId}` },
                (p) => { console.log(`[SYNC_TIMING] T2_RT_RECV table=activities t=${Date.now()}`); applyResult(handleActivityChange(p, getSnapshot()), 'activities'); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` },
                (p) => { console.log(`[SYNC_TIMING] T2_RT_RECV table=expenses t=${Date.now()}`); applyResult(handleExpenseChange(p, getSnapshot()), 'expenses'); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'wallets', filter: `trip_id=eq.${tripId}` },
                (p) => { console.log(`[SYNC_TIMING] T2_RT_RECV table=wallets t=${Date.now()}`); applyResult(handleWalletChange(p, getSnapshot()), 'wallets'); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'funding_lots', filter: `trip_id=eq.${tripId}` },
                (p) => { console.log(`[SYNC_TIMING] T2_RT_RECV table=funding_lots t=${Date.now()}`); applyResult(handleFundingLotChange(p, getSnapshot()), 'funding_lots'); })
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
                console.log(`[Realtime] sync-${tripId}: ${status}${err ? ` error=${JSON.stringify(err)}` : ''}`);
                if (status === 'CHANNEL_ERROR') {
                    console.error(`[Realtime] ⚠ CHANNEL_ERROR for ${tripId} — may trigger auth logout. Error:`, err);
                }
                if (status === 'TIMED_OUT') {
                    console.error(`[Realtime] ⚠ TIMED_OUT for ${tripId}`);
                }
                if (status === 'SUBSCRIBED') {
                    // Small delay avoids race with subscription setup
                    setTimeout(() => runSync().catch(err =>
                        console.error(`[Realtime] Reconnect sync failed for ${tripId}:`, err)
                    ), 100);
                }
            });

        channels.current[tripId] = channel;
        return () => {
            supabase.removeChannel(channel);
            delete channels.current[tripId];
        };
    }, []);

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
            if (!channels.current[id]) subscribeToTrip(id);
        }

        // Unsubscribe from trips that were removed
        for (const id of Object.keys(channels.current)) {
            if (!idSet.has(id)) {
                supabase.removeChannel(channels.current[id]);
                delete channels.current[id];
            }
        }
    }, [tripIdKey, subscribeToTrip]);

    // Cleanup all channels on unmount
    useMountEffect(() => () => {
        for (const id of Object.keys(channels.current)) {
            supabase.removeChannel(channels.current[id]);
        }
        channels.current = {};
    });

    return { subscribeToTrip, sendDeleteRequest, sendDeleteRequestCancelled };
};
