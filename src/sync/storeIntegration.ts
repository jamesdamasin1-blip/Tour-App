/**
 * Local SQLite helpers for explicitly device-only state.
 *
 * Shared collaborative mutations are cloud-first and should not write through
 * this module.
 */
import { upsertRecord } from '../storage/localDB';

export const persistTripHideLocally = (tripId: string, tripData: Record<string, any>) => {
    upsertRecord('trips', tripId, tripData, { isHidden: 1 });
};
