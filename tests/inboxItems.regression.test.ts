import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInboxItems } from '../src/features/inbox/inboxItems';

test('inbox includes only pending invites and sorts all items newest-first', () => {
    const items = buildInboxItems(
        [
            {
                id: 'invite-old',
                tripId: 'trip-1',
                tripTitle: 'Bohol',
                fromUserId: 'user-1',
                fromDisplayName: 'James',
                fromEmail: 'james@example.com',
                toEmail: 'you@example.com',
                role: 'editor',
                status: 'pending',
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-01T00:00:00.000Z',
                expiresAt: '2026-05-01T00:00:00.000Z',
            },
            {
                id: 'invite-accepted',
                tripId: 'trip-2',
                tripTitle: 'Cebu',
                fromUserId: 'user-2',
                fromDisplayName: 'Ava',
                fromEmail: 'ava@example.com',
                toEmail: 'you@example.com',
                role: 'viewer',
                status: 'accepted',
                createdAt: '2026-04-03T00:00:00.000Z',
                updatedAt: '2026-04-03T00:00:00.000Z',
                expiresAt: '2026-05-03T00:00:00.000Z',
            },
        ],
        [
            {
                id: 'delete-new',
                tripId: 'trip-3',
                activityId: 'act-1',
                activityTitle: 'Island hopping',
                requestedByMemberId: 'member-1',
                requestedByName: 'Nina',
                requestedByColor: '#fff',
                requestedAt: Date.parse('2026-04-02T12:00:00.000Z'),
            },
        ]
    );

    assert.deepEqual(
        items.map(item => item.key),
        ['delete_request:delete-new', 'invite:invite-old']
    );
    assert.equal(items[1]?.subtitle, 'Invite from James');
});

test('inbox falls back to friend text when invite sender metadata is missing', () => {
    const [item] = buildInboxItems(
        [
            {
                id: 'invite-anon',
                tripId: 'trip-1',
                tripTitle: 'Siargao',
                fromUserId: 'user-1',
                fromDisplayName: null,
                fromEmail: null,
                toEmail: 'you@example.com',
                role: 'editor',
                status: 'pending',
                createdAt: 'invalid-date',
                updatedAt: '2026-04-03T00:00:00.000Z',
                expiresAt: '2026-05-03T00:00:00.000Z',
            },
        ],
        []
    );

    assert.equal(item?.createdAtMs, 0);
    assert.equal(item?.subtitle, 'Invite from a friend');
});
