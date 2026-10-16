import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeletion, isHardDeleted, isSoftDeleted } from '../src/sync/guards/deletion.guard';
import { shouldApplyMerge, shouldApplyStrict } from '../src/sync/guards/version.guard';

test('deletion guard treats both soft and hard delete payloads as removals', () => {
    assert.equal(isSoftDeleted({ deleted_at: '2026-04-03T00:00:00.000Z' }), true);
    assert.equal(isHardDeleted('DELETE'), true);
    assert.equal(isDeletion('UPDATE', { deleted_at: '2026-04-03T00:00:00.000Z' }), true);
    assert.equal(isDeletion('DELETE', { deleted_at: null }), true);
    assert.equal(isDeletion('UPDATE', { deleted_at: null }), false);
});

test('version guards accept newer records and same-version edits from other authors', () => {
    assert.equal(shouldApplyMerge({ version: 2, updatedBy: 'a' }, { version: 3, updatedBy: 'a' }), true);
    assert.equal(shouldApplyMerge({ version: 2, updatedBy: 'a' }, { version: 2, updatedBy: 'b' }), true);
    assert.equal(shouldApplyMerge({ version: 2, updatedBy: 'a' }, { version: 2, updatedBy: 'a' }), false);

    assert.equal(shouldApplyStrict({ version: 2, updatedBy: 'a' }, { version: 3, updatedBy: 'a' }), true);
    assert.equal(shouldApplyStrict({ version: 2, updatedBy: 'a' }, { version: 2, updatedBy: 'b' }), true);
    assert.equal(shouldApplyStrict({ version: 3, updatedBy: 'a' }, { version: 2, updatedBy: 'b' }), false);
});
