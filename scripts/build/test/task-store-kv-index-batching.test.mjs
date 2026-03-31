/**
 * Atom 6 — Performance: batch _updateIndex reads in KvTaskStore
 *
 * Verifies that calling update() N times on the same KvTaskStore instance
 * reads the KV index at most once (via instance-level cache), rather than
 * N times. Writes still happen per-call via flushIndex().
 *
 * RED: _updateIndex reads KV on every call → N reads for N updates
 * GREEN: index cached in memory → 1 read regardless of N
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { safeImport } = await import(
  new URL("../lib/windows-safe-import.mjs", import.meta.url).href
);

// ─── Mock KV ──────────────────────────────────────────────────────────────────
// Tracks get/put call counts per key.
function createMockKv(initialData = {}) {
  const store = new Map(
    Object.entries(initialData).map(([k, v]) => [k, JSON.stringify(v)]),
  );
  const calls = { get: {}, put: {} };

  return {
    async get(key) {
      calls.get[key] = (calls.get[key] || 0) + 1;
      return store.get(key) ?? null;
    },
    async put(key, value) {
      calls.put[key] = (calls.put[key] || 0) + 1;
      store.set(key, value);
    },
    _calls: calls,
    _store: store,
  };
}

// Minimal valid task fixture (matches portableTaskObject schema v1.0.0)
function makeTask(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: `kv-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    task_type: "review_repository",
    goal: "Test KV index batching",
    state: "active",
    current_route: "local_repo",
    version: 1,
    next_action: "analyse",
    updated_at: new Date().toISOString(),
    progress: { completed_steps: 0, total_steps: 10 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [],
    ...overrides,
  };
}

describe("KvTaskStore index batching", () => {
  test("10 update() calls read the index at most 1 time from KV", async () => {
    const { KvTaskStore } = await safeImport(
      "../../../runtime/lib/task-store-kv.mjs",
      import.meta.url,
    );

    const kv = createMockKv();
    const store = new KvTaskStore(kv);

    // Create task (also uses index internally)
    const task = await store.create(makeTask());
    const taskId = task.task_id;
    const indexKey = "task:index";

    // Reset call counter to measure ONLY update() calls
    kv._calls.get[indexKey] = 0;
    kv._calls.put[indexKey] = 0;

    // Apply 10 updates
    const UPDATE_COUNT = 10;
    let current = task;
    for (let i = 0; i < UPDATE_COUNT; i++) {
      current = await store.update(taskId, {
        expectedVersion: current.version,
        changes: { updated_at: new Date(Date.now() + i).toISOString() },
      });
    }

    const indexGetCalls = kv._calls.get[indexKey] || 0;

    // With cache: only 1 KV read regardless of how many updates
    // Without cache: 10 KV reads (one per _updateIndex call)
    assert.ok(
      indexGetCalls <= 1,
      `Expected at most 1 KV get(indexKey) across 10 updates, got ${indexGetCalls}`,
    );
  });

  test("index is correctly updated after multiple update() calls", async () => {
    const { KvTaskStore } = await safeImport(
      "../../../runtime/lib/task-store-kv.mjs",
      import.meta.url,
    );

    const kv = createMockKv();
    const store = new KvTaskStore(kv);

    const task = await store.create(makeTask());
    const taskId = task.task_id;

    // Make 5 updates
    let current = task;
    let lastTs = "";
    for (let i = 0; i < 5; i++) {
      lastTs = new Date(Date.now() + i * 1000).toISOString();
      current = await store.update(taskId, {
        expectedVersion: current.version,
        changes: { updated_at: lastTs },
      });
    }

    // Verify the index reflects the correct final state
    const recentTasks = await store.listRecentTasks();
    const entry = recentTasks.find((t) => t.task_id === taskId);

    assert.ok(entry, "Task should appear in listRecentTasks");
    assert.equal(
      entry.updated_at,
      lastTs,
      "Index should reflect latest updated_at",
    );
  });

  test("index cap keeps newest 200 tasks, not oldest", async () => {
    const { KvTaskStore } = await safeImport(
      "../../../runtime/lib/task-store-kv.mjs",
      import.meta.url,
    );

    const kv = createMockKv();
    const store = new KvTaskStore(kv);

    const baseMs = Date.now();
    for (let i = 0; i < 210; i++) {
      await store.create(
        makeTask({
          task_id: `cap-${i}`,
          updated_at: new Date(baseMs + i * 1000).toISOString(),
        }),
      );
    }

    const recent = await store.listRecentTasks({ limit: 300 });
    assert.equal(recent.length, 200, "Index should be capped at 200 tasks");
    assert.equal(recent[0].task_id, "cap-209", "Newest task should be first");
    assert.equal(
      recent[199].task_id,
      "cap-10",
      "Oldest retained task should be the 200th newest",
    );
    assert.equal(
      recent.some((item) => item.task_id === "cap-0"),
      false,
      "Oldest overflow tasks should be dropped from index",
    );
  });
});
