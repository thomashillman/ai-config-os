import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore } from '../../../runtime/lib/task-store.mjs';
import { createMomentumEngine } from '../../../runtime/lib/momentum-engine.mjs';
import { createNarrator } from '../../../runtime/lib/momentum-narrator.mjs';
import { MomentumObserver } from '../../../runtime/lib/momentum-observer.mjs';
import {
  startReviewRepositoryTask,
  resumeReviewRepositoryTask,
  buildTaskReadinessView,
} from '../../../runtime/lib/review-repository-journey.mjs';

function weakProfile() {
  return {
    capabilities: {
      network_http: 'supported',
      local_fs: 'unsupported',
      local_shell: 'unsupported',
      local_repo: 'unsupported',
    },
  };
}

function strongProfile() {
  return {
    capabilities: {
      network_http: 'supported',
      local_fs: 'supported',
      local_shell: 'supported',
      local_repo: 'supported',
    },
  };
}

// ── Momentum Engine orchestrator tests ──

test('createMomentumEngine requires taskStore with progressEvents', () => {
  assert.throws(() => createMomentumEngine({ taskStore: {} }), /progressEvents/);
});

test('createMomentumEngine initializes with working narrator and observer', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  assert.ok(engine.narrator);
  assert.ok(engine.observer);
  assert.equal(typeof engine.resolveIntent, 'function');
  assert.equal(typeof engine.narrateStart, 'function');
  assert.equal(typeof engine.narrateResume, 'function');
  assert.equal(typeof engine.buildShelf, 'function');
  assert.equal(typeof engine.reflect, 'function');
  assert.equal(typeof engine.applyInsight, 'function');
});

test('engine.resolveIntent delegates to intent lexicon', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  const result = engine.resolveIntent('review this repository');
  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
});

test('engine.resolveIntent returns suggestions for unrecognized phrases', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  const result = engine.resolveIntent('do something unusual');
  assert.equal(result.resolved, false);
  assert.ok(result.suggestions.length > 0);
});

// ── Journey integration with narrator+observer tests ──

test('startReviewRepositoryTask with narrator produces narration and records observation', () => {
  const store = new TaskStore();
  const narrator = createNarrator();
  const observer = new MomentumObserver({ progressEventStore: store.progressEvents });

  const result = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_narrated_start_001',
    goal: 'Review security posture',
    routeInputs: {
      repository_slug: 'test/repo',
      pull_request_number: '5',
    },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T10:00:00.000Z',
    narrator,
    observer,
  });

  // Narration is produced
  assert.ok(result.narration, 'should return narration');
  assert.ok(result.narration.headline.length > 0, 'headline should not be empty');
  assert.equal(result.narration.strength.level, 'degraded');
  assert.ok(result.narration.upgrade, 'should have upgrade block for weak route');
  assert.ok(result.narration.upgrade.unlocks.includes('verify call sites'));

  // Observation is recorded in the event store
  const events = store.progressEvents.listByTaskId('task_narrated_start_001');
  const narrationEvents = events.filter((e) => e.type === 'narration_shown');
  assert.equal(narrationEvents.length, 1);
  assert.equal(narrationEvents[0].metadata.narration_point, 'onStart');
  assert.equal(narrationEvents[0].metadata.template_version, '1.0.0');
});

test('startReviewRepositoryTask without narrator returns narration: null (backward compat)', () => {
  const store = new TaskStore();

  const result = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_no_narrator_start',
    goal: 'Review code quality',
    routeInputs: {
      repository_slug: 'test/repo',
      pull_request_number: '10',
    },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T10:01:00.000Z',
  });

  assert.equal(result.narration, null);

  // No narration events
  const events = store.progressEvents.listByTaskId('task_no_narrator_start');
  const narrationEvents = events.filter((e) => e.type === 'narration_shown');
  assert.equal(narrationEvents.length, 0);
});

