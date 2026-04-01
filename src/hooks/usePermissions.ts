import { useMemo } from 'react';
import { useStore } from '@/src/store/useStore';
import { useAuth } from './useAuth';
import { findCurrentTripMember, getDisplayTripMembers } from '@/src/utils/memberAttribution';

export function usePermissions(tripId: string) {
    const trips = useStore(state => state.trips);
    const { userId, email } = useAuth();

    return useMemo(() => {
        const trip = trips.find(t => t.id === tripId);
        const members = getDisplayTripMembers(trip);

        // Solo trip (no members ever added) — current user is always the creator
        if (members.length === 0) {
            return {
                currentMember: null,
                isCreator: true,
                canEdit: !trip?.isCompleted,
                canManageMembers: false,
            };
        }

        // Find current user's member record
        const currentMember = findCurrentTripMember(trip, { userId, email });

        // isCreator via member record, OR fallback: if no member record found but the trip was
        // created locally (role is undefined — imported trips always have role='admin'/'viewer'),
        // the current user is the owner whose creator record was never added to the server members array.
        const isCreator = currentMember?.isCreator === true ||
            (!currentMember && trip?.role === undefined);

        // Trip-level role (set at invite acceptance) acts as a ceiling
        const tripLevelViewer = trip?.role === 'viewer';
        // Member-level role (set by creator) for granular control
        const memberLevelViewer = currentMember?.role === 'viewer';

        const canEdit = !tripLevelViewer && !memberLevelViewer && !trip?.isCompleted;
        const canManageMembers = isCreator;

        return { currentMember, isCreator, canEdit, canManageMembers };
    }, [email, trips, tripId, userId]);
}
