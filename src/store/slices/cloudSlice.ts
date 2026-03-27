/**
 * CLOUD SLICE — No-op stub.
 *
 * The duplicate postgres_changes subscription that used to live here caused
 * race conditions with useRealtimeSync (both channels independently mutated
 * the same Zustand state, leading to stale expenses persisting in activities
 * and FIFO deductions being skipped or doubled).
 *
 * All real-time sync is now handled exclusively by useRealtimeSync.
 * This slice is kept only to satisfy the store's type union.
 */
import { StateCreator } from 'zustand';
import type { AppState } from '../useStore';

export interface CloudSlice {
    subscribeToTrip: (tripId: string) => () => void;
}

export const createCloudSlice: StateCreator<AppState, [], [], CloudSlice> = () => ({
    subscribeToTrip: (_tripId: string) => {
        // No-op — all realtime sync handled by useRealtimeSync
        return () => {};
    },
});
