import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isImmutableRecord,
    mergeAppendOnly,
    mergeTrip,
    mergeWallets,
    resolveByVersion,
    shouldApplyRemote,
} from '../src/sync/conflictResolver';

test('resolveByVersion prefers newer versions and then newer timestamps on ties', () => {
    assert.deepEqual(
        resolveByVersion(
            { id: 'a', version: 1, updatedAt: 1000 },
            { id: 'a', version: 2, updatedAt: 500 }
        ),
        {
            merged: { id: 'a', version: 2, updatedAt: 500 },
            action: 'keep_remote',
        }
    );

    assert.deepEqual(
        resolveByVersion(
            { id: 'a', version: 2, updatedAt: 1000 },
            { id: 'a', version: 2, updatedAt: 900 }
        ).action,
        'keep_local'
    );

    assert.equal(
        resolveByVersion(
            { id: 'a', version: 2, updatedAt: 1000 },
            { id: 'a', version: 2, updatedAt: 1200 }
        ).action,
        'keep_remote'
    );
});

test('append-only merge updates newer records, adds unseen records, and drops soft-deleted ones', () => {
    const result = mergeAppendOnly(
        [
            { id: 'keep', version: 1 },
            { id: 'delete', version: 1 },
        ],
        [
            { id: 'keep', version: 2 },
            { id: 'new', version: 1 },
            { id: 'delete', version: 2, deletedAt: '2026-04-03T00:00:00Z' },
        ]
    );

    assert.deepEqual(result.newFromRemote.map(item => item.id), ['new']);
    assert.deepEqual(result.updatedFromRemote.map(item => item.id), ['keep']);
    assert.deepEqual(result.merged.map(item => item.id).sort(), ['keep', 'new']);
});

test('wallet merge keeps local shell state but merges and reorders lots by createdAt', () => {
    const result = mergeWallets(
        {
            id: 'wallet-1',
            name: 'local-shell',
            lots: [{ id: 'lot-2', createdAt: 20, remainingAmount: 2, version: 1 }],
        },
        {
            id: 'wallet-1',
            name: 'remote-shell',
            lots: [
                { id: 'lot-1', createdAt: 10, remainingAmount: 1, version: 1 },
                { id: 'lot-2', createdAt: 20, remainingAmount: 5, version: 2 },
            ],
        }
    );

    assert.equal(result.action, 'merged');
    assert.equal(result.merged.name, 'local-shell');
    assert.deepEqual(
        result.merged.lots.map((lot: any) => ({ id: lot.id, remainingAmount: lot.remainingAmount, isDefault: lot.isDefault })),
        [
            { id: 'lot-1', remainingAmount: 1, isDefault: false },
            { id: 'lot-2', remainingAmount: 5, isDefault: true },
        ]
    );
});

test('trip merge keeps remote members, respects soft delete, and merges wallets', () => {
    const activeTrip = mergeTrip(
        {
            id: 'trip-1',
            title: 'Local',
            version: 1,
            wallets: [{ id: 'wallet-1', lots: [{ id: 'lot-2', createdAt: 20, version: 1 }] }],
            members: [{ id: 'local-member' }],
        },
        {
            id: 'trip-1',
            title: 'Remote',
            version: 2,
            wallets: [{ id: 'wallet-1', lots: [{ id: 'lot-1', createdAt: 10, version: 1 }] }],
            members: [{ id: 'remote-member' }],
        }
    );

    assert.equal(activeTrip.action, 'merged');
    assert.equal(activeTrip.merged.title, 'Remote');
    assert.deepEqual(activeTrip.merged.members, [{ id: 'remote-member' }]);
    assert.deepEqual(activeTrip.merged.wallets[0]?.lots.map((lot: any) => lot.id), ['lot-1', 'lot-2']);

    const deletedTrip = mergeTrip(
        { id: 'trip-1', version: 1 },
        { id: 'trip-1', version: 2, deletedAt: '2026-04-03T00:00:00Z' }
    );

    assert.equal(deletedTrip.action, 'keep_remote');
    assert.equal(deletedTrip.merged.deletedAt, '2026-04-03T00:00:00Z');
    assert.equal(shouldApplyRemote(undefined, { version: 1 }), true);
    assert.equal(isImmutableRecord('funding_lots'), true);
    assert.equal(isImmutableRecord('activities'), false);
});