test('resumeReviewRepositoryTask with narrator produces narration on upgrade', () => {
  const store = new TaskStore();
  const narrator = createNarrator();
  const observer = new MomentumObserver({ progressEventStore: store.progressEvents });

  // Start in weak mode
  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_narrated_resume_001',
    goal: 'Review dependencies',
    routeInputs: {
      repository_slug: 'test/repo',
      pull_request_number: '20',
    },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T10:02:00.000Z',
  });

  // Add a finding
  store.appendFinding('task_narrated_resume_001', {
    expectedVersion: started.task.version,
    finding: {
      findingId: 'finding_dep_001',
      summary: 'Outdated lodash dependency',
      status: 'hypothesis',
      recordedAt: '2026-03-17T10:02:30.000Z',
      recordedByRoute: 'github_pr',
      evidence: ['package.json'],
    },
    updatedAt: '2026-03-17T10:02:30.000Z',
  });

  // Resume in strong mode with narrator
  const previousContract = started.effective_execution_contract;
  const resumed = resumeReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_narrated_resume_001',
    capabilityProfile: strongProfile(),
    now: '2026-03-17T10:03:00.000Z',
    narrator,
    observer,
    previousContract,
  });

  assert.equal(resumed.upgraded, true);
  assert.ok(resumed.narration, 'should return narration');
  assert.ok(resumed.narration.headline.length > 0);
  assert.equal(resumed.narration.findings.length, 1);
  // Finding was hypothesis from github_pr; hypothesis status is preserved after upgrade
  assert.ok(resumed.narration.findings[0].narrative.includes('Possible'));
  assert.ok(resumed.narration.upgrade, 'should have upgrade block');

  // Observation recorded
  const events = store.progressEvents.listByTaskId('task_narrated_resume_001');
  const narrationEvents = events.filter((e) => e.type === 'narration_shown');
  assert.equal(narrationEvents.length, 1);
  assert.equal(narrationEvents[0].metadata.narration_point, 'onResume');
});

test('resumeReviewRepositoryTask without narrator returns narration: null (backward compat)', () => {
  const store = new TaskStore();

  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_no_narrator_resume',
    goal: 'Review changes',
    routeInputs: {
      repository_slug: 'test/repo',
      pull_request_number: '30',
    },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T10:04:00.000Z',
  });

  const resumed = resumeReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_no_narrator_resume',
    capabilityProfile: strongProfile(),
    now: '2026-03-17T10:05:00.000Z',
  });

  assert.equal(resumed.narration, null);
});

test('buildTaskReadinessView always includes narration key (null when no narrator)', () => {
  const store = new TaskStore();

  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_readiness_narration',
    goal: 'Check quality',
    routeInputs: {
      repository_slug: 'test/repo',
      pull_request_number: '40',
    },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T10:06:00.000Z',
  });

  const view = buildTaskReadinessView({
    task: store.load('task_readiness_narration'),
    effectiveExecutionContract: started.effective_execution_contract,
    progressEvents: store.listProgressEvents('task_readiness_narration'),
  });

  assert.ok('narration' in view, 'narration key must always be present');
  assert.equal(view.narration, null);
});

test('buildTaskReadinessView with narrator produces narration when upgrade available', () => {
  const store = new TaskStore();
  const narrator = createNarrator();

  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_readiness_with_narrator',
    goal: 'Check quality',
    routeInputs: {
      repository_slug: 'test/repo',
      pull_request_number: '50',
    },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T10:07:00.000Z',
  });

  const view = buildTaskReadinessView({
    task: store.load('task_readiness_with_narrator'),
    effectiveExecutionContract: started.effective_execution_contract,
    progressEvents: store.listProgressEvents('task_readiness_with_narrator'),
    narrator,
  });

  assert.ok(view.narration, 'should have narration when upgrade is available');
  assert.ok(view.narration.headline.length > 0);
  assert.ok(view.narration.upgrade, 'should describe the upgrade');
});

// ── Full orchestrator flow: start → narrate → record response → reflect ──

