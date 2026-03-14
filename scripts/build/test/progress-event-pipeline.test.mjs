import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProgressEvent,
  ProgressEventStore,
  ProgressEventConflictError,
} from '../../../runtime/lib/progress-event-pipeline.mjs';
import { TaskStore, TaskNotFoundError } from '../../../runtime/lib/task-store.mjs';

function taskFixture(overrides = {}) {
  return {
    schema_version: '1.0.0',
    task_id: 'task_review_repository_901',
    task_type: 'review_repository',
    goal: 'Review repository changes for correctness and risk.',
    current_route: 'github_pr',
    state: 'pending',
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

test('createProgressEvent validates canonical payload and preserves metadata', () => {
  const event = createProgressEvent({
    taskId: 'task_review_repository_901',
    eventId: 'evt_001',
    type: 'route_selected',
    message: 'Selected local_repo route after capability upgrade.',
    createdAt: '2026-03-12T12:10:00.000Z',
    metadata: {
      route_id: 'local_repo',
      equivalence_level: 'equal',
    },
  });

  assert.equal(event.task_id, 'task_review_repository_901');
  assert.equal(event.type, 'route_selected');
  assert.equal(event.metadata.route_id, 'local_repo');
});

test('createProgressEvent accepts finding_transitioned type for provenance upgrades', () => {
  const event = createProgressEvent({
    taskId: 'task_review_repository_901',
    eventId: 'evt_003',
    type: 'finding_transitioned',
    message: 'Findings provenance transitioned after route upgrade.',
    createdAt: '2026-03-12T12:12:00.000Z',
    metadata: { route_id: 'local_repo' },
  });

  assert.equal(event.type, 'finding_transitioned');
});

test('createProgressEvent rejects non-object metadata payloads', () => {
  assert.throws(
    () => createProgressEvent({
      taskId: 'task_review_repository_901',
      eventId: 'evt_001',
      type: 'route_selected',
      message: 'Selected route.',
      createdAt: '2026-03-12T12:10:00.000Z',
      metadata: ['not', 'allowed'],
    }),
    /metadata must be a plain object/,
  );
});

test('ProgressEventStore appends validated events and lists them in insert order', () => {
  const store = new ProgressEventStore();

  const first = store.append({
    taskId: 'task_review_repository_901',
    eventId: 'evt_001',
    type: 'state_change',
    message: 'Task moved to active.',
    createdAt: '2026-03-12T12:10:00.000Z',
  });

  const second = store.append({
    taskId: 'task_review_repository_901',
    eventId: 'evt_002',
    type: 'finding_recorded',
    message: 'Recorded finding missing_authz.',
    createdAt: '2026-03-12T12:11:00.000Z',
  });

  const events = store.listByTaskId('task_review_repository_901');
  assert.equal(events.length, 2);
  assert.equal(events[0].event_id, first.event_id);
  assert.equal(events[1].event_id, second.event_id);
});

test('ProgressEventStore rejects duplicate event ids per task', () => {
  const store = new ProgressEventStore();

  store.append({
    taskId: 'task_review_repository_901',
    eventId: 'evt_001',
    type: 'state_change',
    message: 'Task moved to active.',
    createdAt: '2026-03-12T12:10:00.000Z',
  });

  assert.throws(
    () => store.append({
      taskId: 'task_review_repository_901',
      eventId: 'evt_001',
      type: 'route_selected',
      message: 'Same id should be rejected.',
      createdAt: '2026-03-12T12:11:00.000Z',
    }),
    ProgressEventConflictError,
  );
});

test('TaskStore emits progress events for route changes, findings, and state transitions', () => {
  const tasks = new TaskStore();
  const task = taskFixture();
  tasks.create(task);

  const routed = tasks.selectRoute(task.task_id, {
    routeId: 'local_repo',
    expectedVersion: 1,
    selectedAt: '2026-03-12T12:05:00.000Z',
  });

  const withFinding = tasks.appendFinding(task.task_id, {
    expectedVersion: routed.version,
    finding: {
      findingId: 'missing_authz',
      summary: 'Missing authorization check for admin action.',
      status: 'verified',
      recordedAt: '2026-03-12T12:06:00.000Z',
      recordedByRoute: 'local_repo',
    },
    updatedAt: '2026-03-12T12:06:00.000Z',
  });

  tasks.transitionState(task.task_id, {
    expectedVersion: withFinding.version,
    nextState: 'active',
    nextAction: 'continue_verification',
    updatedAt: '2026-03-12T12:07:00.000Z',
    progress: { completed_steps: 1, total_steps: 3 },
  });

  const events = tasks.listProgressEvents(task.task_id);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(event => event.type), ['route_selected', 'finding_recorded', 'state_change']);
  assert.equal(events[0].metadata.route_id, 'local_repo');
  assert.equal(events[1].metadata.finding_id, 'missing_authz');
  assert.equal(events[2].metadata.next_state, 'active');
});

test('TaskStore emits a findings transition event during route upgrades', () => {
  const tasks = new TaskStore();
  const task = taskFixture({
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

  tasks.create(task);

  tasks.transitionFindingsForRouteUpgrade(task.task_id, {
    expectedVersion: 1,
    toRouteId: 'local_repo',
    upgradedAt: '2026-03-12T12:25:00.000Z',
    toEquivalenceLevel: 'equal',
  });

  const events = tasks.listProgressEvents(task.task_id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'finding_transitioned');
  assert.equal(events[0].metadata.route_id, 'local_repo');
  assert.equal(events[0].metadata.reclassified_count, 1);
});

test('TaskStore listProgressEvents throws TaskNotFoundError for missing task', () => {
  const tasks = new TaskStore();
  assert.throws(() => tasks.listProgressEvents('task_missing_001'), TaskNotFoundError);
});
