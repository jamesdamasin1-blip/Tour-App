import type { TripInvite } from '@/src/types/models';
import type { DeletionRequest } from '@/src/store/slices/settingsSlice';

export type InboxItem =
    | {
        key: string;
        kind: 'invite';
        tripId: string;
        createdAtMs: number;
        title: string;
        subtitle: string;
        invite: TripInvite;
      }
    | {
        key: string;
        kind: 'delete_request';
        tripId: string;
        createdAtMs: number;
        title: string;
        subtitle: string;
        request: DeletionRequest;
      };

const toTimestamp = (value: string | number | undefined): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (!value) return 0;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : 0;
};

export const buildInboxItems = (
    invites: TripInvite[],
    deletionRequests: DeletionRequest[]
): InboxItem[] => {
    const inviteItems: InboxItem[] = invites
        .filter(invite => invite.status === 'pending')
        .map(invite => ({
            key: `invite:${invite.id}`,
            kind: 'invite',
            tripId: invite.tripId,
            createdAtMs: toTimestamp(invite.createdAt),
            title: invite.tripTitle,
            subtitle: `Invite from ${invite.fromDisplayName || invite.fromEmail || 'a friend'}`,
            invite,
        }));

    const deleteItems: InboxItem[] = deletionRequests.map(request => ({
        key: `delete_request:${request.id}`,
        kind: 'delete_request',
        tripId: request.tripId,
        createdAtMs: request.requestedAt,
        title: request.activityTitle,
        subtitle: `${request.requestedByName} asked to delete this activity`,
        request,
    }));

    return [...inviteItems, ...deleteItems].sort((left, right) => right.createdAtMs - left.createdAtMs);
};
