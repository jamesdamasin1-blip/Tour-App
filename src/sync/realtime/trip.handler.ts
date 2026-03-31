/**
 * TRIP REALTIME HANDLER
 * Pure function: postgres_changes payload + state snapshot → HandlerResult
 *
 * Responsibilities:
 *  - Soft-delete eviction (trip + cascade activities + expenses)
 *  - Self-removal detection (current user kicked from trip)
 *  - CRDT-lite merge via mergeEntity
 *  - Spontaneous events deduplication
 *
 * [SYNC][MERGE] prefixed logs for traceability across devices.
 */
import { isSelfEmitted } from '../guards/device.guard';
import { isSoftDeleted } from '../guards/deletion.guard';
import { mapTripFromDb } from '../../mappers/trip.mapper';
import { mergeEntity } from '../syncHelpers';
import type { StateSnapshot, HandlerResult } from './types';

const MERGE_FIELDS = [
    'title', 'destination', 'startDate', 'endDate', 'homeCountry', 'homeCurrency',
    'wallets', 'tripCurrency', 'totalBudgetTrip', 'totalBudget', 'currency',
    'countries', 'members', 'isCompleted', 'isCloudSynced', 'totalBudgetHomeCached',
    'spontaneousEvents', 'removedMemberUserIds',
] as const;

export function handleTripChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) return { patch: null };

    const row = payload.new ?? payload.old;
    if (!row?.id) return { patch: null };

    // Guard: reject cross-dispatched events from other tables on the same channel.
    // Trip rows have 'home_currency'; activity/expense/wallet/lot rows do not.
    if (!('home_currency' in row)) return { patch: null };

    const incoming = mapTripFromDb(row);

    // ── Soft delete: evict trip and all its child records ──────────
    if (isSoftDeleted(row)) {
        console.log(`[SYNC] Trip ${incoming.id} soft-deleted — evicting`);
        return {
            patch: {
                trips: state.trips.filter(t => t.id !== incoming.id),
                activities: state.activities.filter(a => a.tripId !== incoming.id),
                expenses: state.expenses.filter(e => e.tripId !== incoming.id),
            },
        };
    }

    // ── Self-removal: current user was removed from this trip ──────
    const members: any[] = (incoming as any).members ?? [];
    const removedIds: string[] = (incoming as any).removedMemberUserIds ?? [];
    const isSelfRemoved =
        state.currentUserId &&
        (removedIds.includes(state.currentUserId) ||
            members.some((m: any) => m.userId === state.currentUserId && m.removed === true));

    if (isSelfRemoved) {
        console.log(`[SYNC] Current user removed from trip ${incoming.id} — evicting`);
        return {
            patch: {
                trips: state.trips.filter(t => t.id !== incoming.id),
                activities: state.activities.filter(a => a.tripId !== incoming.id),
                expenses: state.expenses.filter(e => e.tripId !== incoming.id),
            },
        };
    }

    const local = state.trips.find(t => t.id === incoming.id);

    // ── Unknown trip: trigger full pull sync to hydrate safely ─────
    if (!local) {
        console.log(`[SYNC] Trip ${incoming.id} not found locally — requesting full sync`);
        return { patch: null, triggerSync: true };
    }

    // ── CRDT-lite merge ────────────────────────────────────────────
    const merged = mergeEntity(local, incoming, MERGE_FIELDS as any);
    merged.isCloudSynced = true;

    // Filter removed members from the visible list
    if (merged.members) {
        merged.members = merged.members.filter((m: any) => !m.removed);
    }

    // Deduplicate spontaneousEvents to prevent double-sums from sync collisions
    if (incoming.spontaneousEvents) {
        const combined = [
            ...(local.spontaneousEvents ?? []),
            ...(incoming.spontaneousEvents ?? []),
        ];
        const seen = new Set<string>();
        merged.spontaneousEvents = combined.filter(e => {
            if (!e.id) return true;
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
        });
    }

    console.log(`[MERGE] Trip ${incoming.id} merged to v${incoming.version ?? 0}`);
    return {
        patch: {
            trips: state.trips.map(t => (t.id === incoming.id ? merged : t)),
        },
    };
}
