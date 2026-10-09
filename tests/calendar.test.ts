import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthGrid,
  groupRentalDays,
  groupTasksByDate,
  monthKeyOf,
  nextDateKey,
  shiftMonthKey,
  weekdayLabels,
} from '../src/utils/calendar';

test('month grid is always 42 Monday-first cells with stable leading days', () => {
  // October 2026: the 1st is a Thursday → 3 leading days (Mon 28 – Wed 30 Sep).
  const grid = buildMonthGrid('2026-10', '2026-10-07');
  assert.equal(grid.length, 42);
  assert.equal(grid[0].dateKey, '2026-09-28');
  assert.equal(grid[3].dateKey, '2026-10-01');
  assert.equal(grid[3].inMonth, true);
  assert.equal(grid[0].inMonth, false);
  const today = grid.find((day) => day.dateKey === '2026-10-07');
  assert.equal(today?.isToday, true);
  assert.equal(today?.dayNumber, 7);
});

test('month shifting crosses year boundaries', () => {
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(shiftMonthKey('2026-10', 0), '2026-10');
});

test('monthKeyOf derives the visible month from any day', () => {
  assert.equal(monthKeyOf('2026-10-07'), '2026-10');
});

test('weekday headers cover Monday-first order in every language', () => {
  assert.deepEqual(weekdayLabels('en'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(weekdayLabels('fr')[0], 'Lun');
  assert.equal(weekdayLabels('ar').length, 7);
});

function baseTask(overrides = {}) {
  return {
    id: 't1',
    title: 'Task',
    description: '',
    assignedTo: 'a@example.com',
    priority: 'medium' as const,
    deadline: '2026-10-10',
    status: 'pending' as const,
    subtasks: [],
    ...overrides,
  };
}

test('task grouping skips completed and dateless tasks, flags overdue', () => {
  const grouped = groupTasksByDate(
    [
      { task: baseTask(), projectId: 'p1', projectName: 'Site A' },
      { task: baseTask({ id: 't2', status: 'completed' }), projectId: 'p1', projectName: 'Site A' },
      { task: baseTask({ id: 't3', deadline: '', baselineDeadline: '' }), projectId: 'p1', projectName: 'Site A' },
      { task: baseTask({ id: 't4', deadline: '2026-10-01' }), projectId: 'p2', projectName: 'Site B' },
    ],
    '2026-10-07'
  );
  assert.equal(grouped.size, 2);
  assert.equal(grouped.get('2026-10-10')?.length, 1);
  assert.equal(grouped.get('2026-10-10')?.[0].overdue, false);
  assert.equal(grouped.get('2026-10-01')?.[0].overdue, true);
  assert.equal(grouped.get('2026-10-01')?.[0].projectName, 'Site B');
});

test('baseline deadline wins over the current deadline for placement', () => {
  const grouped = groupTasksByDate(
    [{ task: baseTask({ deadline: '2026-10-20', baselineDeadline: '2026-10-12' }), projectId: 'p1', projectName: 'Site A' }],
    '2026-10-07'
  );
  assert.ok(grouped.has('2026-10-12'));
  assert.ok(!grouped.has('2026-10-20'));
});

test('nextDateKey rolls over months and years without DST drift', () => {
  assert.equal(nextDateKey('2026-01-31'), '2026-02-01');
  assert.equal(nextDateKey('2026-12-31'), '2027-01-01');
  assert.equal(nextDateKey('2026-10-07'), '2026-10-08');
});

function baseBooking(overrides = {}) {
  return {
    id: 'b1',
    clientName: 'Guest',
    clientPhone: '',
    numberOfGuests: 2,
    checkIn: '2026-10-10',
    checkOut: '2026-10-13',
    totalNights: 3,
    totalAmount: 900,
    commission: 90,
    ownerPayout: 810,
    status: 'upcoming' as const,
    paidAmount: 0,
    balanceDue: 900,
    ...overrides,
  };
}

test('rental days carry arrivals, departures, and cleaning due', () => {
  const grouped = groupRentalDays(
    [{ booking: baseBooking(), projectId: 'p1', projectName: 'Apt 12' }],
    []
  );
  assert.deepEqual(grouped.get('2026-10-10')?.arrivals.map((r) => r.guestName), ['Guest']);
  assert.deepEqual(grouped.get('2026-10-13')?.departures.map((r) => r.guestName), ['Guest']);
  assert.equal(grouped.get('2026-10-13')?.cleanings.length, 1);
  // No stay nights in between — only movement days appear.
  assert.equal(grouped.has('2026-10-11'), false);
});

test('finished cleaning removes the cleaning flag but keeps the departure', () => {
  const grouped = groupRentalDays(
    [{
      booking: baseBooking({ operations: { cleaningStatus: 'completed' as const } }),
      projectId: 'p1',
      projectName: 'Apt 12',
    }],
    []
  );
  assert.equal(grouped.get('2026-10-13')?.departures.length, 1);
  assert.equal(grouped.get('2026-10-13')?.cleanings.length, 0);
});

test('cancelled bookings never reach the calendar', () => {
  const grouped = groupRentalDays(
    [{ booking: baseBooking({ status: 'cancelled' as const }), projectId: 'p1', projectName: 'Apt 12' }],
    []
  );
  assert.equal(grouped.size, 0);
});

test('active blocks span every day of their period', () => {
  const grouped = groupRentalDays(
    [],
    [{
      block: { id: 'bl1', title: 'Plumbing', type: 'maintenance' as const, startDate: '2026-10-10', endDate: '2026-10-12', status: 'active' as const },
      projectId: 'p1',
      projectName: 'Apt 12',
    }]
  );
  assert.equal(grouped.get('2026-10-10')?.blocks.length, 1);
  assert.equal(grouped.get('2026-10-11')?.blocks.length, 1);
  // End date is exclusive (checkout semantics).
  assert.equal(grouped.has('2026-10-12'), false);
});
