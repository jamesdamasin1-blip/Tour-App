import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatTripDate,
    getTripDurationDays,
    resolveTripDateKey,
    toTripDateKey,
} from '../src/utils/tripDates';

test('invalid trip date keys do not roll over into real calendar dates', () => {
    assert.equal(resolveTripDateKey('2026-02-31'), null);
    assert.equal(toTripDateKey('2026-02-31'), null);
    assert.equal(
        formatTripDate({
            dateKey: '2026-02-31',
            options: { month: 'short', day: 'numeric', year: 'numeric' },
        }),
        ''
    );
    assert.equal(getTripDurationDays('2026-02-31', '2026-03-01'), 0);
});
