import test from 'node:test';
import assert from 'node:assert/strict';
import { isAlreadyDeletedCloudError } from '../src/store/cloudMutationErrors';

test('delete error helper matches activity rows already removed on the server', () => {
    assert.equal(
        isAlreadyDeletedCloudError({ message: 'Activity not found' }, 'activity'),
        true
    );
});

test('delete error helper matches expense rows already removed on the server', () => {
    assert.equal(
        isAlreadyDeletedCloudError({ message: 'Expense not found' }, 'expense'),
        true
    );
});

test('delete error helper ignores unrelated cloud errors', () => {
    assert.equal(
        isAlreadyDeletedCloudError({ message: 'Not allowed to edit this trip' }, 'activity'),
        false
    );
});
