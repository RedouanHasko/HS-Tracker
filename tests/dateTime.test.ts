import assert from 'node:assert/strict';
import test from 'node:test';

import { addDaysToDateKey, appDateKey, appMonthKey } from '../src/utils/dateTime';

test('business date uses Africa/Casablanca rather than the UTC calendar date', () => {
  const nearMidnightUtc = new Date('2026-07-31T23:30:00.000Z');
  assert.equal(appDateKey(nearMidnightUtc), '2026-08-01');
  assert.equal(appMonthKey(nearMidnightUtc), '2026-08');
});

test('date-key arithmetic is stable across month boundaries', () => {
  assert.equal(addDaysToDateKey('2026-07-31', 1), '2026-08-01');
  assert.equal(addDaysToDateKey('2028-02-28', 1), '2028-02-29');
});
