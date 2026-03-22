import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContinuationPackage } from '../../../runtime/lib/continuation-package.mjs';
import { TaskStore, TaskNotFoundError } from '../../../runtime/lib/task-store.mjs';
import { createHandoffTokenService } from '../../../runtime/lib/handoff-token-service.mjs';


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

function baseHandoffToken(taskId, {
  tokenId = 'handoff_001',
  replayNonce = 'nonce_1',
  issuedAt = '2026-03-12T12:00:00.000Z',
  ttlSeconds = 600,
} = {}) {
  const handoffTokenService = createHandoffTokenService({
    secret: 'test-secret',
    now: () => issuedAt,
    createTokenId: () => tokenId,
    createReplayNonce: () => replayNonce,
  });

  return handoffTokenService.issueToken({
    taskId,
    ttlSeconds,
    now: issuedAt,
  });
}

function buildStore() {
  return new TaskStore({
    handoffTokenService: createHandoffTokenService({
      secret: 'test-secret',
      now: () => '2026-03-12T12:00:00.000Z',
    }),
  });
}

// --- Standalone createContinuationPackage tests ---

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

// --- TaskStore.createContinuationPackage tests (handoffToken object API) ---

test('TaskStore createContinuationPackage is idempotent for retries with same handoff token', () => {
  const store = buildStore();
  const task = buildTask({ version: 1, updated_at: '2026-03-12T12:00:00.000Z' });
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
  const store = buildStore();
  const task = buildTask({ version: 1, updated_at: '2026-03-12T12:00:00.000Z' });
  store.create(task);

  store.createContinuationPackage(task.task_id, {
    handoffToken: baseHandoffToken(task.task_id),
    effectiveExecutionContract: baseExecutionContract(task.task_id),
    createdAt: '2026-03-12T12:03:00.000Z',
  });

  store.createContinuationPackage(task.task_id, {
    handoffToken: {
      ...baseHandoffToken(task.task_id, { tokenId: 'handoff_002', replayNonce: 'nonce_2' }),
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
  const store = buildStore();
  const task = buildTask({ version: 1, updated_at: '2026-03-12T12:00:00.000Z' });
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
  const store = buildStore();
  const task = buildTask({ version: 1, updated_at: '2026-03-12T12:00:00.000Z' });
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

test('TaskStore createContinuationPackage stores canonical timestamp metadata per token', () => {
  const store = buildStore();
  const task = buildTask({ version: 1, updated_at: '2026-03-12T12:00:00.000Z' });
  store.create(task);

  store.createContinuationPackage(task.task_id, {
    handoffToken: baseHandoffToken(task.task_id),
    effectiveExecutionContract: baseExecutionContract(task.task_id),
    createdAt: '2026-03-12T12:03:00.000Z',
  });

  store.createContinuationPackage(task.task_id, {
    handoffToken: {
      ...baseHandoffToken(task.task_id, { tokenId: 'handoff_002', replayNonce: 'nonce_2' }),
    },
    effectiveExecutionContract: baseExecutionContract(task.task_id),
    createdAt: '2026-03-12T12:04:00.000Z',
  });

  const events = store.listProgressEvents(task.task_id);
  const byToken = new Map(events.map((event) => [event.metadata?.handoff_token_id, event]));

  assert.equal(byToken.get('handoff_001')?.metadata?.continuation_package_created_at, '2026-03-12T12:03:00.000Z');
  assert.equal(byToken.get('handoff_002')?.metadata?.continuation_package_created_at, '2026-03-12T12:04:00.000Z');
});


// ── Slice F: Momentum-Aware Continuation ─────────────────────────────────────

test('createContinuationPackage includes resume_headline derived from intent lexicon', () => {
  const pkg = createContinuationPackage({
    task: buildTask(),
    effectiveExecutionContract: buildContract(),
    handoffTokenId: 'handoff_token_f01',
    createdAt: '2026-03-12T12:20:00.000Z',
  });
  assert.equal(pkg.resume_headline, 'Continuing Repository review');
});

test('createContinuationPackage includes best_next_step from task.next_action', () => {
  const pkg = createContinuationPackage({
    task: buildTask({ next_action: 'collect_more_context' }),
    effectiveExecutionContract: buildContract(),
    handoffTokenId: 'handoff_token_f02',
    createdAt: '2026-03-12T12:21:00.000Z',
  });
  assert.equal(pkg.best_next_step, 'collect_more_context');
});

test('createContinuationPackage includes upgrade_value_statement when contract has upgrade_explanation', () => {
  const contractWithUpgrade = buildContract({
    upgrade_explanation: {
      before: 'PR context is available from GitHub',
      now: 'PR metadata and changed files are inspected',
      unlocks: 'Full repository access enables complete call site verification and test inspection',
      stronger_route_id: 'local_repo',
    },
  });
  const pkg = createContinuationPackage({
    task: buildTask(),
    effectiveExecutionContract: contractWithUpgrade,
    handoffTokenId: 'handoff_token_f03',
    createdAt: '2026-03-12T12:22:00.000Z',
  });
  assert.ok(pkg.upgrade_value_statement);
  assert.match(pkg.upgrade_value_statement, /[Ff]ull repository/);
});

test('createContinuationPackage omits upgrade_value_statement when no upgrade_explanation', () => {
  const pkg = createContinuationPackage({
    task: buildTask(),
    effectiveExecutionContract: buildContract(),
    handoffTokenId: 'handoff_token_f04',
    createdAt: '2026-03-12T12:23:00.000Z',
  });
  assert.equal(pkg.upgrade_value_statement, undefined);
});

test('createContinuationPackage UX fields do not break existing validation (all optional)', () => {
  // This test verifies that the base case (no upgrade_explanation) still validates
  const pkg = createContinuationPackage({
    task: buildTask(),
    effectiveExecutionContract: buildContract(),
    handoffTokenId: 'handoff_token_f05',
    createdAt: '2026-03-12T12:24:00.000Z',
  });
  assert.equal(pkg.schema_version, '1.0.0');
  assert.ok(pkg.resume_headline);
  assert.ok(pkg.best_next_step);
});

test('TaskStore createContinuationPackage does not consume token when execution contract is invalid', () => {
  let consumeCalls = 0;
  const handoffTokenService = createHandoffTokenService({
    secret: 'test-secret',
    now: () => '2026-03-12T12:00:00.000Z',
  });

  const store = new TaskStore({
    handoffTokenService: {
      verifyToken: handoffTokenService.verifyToken,
      consumeToken(input) {
        consumeCalls += 1;
        return handoffTokenService.consumeToken(input);
      },
    },
  });

  const task = buildTask({ version: 1, updated_at: '2026-03-12T12:00:00.000Z' });
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

  assert.equal(consumeCalls, 0);
});
