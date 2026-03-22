// Tests for runtime/lib/task-shared.mjs
// Run with: node --test scripts/build/test/task-shared.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskConflictError, TaskNotFoundError, summariseFindingsProvenance, createReadinessView } from '../../../runtime/lib/task-shared.mjs';

test('TaskConflictError has correct name, code, and details', () => {
  const err = new TaskConflictError('conflict!', { current: 2, expected: 1 });
  assert.equal(err.name, 'TaskConflictError');
  assert.equal(err.code, 'task_version_conflict');
  assert.deepEqual(err.details, { current: 2, expected: 1 });
  assert.equal(err.message, 'conflict!');
});

test('TaskConflictError defaults details to empty object', () => {
  const err = new TaskConflictError('oops');
  assert.deepEqual(err.details, {});
});

test('TaskConflictError is an Error subclass', () => {
  assert.ok(new TaskConflictError('x') instanceof Error);
});

test('TaskNotFoundError has correct name, code, and taskId in details', () => {
  const err = new TaskNotFoundError('abc-123');
  assert.equal(err.name, 'TaskNotFoundError');
  assert.equal(err.code, 'task_not_found');
  assert.deepEqual(err.details, { taskId: 'abc-123' });
  assert.equal(err.message, 'Task not found: abc-123');
});

test('TaskNotFoundError is an Error subclass', () => {
  assert.ok(new TaskNotFoundError('x') instanceof Error);
});

test('summariseFindingsProvenance counts status occurrences', () => {
  const findings = [
    { provenance: { status: 'verified' } },
    { provenance: { status: 'verified' } },
    { provenance: { status: 'hypothesis' } },
  ];
  assert.deepEqual(summariseFindingsProvenance(findings), { verified: 2, hypothesis: 1 });
});

test('summariseFindingsProvenance treats missing provenance.status as unknown', () => {
  const findings = [{ provenance: {} }, { something: 'else' }];
  assert.deepEqual(summariseFindingsProvenance(findings), { unknown: 2 });
});

test('summariseFindingsProvenance returns empty object for no findings', () => {
  assert.deepEqual(summariseFindingsProvenance([]), {});
  assert.deepEqual(summariseFindingsProvenance(), {});
});

test('createReadinessView produces correct shape', () => {
  const task = {
    task_id: 't1',
    task_type: 'review_repository',
    current_route: 'github_pr',
    state: 'active',
    next_action: 'review',
    route_history: ['github_pr'],
    progress: { total_steps: 4, completed_steps: 1 },
    findings: [],
  };
  const view = createReadinessView(task, [{ type: 'x' }]);
  assert.equal(view.task_id, 't1');
  assert.equal(view.task_type, 'review_repository');
  assert.equal(view.current_route, 'github_pr');
  assert.equal(view.state, 'active');
  assert.equal(view.next_action, 'review');
  assert.deepEqual(view.route_history, ['github_pr']);
  assert.ok('readiness' in view);
  assert.ok('findings_provenance' in view);
  assert.equal(view.progress_event_count, 1);
});

test('createReadinessView computes is_ready correctly', () => {
  const activeIncomplete = { state: 'active', progress: { total_steps: 4, completed_steps: 1 }, task_type: 'x', current_route: 'y', findings: [] };
  assert.equal(createReadinessView(activeIncomplete).readiness.is_ready, true);

  const activeComplete = { state: 'active', progress: { total_steps: 4, completed_steps: 4 }, task_type: 'x', current_route: 'y', findings: [] };
  assert.equal(createReadinessView(activeComplete).readiness.is_ready, false);

  const done = { state: 'complete', progress: { total_steps: 4, completed_steps: 1 }, task_type: 'x', current_route: 'y', findings: [] };
  assert.equal(createReadinessView(done).readiness.is_ready, false);
});

test('createReadinessView computes stronger_route_available', () => {
  const onPr = { task_type: 'review_repository', current_route: 'github_pr', state: 'active', progress: {}, findings: [] };
  assert.equal(createReadinessView(onPr).readiness.stronger_route_available, true);

  const onLocal = { task_type: 'review_repository', current_route: 'local_repo', state: 'active', progress: {}, findings: [] };
  assert.equal(createReadinessView(onLocal).readiness.stronger_route_available, false);

  const otherType = { task_type: 'other', current_route: 'github_pr', state: 'active', progress: {}, findings: [] };
  assert.equal(createReadinessView(otherType).readiness.stronger_route_available, false);
});

test('createReadinessView computes progress_ratio', () => {
  const task14 = { task_type: 'x', current_route: 'y', state: 'active', progress: { total_steps: 4, completed_steps: 1 }, findings: [] };
  assert.equal(createReadinessView(task14).readiness.progress_ratio, 0.25);

  const taskZero = { task_type: 'x', current_route: 'y', state: 'active', progress: { total_steps: 0, completed_steps: 0 }, findings: [] };
  assert.equal(createReadinessView(taskZero).readiness.progress_ratio, 1);

  const taskNoProg = { task_type: 'x', current_route: 'y', state: 'active', findings: [] };
  assert.equal(createReadinessView(taskNoProg).readiness.progress_ratio, 1);
});
