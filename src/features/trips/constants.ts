import type { TripPlan } from '@/src/types/models';

export const TAB_BAR_HEIGHT = 64;

export const ONE_TIME_TEST_TRIP_DELETE_KEY = 'one_time_delete_test_trips_v1';

export const KNOWN_TEST_TRIP_IDS = new Set([
    '46b3374b-eeb2-4c50-91ea-84d3b3ed560a',
    '53c093a6-d5da-4e7a-a33f-1840bc316566',
    'a5980f1d-f982-42d7-bc05-66779f8d59c3',
    '86657383-ff2f-491b-aff4-036c6e8234c8',
    '77598a2c-487b-4019-bb64-8b5690b96300',
    '0403face-acff-4ce3-b5d3-c5a3507c7263',
    '0fa9c8b3-23bb-4f89-8d78-5734390292b3',
    '42ffabd2-606b-4b07-993d-c960c2c18162',
    'b91d05b2-3731-42e0-a758-c6b970ad13ce',
    '851388f0-3141-4ab9-a627-59d0ab94532c',
    '62303208-4629-4438-a7f7-04963e134e26',
]);

export const shouldDeleteTestTrip = (trip: TripPlan): boolean => {
    // Only delete explicit known junk fixtures. Title-based deletion is unsafe
    // because real user trips can legitimately be named "Test".
    return KNOWN_TEST_TRIP_IDS.has(trip.id);
};
