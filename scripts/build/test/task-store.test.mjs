import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore, TaskConflictError, TaskNotFoundError } from '../../../runtime/lib/task-store.mjs';

function buildTask(overrides = {}) {
  return {
    schema_version: '1.0.0',
    task_id: 'task_review_repository_001',
    task_type: 'review_repository',
    goal: 'Review repository changes for correctness and risk.',
    current_route: 'github_pr',
    state: 'active',
    progress: { completed_steps: 0, total_steps: 3 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [{ route: 'github_pr', selected_at: '2026-03-12T12:00:00.000Z' }],
    next_action: 'collect_more_context',
    version: 1,
    updated_at: '2026-03-12T12:00:00.000Z',
    ...overrides,
  };
}

test('TaskStore creates and retrieves a task with an initial snapshot', () => {
  const store = new TaskStore();
  const task = buildTask();

  const created = store.create(task);
  assert.equal(created.version, 1);

  const loaded = store.load(task.task_id);
  assert.deepEqual(loaded, created);

  const snapshots = store.listSnapshots(task.task_id);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].snapshot_version, 1);
  assert.equal(snapshots[0].task.version, 1);
});

test('TaskStore updates task with optimistic concurrency and records snapshots', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  const updated = store.update(task.task_id, {
    expectedVersion: 1,
    changes: {
      state: 'blocked',
      next_action: 'await_user_input',
      updated_at: '2026-03-12T12:05:00.000Z',
    },
  });

  assert.equal(updated.version, 2);
  assert.equal(updated.state, 'blocked');

  const snapshots = store.listSnapshots(task.task_id);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].snapshot_version, 2);
  assert.equal(snapshots[1].task.version, 2);

  const firstSnapshot = store.getSnapshot(task.task_id, 1);
  assert.equal(firstSnapshot.task.state, 'active');
});

test('TaskStore rejects stale updates with TaskConflictError', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  assert.throws(
    () => store.update(task.task_id, {
      expectedVersion: 0,
      changes: {
        state: 'blocked',
        updated_at: '2026-03-12T12:05:00.000Z',
      },
    }),
    TaskConflictError
  );
});

test('TaskStore throws TaskNotFoundError for missing tasks/snapshots', () => {
  const store = new TaskStore();

  assert.throws(() => store.load('missing_task_id'), TaskNotFoundError);
  assert.throws(() => store.listSnapshots('missing_task_id'), TaskNotFoundError);
  assert.throws(() => store.getSnapshot('missing_task_id', 1), TaskNotFoundError);
});
