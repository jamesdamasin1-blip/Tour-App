import { useMemo } from 'react';
import { useStore } from '@/src/store/useStore';
import { useAuth } from './useAuth';

export function usePermissions(tripId: string) {
    const trips = useStore(state => state.trips);
    const { userId } = useAuth();

    return useMemo(() => {
        const trip = trips.find(t => t.id === tripId);
        const members = trip?.members || [];

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
        const currentMember = userId
            ? members.find(m => m.userId === userId) || members.find(m => m.isCreator) || null
            : members.find(m => m.isCreator) || null;

        const isCreator = currentMember?.isCreator === true;

        // Trip-level role (set at invite acceptance) acts as a ceiling
        const tripLevelViewer = trip?.role === 'viewer';
        // Member-level role (set by creator) for granular control
        const memberLevelViewer = currentMember?.role === 'viewer';

        const canEdit = !tripLevelViewer && !memberLevelViewer && !trip?.isCompleted;
        const canManageMembers = isCreator;

        return { currentMember, isCreator, canEdit, canManageMembers };
    }, [trips, tripId, userId]);
}
