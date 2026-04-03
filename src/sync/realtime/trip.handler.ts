import { isSelfEmitted } from '../guards/device.guard';
import { isSoftDeleted } from '../guards/deletion.guard';
import { mapTripFromDb } from '../../mappers/trip.mapper';
import type { StateSnapshot, HandlerResult } from './types';
import { syncTrace, summarizeRealtimePayload } from '../debug';

const getWalletVersion = (wallet: any): number => {
    const version = Number(wallet?.version ?? 0);
    return Number.isFinite(version) ? version : 0;
};

const getWalletTimestamp = (wallet: any): number => {
    const timestamp = Number(
        wallet?.lastModified ??
        wallet?.updated_at ??
        wallet?.updatedAt ??
        0
    );
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const mergeTripRealtimeWallets = (incomingWallets: any[], existingWallets: any[]) => {
    const existingMap = new Map(existingWallets.map(wallet => [wallet.id, wallet]));

    return incomingWallets.map(incomingWallet => {
        const existingWallet = existingMap.get(incomingWallet.id);
        if (!existingWallet) return incomingWallet;

        const incomingVersion = getWalletVersion(incomingWallet);
        const existingVersion = getWalletVersion(existingWallet);
        const incomingTimestamp = getWalletTimestamp(incomingWallet);
        const existingTimestamp = getWalletTimestamp(existingWallet);
        const preferExisting = existingVersion > incomingVersion
            || (existingVersion === incomingVersion && existingTimestamp > incomingTimestamp);

        const preferred = preferExisting ? existingWallet : incomingWallet;
        const fallback = preferExisting ? incomingWallet : existingWallet;

        return {
            ...fallback,
            ...preferred,
            country: incomingWallet?.country ?? existingWallet?.country ?? '',
            createdAt: incomingWallet?.createdAt ?? existingWallet?.createdAt ?? Date.now(),
            lots: preferred?.lots ?? fallback?.lots ?? [],
            version: Math.max(incomingVersion, existingVersion, 1),
            lastModified: Math.max(incomingTimestamp, existingTimestamp, 0) || Date.now(),
        };
    });
};

export function handleTripChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) {
        syncTrace('TripRT', 'skip_self_emitted', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const row = payload.new ?? payload.old;
    if (!row?.id) {
        syncTrace('TripRT', 'skip_missing_id', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const incoming = mapTripFromDb(row);

    if (isSoftDeleted(row)) {
        syncTrace('TripRT', 'evict_soft_deleted', summarizeRealtimePayload(payload));
        return {
            patch: {
                trips: state.trips.filter(t => t.id !== incoming.id),
                activities: state.activities.filter(a => a.tripId !== incoming.id),
                expenses: state.expenses.filter(e => e.tripId !== incoming.id),
            },
        };
    }

    const members: any[] = (incoming as any).members ?? [];
    const removedIds: string[] = (incoming as any).removedMemberUserIds ?? [];
    const isSelfRemoved =
        state.currentUserId &&
        (removedIds.includes(state.currentUserId) ||
            members.some((m: any) => m.userId === state.currentUserId && m.removed === true));

    if (isSelfRemoved) {
        syncTrace('TripRT', 'evict_self_removed', {
            payload: summarizeRealtimePayload(payload),
            currentUserId: state.currentUserId,
        });
        return {
            patch: {
                trips: state.trips.filter(t => t.id !== incoming.id),
                activities: state.activities.filter(a => a.tripId !== incoming.id),
                expenses: state.expenses.filter(e => e.tripId !== incoming.id),
            },
        };
    }

    const existingTrip = state.trips.find(t => t.id === incoming.id);
    const mergedWallets = 'wallets' in incoming
        ? mergeTripRealtimeWallets(incoming.wallets || [], existingTrip?.wallets || [])
        : existingTrip?.wallets;
    const nextTrip = {
        ...(existingTrip || {}),
        ...incoming,
        wallets: mergedWallets,
        isCloudSynced: true,
    };

    syncTrace('TripRT', 'patch_trip_row', summarizeRealtimePayload(payload));
    return {
        patch: {
            trips: [
                ...state.trips.filter(t => t.id !== incoming.id),
                nextTrip as any,
            ],
        },
    };
}
