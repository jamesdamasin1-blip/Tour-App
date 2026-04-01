import { useEffect } from 'react';
import { getSyncMeta, setSyncMeta } from '@/src/storage/localDB';
import { syncTrace } from '@/src/sync/debug';
import type { TripPlan } from '@/src/types/models';
import {
    ONE_TIME_TEST_TRIP_DELETE_KEY,
    shouldDeleteTestTrip,
} from '@/src/features/trips/constants';

type Params = {
    trips: TripPlan[];
    deleteTrip: (tripId: string) => Promise<unknown> | unknown;
    setTripsSidebarOpen: (open: boolean) => void;
};

export const useOneTimeTestTripCleanup = ({
    trips,
    deleteTrip,
    setTripsSidebarOpen,
}: Params): void => {
    useEffect(() => {
        let isCancelled = false;

        const deleteKnownTestTrips = async () => {
            if (getSyncMeta(ONE_TIME_TEST_TRIP_DELETE_KEY) === '1') return;
            if (trips.length === 0) return;

            syncTrace('TripsList', 'one_time_delete_scan', {
                tripCount: trips.length,
                trips: trips.map(trip => ({ id: trip.id, title: trip.title })),
            });

            const tripsToDelete = trips.filter(shouldDeleteTestTrip);
            if (tripsToDelete.length === 0) {
                syncTrace('TripsList', 'one_time_delete_no_match', {
                    tripCount: trips.length,
                });
                return;
            }

            syncTrace('TripsList', 'one_time_delete_matches', {
                tripIds: tripsToDelete.map(trip => trip.id),
                titles: tripsToDelete.map(trip => trip.title),
            });

            const results = await Promise.allSettled(
                tripsToDelete.map(trip => deleteTrip(trip.id))
            );
            if (isCancelled) return;

            const failedTripIds = results
                .map((result, index) => ({ result, tripId: tripsToDelete[index].id }))
                .filter(entry => entry.result.status === 'rejected')
                .map(entry => entry.tripId);

            if (failedTripIds.length > 0) {
                syncTrace('TripsList', 'one_time_delete_failed', {
                    failedTripIds,
                });
                return;
            }

            setSyncMeta(ONE_TIME_TEST_TRIP_DELETE_KEY, '1');
            syncTrace('TripsList', 'one_time_delete_done', {
                deletedTripIds: tripsToDelete.map(trip => trip.id),
            });
        };

        void deleteKnownTestTrips();
        return () => {
            isCancelled = true;
            setTripsSidebarOpen(false);
        };
    }, [deleteTrip, setTripsSidebarOpen, trips]);
};
