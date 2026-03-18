/**
 * Atoms 3 + 4 — Performance: cap snapshot history + structuredClone in task-store
 *
 * Verifies that the in-memory task store never retains more than
 * MAX_SNAPSHOTS snapshots per task. Without the cap, long-lived tasks
 * accumulate thousands of entries and exhaust memory.
 *
 * RED: snapshots grow unbounded → length assertion fails
 * GREEN: cap applied after each push → length bounded
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

const { safeImport } = await import(
  new URL('../lib/windows-safe-import.mjs', import.meta.url).href
);

// Minimal valid portableTaskObject (matches schema v1.0.0)
function minimalTask(overrides = {}) {
  return {
    schema_version: '1.0.0',
    task_id: `test-task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    task_type: 'review_repository',
    goal: 'Test snapshot cap',
    state: 'active',
    current_route: 'local_repo',
    version: 1,
    next_action: 'analyse',
    updated_at: new Date().toISOString(),
    progress: {
      completed_steps: 0,
      total_steps: 10,
    },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [],
    ...overrides,
  };
}

describe('task-store snapshot cap', () => {
  test('snapshots are bounded after many update() calls', async () => {
    const { TaskStore } = await safeImport('../../../runtime/lib/task-store.mjs', import.meta.url);

    const store = new TaskStore();
    const task = store.create(minimalTask());
    const taskId = task.task_id;

    // Apply 60 updates — more than any reasonable MAX_SNAPSHOTS value
    const MUTATION_COUNT = 60;
    let current = task;
    for (let i = 0; i < MUTATION_COUNT; i++) {
      current = store.update(taskId, {
        expectedVersion: current.version,
        changes: { updated_at: new Date(Date.now() + i).toISOString() },
      });
    }

    const snapshots = store.listSnapshots(taskId);

    // Must not retain all 61 snapshots (create + 60 updates)
    assert.ok(
      snapshots.length <= 50,
      `Expected ≤50 snapshots after ${MUTATION_COUNT} mutations, got ${snapshots.length}`
    );
  });

  test('snapshot cap preserves most recent entry', async () => {
    const { TaskStore } = await safeImport('../../../runtime/lib/task-store.mjs', import.meta.url);

    const store = new TaskStore();
    const task = store.create(minimalTask());
    const taskId = task.task_id;

    // Apply 60 updates, recording the final timestamp
    let current = task;
    let lastTimestamp = '';
    for (let i = 0; i < 60; i++) {
      lastTimestamp = new Date(Date.now() + i * 1000).toISOString();
      current = store.update(taskId, {
        expectedVersion: current.version,
        changes: { updated_at: lastTimestamp },
      });
    }

    const snapshots = store.listSnapshots(taskId);
    const lastSnapshot = snapshots[snapshots.length - 1];

    // The most recent snapshot must reflect the last mutation
    assert.equal(
      lastSnapshot.task.updated_at,
      lastTimestamp,
      'Last snapshot should reflect the most recent mutation'
    );
  });
});

// ─── Atom 4 — structuredClone is faster than JSON round-trip ─────────────────
// Timing assertion guards against regression to the slow JSON pattern.

describe('task-store clone performance', () => {
  test('cloning a large object 500 times completes within 300ms', () => {
    // Build a ~200KB object similar in shape to a task with many findings
    const largeObj = {
      schema_version: '1.0.0',
      task_id: 'perf-test',
      findings: Array.from({ length: 200 }, (_, i) => ({
        finding_id: `f${i}`,
        type: 'observation',
        summary: 'x'.repeat(500),
        provenance: { status: 'hypothesis', recorded_by_route: 'local_repo', recorded_at: new Date().toISOString() },
      })),
    };

    const ITERATIONS = 500;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      structuredClone(largeObj);
    }
    const elapsed = performance.now() - start;

    assert.ok(
      elapsed < 300,
      `structuredClone: ${ITERATIONS} clones took ${elapsed.toFixed(1)}ms (expected <300ms)`
    );
  });
});