test('full momentum flow: start → narrate → respond → reflect', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  // Start a task via journey, wired to engine
  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_full_flow_001',
    goal: 'Review auth module',
    routeInputs: {
      repository_slug: 'test/repo',
      pull_request_number: '100',
    },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T11:00:00.000Z',
    narrator: engine.narrator,
    observer: engine.observer,
  });

  assert.ok(started.narration);

  // Find the narration event ID
  const events = store.progressEvents.listByTaskId('task_full_flow_001');
  const narrationEvent = events.find((e) => e.type === 'narration_shown');
  assert.ok(narrationEvent);

  // Record user response
  const response = engine.recordUserResponse({
    taskId: 'task_full_flow_001',
    narrationEventId: narrationEvent.event_id,
    responseType: 'engaged',
    timeToActionMs: 3500,
  });
  assert.equal(response.type, 'user_response');

  // Get observations
  const observations = engine.getObservations('task_full_flow_001');
  assert.equal(observations.length, 1);
  assert.ok(observations[0].narration);
  assert.ok(observations[0].response);

  // Run reflection — use a `since` far in the past to capture all observations
  const reflection = engine.reflect({
    since: '2020-01-01T00:00:00.000Z',
  });
  assert.equal(reflection.report.total_narrations, 1);
  assert.equal(reflection.report.total_responses, 1);
  assert.equal(reflection.report.engagement_rate, 1.0);
});

// ── Shelf integration test ──

test('engine.buildShelf ranks tasks with narrator-produced headlines', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  // Create two tasks
  startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_shelf_weak',
    goal: 'Review weak',
    routeInputs: { repository_slug: 'test/repo', pull_request_number: '1' },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T12:00:00.000Z',
  });

  startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_shelf_strong',
    goal: 'Review strong',
    routeInputs: { repository_path: '/tmp/repo' },
    capabilityProfile: strongProfile(),
    now: '2026-03-17T12:01:00.000Z',
  });

  const tasks = [
    store.load('task_shelf_weak'),
    store.load('task_shelf_strong'),
  ];

  const shelf = engine.buildShelf({ tasks });

  assert.equal(shelf.length, 2);
  // Weak route task should rank higher (upgrade available = strong fit)
  assert.equal(shelf[0].task_id, 'task_shelf_weak');
  assert.equal(shelf[0].environment_fit, 'strong');
  assert.ok(shelf[0].headline.includes('repository review'));
  assert.equal(shelf[1].task_id, 'task_shelf_strong');
  assert.equal(shelf[1].environment_fit, 'neutral');
});

// ── applyInsight tests ──

test('applyInsight rejects when confidence below threshold', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  const result = engine.applyInsight({
    type: 'template_effectiveness',
    suggestion: { target: 'templates.onStart', confidence: 0.3, proposed: null },
  });

  assert.equal(result.applied, false);
  assert.ok(result.reason.includes('below threshold'));
});

test('applyInsight rejects when no suggestion', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  const result = engine.applyInsight({
    type: 'template_effectiveness',
  });

  assert.equal(result.applied, false);
  assert.ok(result.reason.includes('No suggestion'));
});

test('applyInsight applies intent coverage patterns', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  const result = engine.applyInsight({
    type: 'intent_coverage',
    suggestion: {
      action: 'add_patterns',
      patterns: ['scan this project'],
      taskType: 'review_repository',
      confidence: 0.8,
    },
  });

  assert.equal(result.applied, true);
  assert.equal(result.target, 'definitions');

  // Verify the pattern was added
  const resolution = engine.resolveIntent('scan this project');
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.taskType, 'review_repository');
});

// ── Narration contract validation test ──

test('narrator output passes contract validation (narrationOutput schema)', () => {
  const store = new TaskStore();
  const engine = createMomentumEngine({ taskStore: store });

  const started = startReviewRepositoryTask({
    taskStore: store,
    taskId: 'task_contract_validation',
    goal: 'Validate contracts',
    routeInputs: { repository_slug: 'test/repo', pull_request_number: '60' },
    capabilityProfile: weakProfile(),
    now: '2026-03-17T13:00:00.000Z',
    narrator: engine.narrator,
    observer: engine.observer,
  });

  // The narration was produced by the narrator which now validates against the schema
  // If we got here without throwing, the contract passed
  assert.ok(started.narration);
  assert.equal(typeof started.narration.headline, 'string');
  assert.ok(started.narration.strength);
  assert.ok(Array.isArray(started.narration.findings));
});
