import { StateCreator } from 'zustand';
import { inviteService } from '../../services/inviteService';
import { TripInvite } from '../../types/models';
import { ensureDistinctMemberColors } from '../../utils/memberAttribution';
import { refreshTripCloudState } from '../cloudSyncHelpers';
import type { AppState } from '../useStore';

export interface InviteSlice {
    invites: TripInvite[];
    inviteLoading: boolean;

    /** Send an email invite for a trip */
    sendEmailInvite: (params: {
        tripId: string;
        tripTitle: string;
        toEmail: string;
        fromUserId: string;
        fromDisplayName: string | null;
        fromEmail: string | null;
        role?: 'editor' | 'viewer';
    }) => Promise<TripInvite>;

    /** Load pending invites addressed to the current user */
    loadReceivedInvites: (email: string) => Promise<void>;

    /** Accept an invite and hydrate the trip from the cloud */
    acceptInvite: (inviteId: string) => Promise<string | null>;

    /** Decline an invite */
    declineInvite: (inviteId: string) => Promise<void>;

    /** Add a realtime invite to the list */
    addRealtimeInvite: (invite: TripInvite) => void;
}

export const createInviteSlice: StateCreator<AppState, [], [], InviteSlice> = (set, get) => ({
    invites: [],
    inviteLoading: false,

    sendEmailInvite: async (params) => {
        const invite = await inviteService.sendInvite({
            ...params,
            tripTitle: params.tripTitle,
            role: params.role || 'editor',
        });
        return invite;
    },

    loadReceivedInvites: async (email) => {
        set({ inviteLoading: true });
        try {
            const invites = await inviteService.getReceivedInvites(email);
            set({ invites });
        } finally {
            set({ inviteLoading: false });
        }
    },

    acceptInvite: async (inviteId) => {
        const invite = get().invites.find(i => i.id === inviteId);
        if (!invite) return null;

        const { supabase } = await import('../storeHelpers');
        const { getAuthState } = await import('../../auth/googleAuth');
        const { BUDDY_COLORS } = await import('../../types/models');
        const auth = await getAuthState();

        const memberName = auth.displayName || invite.toEmail.split('@')[0];
        const existingMembers = ensureDistinctMemberColors(get().trips.find(t => t.id === invite.tripId)?.members || []);
        const usedColors = existingMembers.map((m: any) => m.color);
        const memberColor = BUDDY_COLORS.find((c: string) => !usedColors.includes(c)) ||
            BUDDY_COLORS[1] ||
            BUDDY_COLORS[existingMembers.length % BUDDY_COLORS.length];

        // Try the RPC function first (handles RLS, atomically accepts + adds member + returns data)
        const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_trip_invite', {
            p_invite_id: inviteId,
            p_member_name: memberName,
            p_member_color: memberColor,
        });

        if (rpcError) {
            // Surface the actual RPC error — the fallback direct query can't work
            // because RLS blocks the invitee from reading a trip they don't own yet.
            // Common causes: RPC function not deployed, or email mismatch.
            console.error('[InviteSlice] accept_trip_invite RPC error:', rpcError.message, rpcError);
            throw new Error(
                rpcError.message === 'Could not find the function public.accept_trip_invite(p_invite_id, p_member_name, p_member_color) in the schema cache'
                    ? 'The server is not set up to accept invites yet. Please ask the trip owner to deploy the latest database migration.'
                    : rpcError.message || 'Failed to accept invite. Please try again.'
            );
        }

        if (rpcResult?.invite_accepted && !rpcResult?.trip) {
            set(state => ({
                invites: state.invites.map(i =>
                    i.id === inviteId ? { ...i, status: 'accepted' as const } : i
                ),
            }));
            throw new Error('The trip has been deleted by its owner.');
        }

        const acceptedTripId = rpcResult?.trip?.id || invite.tripId;
        if (!acceptedTripId) {
            throw new Error('Unexpected response from server. Please try again.');
        }

        await refreshTripCloudState(acceptedTripId);
        set(state => ({
            invites: state.invites.map(i =>
                i.id === inviteId ? { ...i, status: 'accepted' as const } : i
            ),
        }));

        return acceptedTripId;
    },

    declineInvite: async (inviteId) => {
        await inviteService.declineInvite(inviteId);
        set(state => ({
            invites: state.invites.map(i =>
                i.id === inviteId ? { ...i, status: 'declined' as const } : i
            ),
        }));
    },

    addRealtimeInvite: (invite) => {
        set(state => {
            if (state.invites.some(i => i.id === invite.id)) return state;
            return { invites: [invite, ...state.invites] };
        });
    },
});
