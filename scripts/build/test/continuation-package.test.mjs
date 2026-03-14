import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore } from '../../../runtime/lib/task-store.mjs';

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
    version: 1,
    updated_at: '2026-03-12T12:00:00.000Z',
    ...overrides,
  };
}

function buildEffectiveExecutionContract(task, overrides = {}) {
  return {
    schema_version: '1.0.0',
    task_id: task.task_id,
    task_type: task.task_type,
    selected_route: {
      schema_version: '1.0.0',
      route_id: task.current_route,
      equivalence_level: 'equal',
      required_capabilities: ['browser.fetch'],
      missing_capabilities: [],
    },
    equivalence_level: 'equal',
    missing_capabilities: [],
    required_inputs: ['repository_ref'],
    stronger_host_guidance: 'Use local_repo for full verification.',
    computed_at: '2026-03-12T12:00:00.000Z',
    ...overrides,
  };
}

test('TaskStore.createContinuationPackage rejects uppercase handoffTokenId via continuation package schema', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  assert.throws(
    () => store.createContinuationPackage(task.task_id, {
      handoffTokenId: 'Handoff_001',
      effectiveExecutionContract: buildEffectiveExecutionContract(task),
      createdAt: '2026-03-12T12:05:00.000Z',
    }),
    /Invalid continuationPackage: .*handoff_token_id/,
  );
});

test('TaskStore.createContinuationPackage rejects handoffTokenId with spaces via continuation package schema', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  assert.throws(
    () => store.createContinuationPackage(task.task_id, {
      handoffTokenId: 'handoff 001',
      effectiveExecutionContract: buildEffectiveExecutionContract(task),
      createdAt: '2026-03-12T12:05:00.000Z',
    }),
    /Invalid continuationPackage: .*handoff_token_id/,
  );
});

test('TaskStore.createContinuationPackage rejects handoffTokenId with symbols via continuation package schema', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  assert.throws(
    () => store.createContinuationPackage(task.task_id, {
      handoffTokenId: 'handoff#001',
      effectiveExecutionContract: buildEffectiveExecutionContract(task),
      createdAt: '2026-03-12T12:05:00.000Z',
    }),
    /Invalid continuationPackage: .*handoff_token_id/,
  );
});

test('TaskStore.createContinuationPackage rejects invalid createdAt datetime via continuation package schema', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  assert.throws(
    () => store.createContinuationPackage(task.task_id, {
      handoffTokenId: 'handoff_001',
      effectiveExecutionContract: buildEffectiveExecutionContract(task),
      createdAt: 'not-a-date',
    }),
    /Invalid continuationPackage: .*created_at/,
  );
});

test('TaskStore.createContinuationPackage rejects task_type mismatch between task and effective execution contract', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  assert.throws(
    () => store.createContinuationPackage(task.task_id, {
      handoffTokenId: 'handoff_001',
      effectiveExecutionContract: buildEffectiveExecutionContract(task, { task_type: 'run_ci' }),
      createdAt: '2026-03-12T12:05:00.000Z',
    }),
    /task_type mismatch: task review_repository != effectiveExecutionContract run_ci/,
  );
});

test('TaskStore.createContinuationPackage rejects malformed effectiveExecutionContract payloads', () => {
  const store = new TaskStore();
  const task = buildTask();
  store.create(task);

  assert.throws(
    () => store.createContinuationPackage(task.task_id, {
      handoffTokenId: 'handoff_001',
      effectiveExecutionContract: {
        schema_version: '1.0.0',
        task_id: task.task_id,
        task_type: task.task_type,
      },
      createdAt: '2026-03-12T12:05:00.000Z',
    }),
    /Invalid continuationPackage: .*effective_execution_contract/,
  );
});
