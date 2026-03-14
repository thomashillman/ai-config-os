import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore } from '../../../runtime/lib/task-store.mjs';

function baseTask(overrides = {}) {
  return {
    schema_version: '1.0.0',
    task_id: 'task_review_repository_001',
    task_type: 'review_repository',
    goal: 'Review repository changes for correctness and risk.',
    current_route: 'github_pr',
    state: 'active',
    progress: { completed_steps: 1, total_steps: 3 },
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

function baseExecutionContract(taskId) {
  return {
    schema_version: '1.0.0',
    task_id: taskId,
    task_type: 'review_repository',
    selected_route: {
      schema_version: '1.0.0',
      route_id: 'github_pr',
      equivalence_level: 'equal',
      required_capabilities: ['browser.fetch'],
      missing_capabilities: [],
    },
    equivalence_level: 'equal',
    missing_capabilities: [],
    required_inputs: ['repository_ref'],
    stronger_host_guidance: 'Use local_repo for full verification.',
    computed_at: '2026-03-12T12:00:00.000Z',
  };
}

function baseHandoffToken(taskId) {
  return {
    schema_version: '1.0.0',
    token_id: 'handoff_001',
    task_id: taskId,
    issued_at: '2026-03-12T12:00:00.000Z',
    expires_at: '2026-03-12T12:10:00.000Z',
    signature: 'deadbeef',
    replay_nonce: 'nonce_1',
  };
}

test('TaskStore createContinuationPackage is idempotent for retries with same handoff token', () => {
  const store = new TaskStore();
  const task = baseTask();
  store.create(task);

  const firstPackage = store.createContinuationPackage(task.task_id, {
    handoffToken: baseHandoffToken(task.task_id),
    effectiveExecutionContract: baseExecutionContract(task.task_id),
    createdAt: '2026-03-12T12:03:00.000Z',
  });

  const retryPackage = store.createContinuationPackage(task.task_id, {
    handoffToken: baseHandoffToken(task.task_id),
    effectiveExecutionContract: baseExecutionContract(task.task_id),
    createdAt: '2026-03-12T12:05:00.000Z',
  });

  assert.equal(firstPackage.handoff_token_id, 'handoff_001');
  assert.equal(retryPackage.handoff_token_id, 'handoff_001');
  assert.equal(firstPackage.created_at, '2026-03-12T12:03:00.000Z');
  assert.equal(retryPackage.created_at, '2026-03-12T12:03:00.000Z');

  const events = store.listProgressEvents(task.task_id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'continuation_created');
  assert.equal(events[0].event_id, 'evt_continuation_created_handoff_001');
  assert.equal(events[0].metadata?.handoff_token_id, 'handoff_001');
  assert.equal(events[0].metadata?.continuation_package_created_at, '2026-03-12T12:03:00.000Z');
});

test('TaskStore createContinuationPackage records unique events for different handoff tokens', () => {
  const store = new TaskStore();
  const task = baseTask();
  store.create(task);

  store.createContinuationPackage(task.task_id, {
    handoffToken: baseHandoffToken(task.task_id),
    effectiveExecutionContract: baseExecutionContract(task.task_id),
    createdAt: '2026-03-12T12:03:00.000Z',
  });

  store.createContinuationPackage(task.task_id, {
    handoffToken: {
      ...baseHandoffToken(task.task_id),
      token_id: 'handoff_002',
      replay_nonce: 'nonce_2',
    },
    effectiveExecutionContract: baseExecutionContract(task.task_id),
    createdAt: '2026-03-12T12:04:00.000Z',
  });

  const events = store.listProgressEvents(task.task_id);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.event_id),
    [
      'evt_continuation_created_handoff_001',
      'evt_continuation_created_handoff_002',
    ],
  );
});


test('TaskStore createContinuationPackage rejects mismatched effective execution task type', () => {
  const store = new TaskStore();
  const task = baseTask();
  store.create(task);

  assert.throws(
    () => store.createContinuationPackage(task.task_id, {
      handoffToken: baseHandoffToken(task.task_id),
      effectiveExecutionContract: {
        ...baseExecutionContract(task.task_id),
        task_type: 'other_task_type',
      },
      createdAt: '2026-03-12T12:03:00.000Z',
    }),
    /effectiveExecutionContract\.task_type must match task task_type/,
  );
});


test('TaskStore createContinuationPackage replays canonical result from prior token event even with legacy event id', () => {
  const store = new TaskStore();
  const task = baseTask();
  store.create(task);

  store.progressEvents.append({
    taskId: task.task_id,
    eventId: 'evt_legacy_continuation_001',
    type: 'continuation_created',
    message: 'Legacy continuation package event.',
    createdAt: '2026-03-12T12:01:00.000Z',
    metadata: {
      handoff_token_id: 'handoff_001',
      continuation_package_created_at: '2026-03-12T12:01:00.000Z',
    },
  });

  const replayPackage = store.createContinuationPackage(task.task_id, {
    handoffToken: baseHandoffToken(task.task_id),
    effectiveExecutionContract: baseExecutionContract(task.task_id),
    createdAt: '2026-03-12T12:09:00.000Z',
  });

  assert.equal(replayPackage.created_at, '2026-03-12T12:01:00.000Z');

  const events = store.listProgressEvents(task.task_id);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_id, 'evt_legacy_continuation_001');
});
