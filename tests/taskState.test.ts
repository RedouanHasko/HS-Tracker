import test from 'node:test';
import assert from 'node:assert/strict';
import { Task } from '../src/types';
import {
  completionBlocker,
  isTaskBlocked,
  isTaskOverdue,
  syncTaskOwner,
  taskOwnerEmail,
  unmetDependencyIds,
  withTaskOwner,
} from '../src/utils/taskState';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Task',
    description: '',
    assignedTo: 'a@example.com',
    priority: 'medium',
    deadline: '2026-01-10',
    status: 'pending',
    subtasks: [],
    ...overrides,
  };
}

test('a legacy task with only assignedTo reads back the same owner', () => {
  assert.equal(taskOwnerEmail(task({ assignedTo: 'b@example.com', workedBy: undefined })), 'b@example.com');
});

test('workedBy wins when both fields exist so the newest write is authoritative', () => {
  const t = task({ assignedTo: 'old@example.com', workedBy: 'new@example.com' });
  assert.equal(taskOwnerEmail(t), 'new@example.com');
  // Saving reconciles the legacy field so cards and reminders stop disagreeing.
  assert.equal(syncTaskOwner(t).assignedTo, 'new@example.com');
});

test('assigning writes both owner fields in one step', () => {
  const updated = withTaskOwner(task({ assignedTo: 'old@example.com' }), 'new@example.com');
  assert.equal(updated.workedBy, 'new@example.com');
  assert.equal(updated.assignedTo, 'new@example.com');
});

test('clearing the worker keeps the original assignee instead of writing an empty string', () => {
  const updated = withTaskOwner(task({ assignedTo: 'old@example.com' }), '');
  assert.equal(updated.assignedTo, 'old@example.com');
});

test('a completed task is never reported as overdue', () => {
  assert.equal(isTaskOverdue(task({ deadline: '2026-01-01' }), '2026-02-01'), true);
  assert.equal(isTaskOverdue(task({ deadline: '2026-01-01', status: 'completed' }), '2026-02-01'), false);
  assert.equal(isTaskOverdue(task({ deadline: '2026-03-01' }), '2026-02-01'), false);
});

test('baseline deadline drives overdue state when the planned date moved', () => {
  const t = task({ deadline: '2026-01-01', baselineDeadline: '2026-05-01' });
  assert.equal(isTaskOverdue(t, '2026-02-01'), false);
});

test('a blank blocker reason does not mark a task blocked', () => {
  assert.equal(isTaskBlocked(task({ blockedReason: '   ' })), false);
  assert.equal(isTaskBlocked(task({ blockedReason: 'Waiting on glass' })), true);
});

test('unmet dependencies list only dependencies that are not complete', () => {
  const tasks = [task({ id: 'dep1', status: 'completed' }), task({ id: 'dep2', status: 'in_progress' })];
  const dependent = task({ id: 't2', dependencyIds: ['dep1', 'dep2'] });
  assert.deepEqual(unmetDependencyIds(dependent, tasks), ['dep2']);
});

test('an unmet dependency blocks completion and names the task', () => {
  const tasks = [task({ id: 't2', title: 'Glazing', dependencyIds: ['dep2'], status: 'in_progress' }), task({ id: 'dep2', title: 'Frame' })];
  const reason = completionBlocker(tasks[0], tasks, 'en');
  assert.ok(reason);
  assert.match(reason, /Frame/);
});

test('open subtasks block completion and report how many remain', () => {
  const t = task({
    subtasks: [
      { id: 's1', title: 'Sand', isCompleted: true },
      { id: 's2', title: 'Prime', isCompleted: false },
    ],
  });
  assert.match(completionBlocker(t, [t], 'en') || '', /1 subtask/);
});

test('a clear task can always be completed', () => {
  assert.equal(completionBlocker(task(), [task()], 'en'), null);
});

test('completion blockers are translated for French and Arabic', () => {
  const tasks = [task({ id: 't2', title: 'Glazing', dependencyIds: ['dep2'] }), task({ id: 'dep2', title: 'Frame' })];
  assert.ok(completionBlocker(tasks[0], tasks, 'fr'));
  assert.ok(completionBlocker(tasks[0], tasks, 'ar'));
});