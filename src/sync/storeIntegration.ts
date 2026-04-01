/**
 * Local SQLite cache helpers for explicitly device-only state.
 *
 * Shared collaborative mutations are cloud-first and should not write through
 * this module. Keep usage narrow so the architecture stays unambiguous.
 */
import { upsertRecord } from '../storage/localDB';

export const persistTripHideLocally = (tripId: string, tripData: Record<string, any>) => {
    upsertRecord('trips', tripId, tripData, { isHidden: 1 });
};
