import { supabase } from '../utils/supabase';
import { TripInvite } from '../types/models';

const mapRow = (row: any): TripInvite => ({
    id: row.id,
    tripId: row.trip_id,
    tripTitle: row.trip_title,
    fromUserId: row.from_user_id,
    fromDisplayName: row.from_display_name,
    fromEmail: row.from_email,
    toEmail: row.to_email,
    role: row.role || 'editor',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
});

export const inviteService = {
    /** Send a trip invite to an email address */
    async sendInvite(params: {
        tripId: string;
        tripTitle: string;
        toEmail: string;
        fromUserId: string;
        fromDisplayName: string | null;
        fromEmail: string | null;
        role?: 'editor' | 'viewer';
    }): Promise<TripInvite> {
        // Check for existing pending invite to same email for same trip
        const { data: existing } = await supabase
            .from('trip_invites')
            .select('id')
            .eq('trip_id', params.tripId)
            .eq('to_email', params.toEmail.toLowerCase().trim())
            .eq('status', 'pending')
            .maybeSingle();

        if (existing) {
            throw new Error('An invite for this trip is already pending for this email.');
        }

        const { data, error } = await supabase
            .from('trip_invites')
            .insert({
                trip_id: params.tripId,
                trip_title: params.tripTitle,
                from_user_id: params.fromUserId,
                from_display_name: params.fromDisplayName,
                from_email: params.fromEmail,
                to_email: params.toEmail.toLowerCase().trim(),
                role: params.role || 'editor',
            })
            .select()
            .single();

        if (error) throw new Error(error.message);
        return mapRow(data);
    },

    /** Fetch invites sent TO the current user's email */
    async getReceivedInvites(email: string): Promise<TripInvite[]> {
        const { data, error } = await supabase
            .from('trip_invites')
            .select('*')
            .eq('to_email', email.toLowerCase().trim())
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return (data || []).map(mapRow);
    },

    /** Fetch invites sent BY the current user */
    async getSentInvites(userId: string): Promise<TripInvite[]> {
        const { data, error } = await supabase
            .from('trip_invites')
            .select('*')
            .eq('from_user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return (data || []).map(mapRow);
    },

    /** Accept an invite */
    async acceptInvite(inviteId: string): Promise<TripInvite> {
        const { data, error } = await supabase
            .from('trip_invites')
            .update({ status: 'accepted' })
            .eq('id', inviteId)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return mapRow(data);
    },

    /** Decline an invite */
    async declineInvite(inviteId: string): Promise<TripInvite> {
        const { data, error } = await supabase
            .from('trip_invites')
            .update({ status: 'declined' })
            .eq('id', inviteId)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return mapRow(data);
    },

    /** Subscribe to realtime invite changes for a given email */
    subscribeToInvites(
        email: string,
        onInvite: (invite: TripInvite) => void
    ): () => void {
        const channel = supabase
            .channel('invite-updates')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'trip_invites',
                    filter: `to_email=eq.${email.toLowerCase().trim()}`,
                },
                (payload: any) => {
                    onInvite(mapRow(payload.new));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },
};
