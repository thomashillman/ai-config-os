import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContinuationPackage } from '../../../runtime/lib/continuation-package.mjs';
import { TaskStore, TaskNotFoundError } from '../../../runtime/lib/task-store.mjs';

function buildTask(overrides = {}) {
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
    version: 2,
    updated_at: '2026-03-12T12:10:00.000Z',
    ...overrides,
  };
}

function buildContract(overrides = {}) {
  return {
    schema_version: '1.0.0',
    task_id: 'task_review_repository_001',
    task_type: 'review_repository',
    selected_route: {
      schema_version: '1.0.0',
      route_id: 'github_pr',
      equivalence_level: 'upgrade',
      required_capabilities: ['network_http'],
      missing_capabilities: [],
    },
    equivalence_level: 'upgrade',
    missing_capabilities: [],
    required_inputs: ['pr_url'],
    computed_at: '2026-03-12T12:09:00.000Z',
    stronger_host_guidance: "Upgrade to route 'local_repo' when host supports: repo_local_read.",
    ...overrides,
  };
}

test('createContinuationPackage builds validated payload', () => {
  const task = buildTask();
  const contract = buildContract();

  const continuationPackage = createContinuationPackage({
    task,
    effectiveExecutionContract: contract,
    handoffTokenId: 'handoff_token_001',
    createdAt: '2026-03-12T12:10:00.000Z',
  });

  assert.equal(continuationPackage.schema_version, '1.0.0');
  assert.equal(continuationPackage.task.task_id, task.task_id);
  assert.equal(continuationPackage.effective_execution_contract.task_id, task.task_id);
  assert.equal(continuationPackage.handoff_token_id, 'handoff_token_001');
});

test('createContinuationPackage rejects contract/task mismatch', () => {
  const task = buildTask();
  const contract = buildContract({ task_id: 'task_different_001' });

  assert.throws(
    () => createContinuationPackage({
      task,
      effectiveExecutionContract: contract,
      handoffTokenId: 'handoff_token_002',
      createdAt: '2026-03-12T12:11:00.000Z',
    }),
    /task_id mismatch/,
  );
});

test('TaskStore createContinuationPackage emits continuation_created progress event', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  const continuationPackage = store.createContinuationPackage(task.task_id, {
    effectiveExecutionContract: buildContract(),
    handoffTokenId: 'handoff_token_003',
    createdAt: '2026-03-12T12:12:00.000Z',
  });

  assert.equal(continuationPackage.task.task_id, task.task_id);

  const events = store.listProgressEvents(task.task_id);
  const continuationEvent = events.find((event) => event.type === 'continuation_created');
  assert.ok(continuationEvent, 'continuation event should be recorded');
  assert.equal(continuationEvent.metadata.handoff_token_id, 'handoff_token_003');
  assert.equal(continuationEvent.metadata.route_id, 'github_pr');
});

test('TaskStore createContinuationPackage throws TaskNotFoundError for unknown task', () => {
  const store = new TaskStore();

  assert.throws(
    () => store.createContinuationPackage('task_missing_001', {
      effectiveExecutionContract: buildContract(),
      handoffTokenId: 'handoff_token_004',
      createdAt: '2026-03-12T12:13:00.000Z',
    }),
    TaskNotFoundError,
  );
});


test('createContinuationPackage rejects task_type mismatch', () => {
  const task = buildTask();
  const contract = buildContract({ task_type: 'issue_triage' });

  assert.throws(
    () => createContinuationPackage({
      task,
      effectiveExecutionContract: contract,
      handoffTokenId: 'handoff_token_005',
      createdAt: '2026-03-12T12:14:00.000Z',
    }),
    /task_type mismatch/,
  );
});

test('createContinuationPackage rejects invalid handoff token id format', () => {
  const task = buildTask();
  const contract = buildContract();

  assert.throws(
    () => createContinuationPackage({
      task,
      effectiveExecutionContract: contract,
      handoffTokenId: 'Bad Token!',
      createdAt: '2026-03-12T12:15:00.000Z',
    }),
    /Invalid continuationPackage/,
  );
});

test('createContinuationPackage rejects invalid createdAt date-time', () => {
  const task = buildTask();
  const contract = buildContract();

  assert.throws(
    () => createContinuationPackage({
      task,
      effectiveExecutionContract: contract,
      handoffTokenId: 'handoff_token_006',
      createdAt: 'not-a-date',
    }),
    /Invalid continuationPackage/,
  );
});

test('TaskStore createContinuationPackage rejects malformed effectiveExecutionContract', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  assert.throws(
    () => store.createContinuationPackage(task.task_id, {
      effectiveExecutionContract: {
        schema_version: '1.0.0',
        task_id: task.task_id,
      },
      handoffTokenId: 'handoff_token_007',
      createdAt: '2026-03-12T12:16:00.000Z',
    }),
    /Invalid effectiveExecutionContract/,
  );
});

test('TaskStore createContinuationPackage is idempotent for same task version and handoff token', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  const first = store.createContinuationPackage(task.task_id, {
    effectiveExecutionContract: buildContract(),
    handoffTokenId: 'handoff_token_008',
    createdAt: '2026-03-12T12:17:00.000Z',
  });

  const second = store.createContinuationPackage(task.task_id, {
    effectiveExecutionContract: buildContract(),
    handoffTokenId: 'handoff_token_008',
    createdAt: '2026-03-12T12:18:00.000Z',
  });

  assert.equal(first.handoff_token_id, second.handoff_token_id);
  const events = store
    .listProgressEvents(task.task_id)
    .filter((event) => event.type === 'continuation_created' && event.metadata.handoff_token_id === 'handoff_token_008');

  assert.equal(events.length, 1, 'idempotent retries should not create duplicate continuation events');
});


test('TaskStore createContinuationPackage records a new event after task version changes even with same token', () => {
  const store = new TaskStore();
  const task = buildTask({ state: 'pending', version: 1 });
  store.create(task);

  store.createContinuationPackage(task.task_id, {
    effectiveExecutionContract: buildContract({
      selected_route: {
        schema_version: '1.0.0',
        route_id: 'github_pr',
        equivalence_level: 'upgrade',
        required_capabilities: ['network_http'],
        missing_capabilities: [],
      },
      computed_at: '2026-03-12T12:18:00.000Z',
    }),
    handoffTokenId: 'handoff_token_009',
    createdAt: '2026-03-12T12:18:01.000Z',
  });

  store.transitionState(task.task_id, {
    expectedVersion: 1,
    nextState: 'active',
    nextAction: 'collect_more_context',
    updatedAt: '2026-03-12T12:18:02.000Z',
    progress: { completed_steps: 1, total_steps: 3 },
  });

  store.createContinuationPackage(task.task_id, {
    effectiveExecutionContract: buildContract({
      selected_route: {
        schema_version: '1.0.0',
        route_id: 'github_pr',
        equivalence_level: 'upgrade',
        required_capabilities: ['network_http'],
        missing_capabilities: [],
      },
      computed_at: '2026-03-12T12:18:03.000Z',
    }),
    handoffTokenId: 'handoff_token_009',
    createdAt: '2026-03-12T12:18:04.000Z',
  });

  const events = store
    .listProgressEvents(task.task_id)
    .filter((event) => event.type === 'continuation_created' && event.metadata.handoff_token_id === 'handoff_token_009');

  assert.equal(events.length, 2, 'new task version should record another continuation creation event');
});
