import test from 'node:test';
import assert from 'node:assert/strict';

import { TaskStore } from '../../../runtime/lib/task-store.mjs';
import {
  startReviewRepositoryTask,
  resumeReviewRepositoryTask,
  buildTaskReadinessView,
} from '../../../runtime/lib/review-repository-journey.mjs';

function createWeakCapabilityProfile() {
  return {
    capabilities: {
      network_http: 'supported',
      local_fs: 'unsupported',
      local_shell: 'unsupported',
      local_repo: 'unsupported',
    },
  };
}

function createStrongCapabilityProfile() {
  return {
    capabilities: {
      network_http: 'supported',
      local_fs: 'supported',
      local_shell: 'supported',
      local_repo: 'supported',
    },
  };
}

test('T015 startReviewRepositoryTask creates active task with deterministic weak route', () => {
  const store = new TaskStore();
  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_review_repository_t015',
    goal: 'Review repository risk posture.',
    routeInputs: {
      repository_slug: 'example/repo',
      pull_request_number: '42',
    },
    capabilityProfile: createWeakCapabilityProfile(),
    now: '2026-03-14T12:00:00.000Z',
  });

  assert.equal(started.task.task_id, 'task_review_repository_t015');
  assert.equal(started.task.state, 'active');
  assert.equal(started.task.current_route, 'github_pr');
  assert.equal(started.effective_execution_contract.selected_route.route_id, 'github_pr');

  const events = store.listProgressEvents(started.task.task_id);
  assert.ok(events.some((event) => event.type === 'state_change' && event.metadata?.phase === 'start'));
});

test('T016 resumeReviewRepositoryTask upgrades to local_repo and transitions findings provenance', () => {
  const store = new TaskStore();
  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_review_repository_t016',
    goal: 'Review repository quality and risks.',
    routeInputs: {
      repository_slug: 'example/repo',
      pull_request_number: '99',
    },
    capabilityProfile: createWeakCapabilityProfile(),
    now: '2026-03-14T12:01:00.000Z',
  });

  const withFinding = store.appendFinding(started.task.task_id, {
    expectedVersion: started.task.version,
    finding: {
      findingId: 'finding_001',
      summary: 'Dependency pin is outdated.',
      status: 'verified',
      recordedAt: '2026-03-14T12:01:30.000Z',
      recordedByRoute: 'github_pr',
      evidence: ['package.json'],
    },
    updatedAt: '2026-03-14T12:01:30.000Z',
  });

  assert.equal(withFinding.findings[0].provenance.status, 'verified');

  const resumed = resumeReviewRepositoryTask({
    taskStore: store,
    taskId: started.task.task_id,
    capabilityProfile: createStrongCapabilityProfile(),
    now: '2026-03-14T12:02:00.000Z',
  });

  assert.equal(resumed.upgraded, true);
  assert.equal(resumed.task.current_route, 'local_repo');
  assert.equal(resumed.effective_execution_contract.equivalence_level, 'equal');
  assert.equal(resumed.task.findings[0].provenance.status, 'reused');

  const events = store.listProgressEvents(started.task.task_id);
  assert.ok(events.some((event) => event.type === 'route_selected' && event.metadata?.phase === 'resume'));
});

test('T017 buildTaskReadinessView exposes readiness, route history, and provenance summary', () => {
  const store = new TaskStore();
  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_review_repository_t017',
    goal: 'Assess repository before merge.',
    routeInputs: {
      repository_slug: 'example/repo',
      pull_request_number: '3',
    },
    capabilityProfile: createWeakCapabilityProfile(),
    now: '2026-03-14T12:03:00.000Z',
  });

  const readiness = buildTaskReadinessView({
    task: store.load(started.task.task_id),
    effectiveExecutionContract: started.effective_execution_contract,
    progressEvents: store.listProgressEvents(started.task.task_id),
  });

  assert.equal(readiness.task_id, started.task.task_id);
  assert.equal(readiness.current_route, 'github_pr');
  assert.equal(readiness.readiness.stronger_route_available, true);
  assert.equal(Array.isArray(readiness.route_history), true);
  assert.equal(readiness.progress_event_count > 0, true);
});

test('T018 telemetry/audit event flow emits deterministic event types for start and resume', () => {
  const store = new TaskStore();
  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_review_repository_t018',
    goal: 'Check controls before release.',
    routeInputs: {
      repository_slug: 'example/repo',
      pull_request_number: '7',
    },
    capabilityProfile: createWeakCapabilityProfile(),
    now: '2026-03-14T12:04:00.000Z',
  });

  resumeReviewRepositoryTask({
    taskStore: store,
    taskId: started.task.task_id,
    capabilityProfile: createStrongCapabilityProfile(),
    now: '2026-03-14T12:05:00.000Z',
  });

  const events = store.listProgressEvents(started.task.task_id);
  const eventTypes = events.map((event) => event.type);

  assert.ok(eventTypes.includes('state_change'));
  assert.ok(eventTypes.includes('route_selected'));
  assert.ok(eventTypes.includes('finding_transitioned'));
  assert.ok(eventTypes.filter((type) => type === 'route_selected').length >= 2);
});

test('T019 adversarial: start flow rejects control-character path injection and oversized text', () => {
  const store = new TaskStore();

  assert.throws(
    () => startReviewRepositoryTask({
      taskStore: store,
      taskId: 'task_review_repository_t019_path',
      goal: 'Test path sanitisation',
      routeInputs: { repository_path: 'repo\nmalicious' },
      capabilityProfile: createStrongCapabilityProfile(),
      now: '2026-03-14T12:06:00.000Z',
    }),
    /repository_path contains unsupported control characters/
  );

  assert.throws(
    () => startReviewRepositoryTask({
      taskStore: store,
      taskId: 'task_review_repository_t019_diff',
      goal: 'Test oversized diff guard',
      routeInputs: { diff_text: 'a'.repeat(200_001) },
      capabilityProfile: {
        capabilities: {
          network_http: 'unsupported',
          local_fs: 'unsupported',
          local_shell: 'unsupported',
          local_repo: 'unsupported',
        },
      },
      now: '2026-03-14T12:06:30.000Z',
    }),
    /diff_text exceeds max length/
  );
});

test('T019 adversarial: resume flow surfaces task version conflict as hard failure', () => {
  const store = new TaskStore();
  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_review_repository_t019_conflict',
    goal: 'Prove optimistic conflict behavior.',
    routeInputs: {
      repository_slug: 'example/repo',
      pull_request_number: '12',
    },
    capabilityProfile: createWeakCapabilityProfile(),
    now: '2026-03-14T12:07:00.000Z',
  });

  // Force a concurrent update between load and explicit selectRoute call.
  const staleVersion = store.load(started.task.task_id).version;
  store.appendFinding(started.task.task_id, {
    expectedVersion: staleVersion,
    finding: {
      findingId: 'finding_conflict',
      summary: 'Concurrent update',
      status: 'hypothesis',
      recordedAt: '2026-03-14T12:07:10.000Z',
      recordedByRoute: 'github_pr',
      evidence: [],
    },
    updatedAt: '2026-03-14T12:07:10.000Z',
  });

  assert.throws(
    () => store.selectRoute(started.task.task_id, {
      routeId: 'local_repo',
      expectedVersion: staleVersion,
      selectedAt: '2026-03-14T12:07:20.000Z',
    }),
    /Version conflict/
  );
});
