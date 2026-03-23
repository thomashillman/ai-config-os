/**
 * Atom 7: Unified observation read model tests
 *
 * TDD tests for loading and aggregating observations from all sources:
 * - Merge order (consistent loading from multiple sources)
 * - Time sorting (if timestamps available)
 * - Limit behavior (cap on returned events)
 * - Summary counts across mixed fixtures
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadObservationSnapshot } from '../../../runtime/lib/observation-read-model.mjs';

function createTempDir() {
  const dir = join(tmpdir(), `observation-model-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

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
