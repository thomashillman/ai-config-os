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


test('TaskStore transitionState enforces lifecycle and snapshots', () => {
  const store = new TaskStore();
  const task = buildTask({ state: 'pending', version: 1 });
  store.create(task);

  const active = store.transitionState(task.task_id, {
    expectedVersion: 1,
    nextState: 'active',
    nextAction: 'collect_more_context',
    updatedAt: '2026-03-12T12:10:00.000Z',
    progress: { completed_steps: 1, total_steps: 3 },
  });

  assert.equal(active.state, 'active');
  assert.equal(active.version, 2);

  assert.throws(
    () => store.transitionState(task.task_id, {
      expectedVersion: 2,
      nextState: 'pending',
      nextAction: 'rewind',
      updatedAt: '2026-03-12T12:12:00.000Z',
    }),
    /Invalid task state transition/,
  );

  const snapshots = store.listSnapshots(task.task_id);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].task.state, 'active');
});

test('TaskStore selectRoute appends canonical route history', () => {
  const store = new TaskStore();
  const task = buildTask({ state: 'active', version: 1 });
  store.create(task);

  const updated = store.selectRoute(task.task_id, {
    routeId: 'local_repo',
    expectedVersion: 1,
    selectedAt: '2026-03-12T12:15:00.000Z',
  });

  assert.equal(updated.current_route, 'local_repo');
  assert.equal(updated.route_history.length, 2);
  assert.equal(updated.route_history[1].route, 'local_repo');
  assert.equal(updated.version, 2);

  const snapshots = store.listSnapshots(task.task_id);
  assert.equal(snapshots.length, 2);
});


test('TaskStore selectRoute rejects stale versions with TaskConflictError', () => {
  const store = new TaskStore();
  const task = buildTask({ state: 'active', version: 2 });
  store.create(task);

  assert.throws(
    () => store.selectRoute(task.task_id, {
      routeId: 'local_repo',
      expectedVersion: 1,
      selectedAt: '2026-03-12T12:16:00.000Z',
    }),
    TaskConflictError,
  );
});


test('TaskStore appendFinding records finding with optimistic concurrency', () => {
  const store = new TaskStore();
  const task = buildTask({ state: 'active', version: 1 });
  store.create(task);

  const updated = store.appendFinding(task.task_id, {
    expectedVersion: 1,
    finding: {
      findingId: 'missing_authz',
      summary: 'Missing authorization check for admin action.',
      status: 'verified',
      recordedAt: '2026-03-12T12:18:00.000Z',
      recordedByRoute: 'github_pr',
    },
    updatedAt: '2026-03-12T12:18:00.000Z',
  });

  assert.equal(updated.version, 2);
  assert.equal(updated.findings.length, 1);
  assert.equal(updated.findings[0].finding_id, 'missing_authz');
});

test('TaskStore transitionFindingsForRouteUpgrade marks cross-route verified findings as reused', () => {
  const store = new TaskStore();
  const task = buildTask({
    state: 'active',
    version: 1,
    findings: [{
      schema_version: '1.0.0',
      finding_id: 'weak_route_verified',
      summary: 'Review finding from weak route.',
      provenance: {
        schema_version: '1.0.0',
        status: 'verified',
        recorded_at: '2026-03-12T12:20:00.000Z',
        recorded_by_route: 'github_pr',
      },
    }],
  });
  store.create(task);

  const updated = store.transitionFindingsForRouteUpgrade(task.task_id, {
    expectedVersion: 1,
    toRouteId: 'local_repo',
    upgradedAt: '2026-03-12T12:25:00.000Z',
    toEquivalenceLevel: 'equal',
  });

  assert.equal(updated.version, 2);
  assert.equal(updated.findings[0].provenance.status, 'reused');
  assert.equal(updated.findings[0].provenance.recorded_by_route, 'local_repo');
});

test('TaskStore getReadinessView returns canonical readiness projection', () => {
  const store = new TaskStore();
  const task = buildTask({
    state: 'active',
    current_route: 'github_pr',
    progress: { completed_steps: 1, total_steps: 4 },
    findings: [{
      schema_version: '1.0.0',
      finding_id: 'finding_1',
      summary: 'Potential issue',
      evidence: [],
      provenance: {
        schema_version: '1.0.0',
        status: 'verified',
        recorded_at: '2026-03-12T12:20:00.000Z',
        recorded_by_route: 'github_pr',
      },
    }],
  });

  store.create(task);
  store.appendFinding(task.task_id, {
    expectedVersion: 1,
    finding: {
      findingId: 'finding_2',
      summary: 'Secondary signal',
      status: 'hypothesis',
      recordedAt: '2026-03-12T12:21:00.000Z',
      recordedByRoute: 'github_pr',
      evidence: [],
    },
    updatedAt: '2026-03-12T12:21:00.000Z',
  });

  const readiness = store.getReadinessView(task.task_id);

  assert.equal(readiness.task_id, task.task_id);
  assert.equal(readiness.current_route, 'github_pr');
  assert.equal(readiness.readiness.is_ready, true);
  assert.equal(readiness.readiness.stronger_route_available, false);
  assert.equal(readiness.findings_provenance.verified, 1);
  assert.equal(readiness.progress_event_count > 0, true);
});

test('TaskStore getReadinessView throws TaskNotFoundError for unknown task', () => {
  const store = new TaskStore();
  assert.throws(() => store.getReadinessView('missing_task_id'), TaskNotFoundError);
});
