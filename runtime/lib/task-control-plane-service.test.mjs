import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore } from './task-store.mjs';
import { createTaskControlPlaneService } from './task-control-plane-service.mjs';

function createTask(taskId = 'task_track_b_001') {
  const now = '2026-03-14T00:00:00.000Z';
  return {
    schema_version: '1.0.0',
    task_id: taskId,
    task_type: 'review_repository',
    goal: 'Review repository changes',
    current_route: 'pasted_diff',
    state: 'pending',
    progress: { completed_steps: 0, total_steps: 3 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [{ route: 'pasted_diff', selected_at: now }],
    next_action: 'Start review',
    updated_at: now,
    version: 1,
  };
}

test('task-control-plane service delegates readiness through task store', () => {
  const service = createTaskControlPlaneService({ taskStore: new TaskStore() });
  const created = service.createTask(createTask());
  assert.equal(created.task_id, 'task_track_b_001');

  const readiness = service.getReadiness(created.task_id);
  assert.equal(readiness.task_id, created.task_id);
  assert.equal(readiness.current_route, 'pasted_diff');
});

test('task-control-plane service fails fast when injected taskStore is incomplete', () => {
  assert.throws(
    () => createTaskControlPlaneService({ taskStore: { create: () => ({}) } }),
    /taskStore must implement method 'load'/
  );
});
