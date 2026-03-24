/**
 * Atom 7 + 20: Observation read model tests
 *
 * TDD tests for two complementary functions:
 * 1. loadObservationSnapshot: loading and aggregating observations from all sources
 * 2. summarizeObservations: computing engagement and upgrade metrics from Momentum events
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadObservationSnapshot, summarizeObservations } from '../../../runtime/lib/observation-read-model.mjs';
import { ProgressEventStore } from '../../../runtime/lib/progress-event-pipeline.mjs';
import { MomentumObserver } from '../../../runtime/lib/momentum-observer.mjs';

function createTempDir() {
  const dir = join(tmpdir(), `observation-model-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function taskSnapshot(overrides = {}) {
  return {
    task_id: 'task_review_001',
    current_route: 'pasted_diff',
    state: 'active',
    findings: [],
    version: 2,
    ...overrides,
  };
}

function narratorOutput() {
  return {
    headline: 'Starting repository review',
    progress: null,
    strength: { level: 'limited', label: 'Diff-only review', description: 'test' },
    next_action: 'Collect findings',
    upgrade: null,
    findings: [],
  };
}

// loadObservationSnapshot tests
test('loadObservationSnapshot: returns empty events and zero summary when no sources exist', async () => {
  const tempDir = createTempDir();
  const result = await loadObservationSnapshot({ home: tempDir });

  assert.deepEqual(result.events, []);
  assert.ok(result.summary);
  assert.equal(result.summary.total_events, 0);
  assert.equal(result.summary.tool_error_count, 0);

  rmSync(tempDir, { recursive: true, force: true });
});

test('loadObservationSnapshot: loads bootstrap telemetry events when present', async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, '.ai-config-os', 'logs');
  mkdirSync(logsDir, { recursive: true });

  const logFile = join(logsDir, 'bootstrap-claude.jsonl');
  writeFileSync(logFile, JSON.stringify({
    phase: 'resolve_provider',
    provider: 'claude',
    duration_ms: 5,
    result: 'ok',
    error_code: null,
    deferred: false,
  }) + '\n', 'utf8');

  const result = await loadObservationSnapshot({ home: tempDir });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, 'bootstrap_phase');
  assert.equal(result.summary.total_events, 1);
  assert.equal(result.summary.bootstrap_success_count, 1);
  assert.equal(result.summary.bootstrap_error_count, 0);

  rmSync(tempDir, { recursive: true, force: true });
});

test('loadObservationSnapshot: counts bootstrap errors in summary', async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, '.ai-config-os', 'logs');
  mkdirSync(logsDir, { recursive: true });

  const logFile = join(logsDir, 'bootstrap-claude.jsonl');
  const successEvent = JSON.stringify({
    phase: 'resolve_provider',
    provider: 'claude',
    duration_ms: 5,
    result: 'ok',
    error_code: null,
    deferred: false,
  });
  const errorEvent = JSON.stringify({
    phase: 'worker_package_fetch',
    provider: 'claude',
    duration_ms: 100,
    result: 'error',
    error_code: 'WORKER_PACKAGE_NOT_PUBLISHED',
    deferred: false,
  });

  writeFileSync(logFile, `${successEvent}\n${errorEvent}\n`, 'utf8');

  const result = await loadObservationSnapshot({ home: tempDir });

  assert.equal(result.events.length, 2);
  assert.equal(result.summary.total_events, 2);
  assert.equal(result.summary.bootstrap_success_count, 1);
  assert.equal(result.summary.bootstrap_error_count, 1);

  rmSync(tempDir, { recursive: true, force: true });
});

test('loadObservationSnapshot: respects limit parameter', async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, '.ai-config-os', 'logs');
  mkdirSync(logsDir, { recursive: true });

  const logFile = join(logsDir, 'bootstrap-claude.jsonl');
  const events = [];
  for (let i = 0; i < 10; i++) {
    events.push(JSON.stringify({
      phase: `phase_${i}`,
      provider: 'claude',
      duration_ms: i,
      result: 'ok',
      error_code: null,
      deferred: false,
    }));
  }
  writeFileSync(logFile, events.join('\n') + '\n', 'utf8');

  const result = await loadObservationSnapshot({ home: tempDir, limit: 5 });

  assert.equal(result.events.length, 5, 'should respect limit parameter');
  assert.equal(result.summary.total_events, 5);

  rmSync(tempDir, { recursive: true, force: true });
});

test('loadObservationSnapshot: returns basic summary structure', async () => {
  const tempDir = createTempDir();
  const result = await loadObservationSnapshot({ home: tempDir });

  assert.ok(result.summary);
  assert.ok('total_events' in result.summary);
  assert.ok('tool_usage_count' in result.summary);
  assert.ok('tool_error_count' in result.summary);
  assert.ok('skill_outcome_count' in result.summary);
  assert.ok('bootstrap_success_count' in result.summary);
  assert.ok('bootstrap_error_count' in result.summary);
  assert.ok('loop_suspected_count' in result.summary);

  rmSync(tempDir, { recursive: true, force: true });
});

// summarizeObservations tests
test('summarizeObservations computes narration_engagement_rate', async (t) => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  // Record 3 narrations: 2 engaged, 1 ignored
  const n1 = observer.recordNarration({
    taskId: 'task_review_001',
    narrationPoint: 'onStart',
    templateVersion: '1.0.0',
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  observer.recordResponse({
    taskId: 'task_review_001',
    narrationEventId: n1.event_id,
    responseType: 'engaged',
    timeToActionMs: 2000,
  });

  // Add a small delay to avoid timestamp collision in event ID generation
  await new Promise(resolve => setTimeout(resolve, 1));

  const n2 = observer.recordNarration({
    taskId: 'task_review_001',
    narrationPoint: 'onFindingEvolved',
    templateVersion: '1.0.0',
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  observer.recordResponse({
    taskId: 'task_review_001',
    narrationEventId: n2.event_id,
    responseType: 'follow_up',
    timeToActionMs: 1500,
    followUpText: 'test',
  });

  await new Promise(resolve => setTimeout(resolve, 1));

  const n3 = observer.recordNarration({
    taskId: 'task_review_001',
    narrationPoint: 'onShelfView',
    templateVersion: '1.0.0',
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  observer.recordResponse({
    taskId: 'task_review_001',
    narrationEventId: n3.event_id,
    responseType: 'ignored',
  });

  const summary = summarizeObservations({ store, taskId: 'task_review_001' });

  assert.equal(summary.total_narrations, 3);
  // Only the first response is 'engaged'; the other two are 'follow_up' and 'ignored'
  assert.equal(summary.total_engaged, 1);
  assert.equal(Math.round(summary.narration_engagement_rate * 100), 33);
});

test('summarizeObservations computes upgrade_acceptance_rate from onUpgradeAvailable narrations', () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  // Record upgrade proposal that was accepted
  const u1 = observer.recordNarration({
    taskId: 'task_review_002',
    narrationPoint: 'onUpgradeAvailable',
    templateVersion: '1.0.0',
    narratorOutput: { ...narratorOutput(), upgrade: { reason: 'test' } },
    taskSnapshot: taskSnapshot({ task_id: 'task_review_002' }),
  });

  observer.recordResponse({
    taskId: 'task_review_002',
    narrationEventId: u1.event_id,
    responseType: 'accepted_upgrade',
    timeToActionMs: 3000,
  });

  // Record non-upgrade narrations to test that only upgrade points count
  const n1 = observer.recordNarration({
    taskId: 'task_review_002',
    narrationPoint: 'onStart',
    templateVersion: '1.0.0',
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot({ task_id: 'task_review_002' }),
  });

  observer.recordResponse({
    taskId: 'task_review_002',
    narrationEventId: n1.event_id,
    responseType: 'engaged',
    timeToActionMs: 2000,
  });

  const summary = summarizeObservations({ store, taskId: 'task_review_002' });

  // Total narrations includes both upgrade and non-upgrade
  assert.equal(summary.total_narrations, 2);
  // Engagement includes both
  assert.equal(summary.total_engaged, 1);
  // Upgrade metrics only count upgrade proposals
  assert.equal(summary.total_upgrade_proposals, 1);
  assert.equal(summary.total_upgrades_accepted, 1);
  assert.equal(Math.round(summary.upgrade_acceptance_rate * 100), 100);
});

test('summarizeObservations handles empty observations', () => {
  const store = new ProgressEventStore();

  const summary = summarizeObservations({ store, taskId: 'task_nonexistent' });

  assert.equal(summary.total_narrations, 0);
  assert.equal(summary.total_engaged, 0);
  assert.equal(summary.narration_engagement_rate, 0);
  assert.equal(summary.total_upgrade_proposals, 0);
  assert.equal(summary.total_upgrades_accepted, 0);
  assert.equal(summary.upgrade_acceptance_rate, 0);
});

test('summarizeObservations includes both engagement and upgrade metrics', async (t) => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  const n1 = observer.recordNarration({
    taskId: 'task_review_003',
    narrationPoint: 'onStart',
    templateVersion: '1.0.0',
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot({ task_id: 'task_review_003' }),
  });

  observer.recordResponse({
    taskId: 'task_review_003',
    narrationEventId: n1.event_id,
    responseType: 'engaged',
    timeToActionMs: 2000,
  });

  await new Promise(resolve => setTimeout(resolve, 1));

  const u1 = observer.recordNarration({
    taskId: 'task_review_003',
    narrationPoint: 'onUpgradeAvailable',
    templateVersion: '1.0.0',
    narratorOutput: { ...narratorOutput(), upgrade: { reason: 'test' } },
    taskSnapshot: taskSnapshot({ task_id: 'task_review_003' }),
  });

  observer.recordResponse({
    taskId: 'task_review_003',
    narrationEventId: u1.event_id,
    responseType: 'accepted_upgrade',
    timeToActionMs: 1500,
  });

  const summary = summarizeObservations({ store, taskId: 'task_review_003' });

  // Engagement counts all narrations
  assert.equal(summary.total_narrations, 2);
  assert.equal(summary.total_engaged, 1);
  assert.equal(Math.round(summary.narration_engagement_rate * 100), 50);

  // Upgrade counts only onUpgradeAvailable narrations
  assert.equal(summary.total_upgrade_proposals, 1);
  assert.equal(summary.total_upgrades_accepted, 1);
  assert.equal(Math.round(summary.upgrade_acceptance_rate * 100), 100);
});
