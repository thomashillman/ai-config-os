// Tests for runtime/lib/task-store-core.mjs
//
// Uses minimal stubs for all injected dependencies so tests remain pure
// (no dist/ access, no external I/O) and run in Phase 1 (parallel).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTaskStoreClass,
  TaskConflictError,
  TaskNotFoundError,
} from "../../../runtime/lib/task-store-core.mjs";

// ─── Stubs ────────────────────────────────────────────────────────────────────

class StubProgressEventStore {
  constructor() {
    this.events = [];
  }
  append(event) {
    this.events.push(event);
  }
  listByTaskId(taskId) {
    return this.events.filter((e) => e.taskId === taskId);
  }
}

function stubTransitionPortableTaskState({
  task,
  nextState,
  nextAction,
  updatedAt,
  progress,
}) {
  return {
    ...task,
    state: nextState ?? task.state,
    next_action: nextAction ?? task.next_action,
    updated_at: updatedAt ?? task.updated_at,
    progress: progress ?? task.progress,
    version: task.version + 1,
  };
}

function stubAppendRouteSelection({ task, routeId, selectedAt }) {
  return {
    ...task,
    current_route: routeId,
    route_history: [...(task.route_history || []), routeId],
    updated_at: selectedAt,
    version: task.version + 1,
  };
}

function stubAppendFindingToTask({ task, finding, updatedAt }) {
  const newFinding = {
    finding_id: finding.finding_id || `f_${task.findings.length + 1}`,
    description: finding.description || "",
    provenance: {
      status: "hypothesis",
      recorded_by_route: task.current_route,
      ...finding.provenance,
    },
  };
  return {
    ...task,
    findings: [...task.findings, newFinding],
    updated_at: updatedAt,
    version: task.version + 1,
  };
}

function stubTransitionFindingsForRouteUpgrade({ findings, toRouteId }) {
  return findings.map((f) => ({
    ...f,
    provenance: { ...f.provenance, recorded_by_route: toRouteId },
  }));
}

function stubCreateHandoffTokenService() {
  return { verifyToken() {}, consumeToken() {} };
}

const BASE_DEPS = {
  transitionPortableTaskState: stubTransitionPortableTaskState,
  appendRouteSelection: stubAppendRouteSelection,
  appendFindingToTask: stubAppendFindingToTask,
  transitionFindingsForRouteUpgrade: stubTransitionFindingsForRouteUpgrade,
  ProgressEventStore: StubProgressEventStore,
  createHandoffTokenService: stubCreateHandoffTokenService,
};

function makeTaskStore(overrides = {}) {
  const TaskStore = createTaskStoreClass({ ...BASE_DEPS, ...overrides });
  return new TaskStore();
}

function makeTask(overrides = {}) {
  return {
    task_id: "task-001",
    task_type: "review_repository",
    state: "active",
    current_route: "github_pr",
    next_action: "review",
    goal: "Analyse the repo",
    version: 1,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    route_history: [],
    findings: [],
    progress: { total_steps: 4, completed_steps: 0 },
    ...overrides,
  };
}

// ─── createTaskStoreClass — dependency validation ─────────────────────────────

describe("createTaskStoreClass — required dependency validation", () => {
  const requiredDeps = [
    "transitionPortableTaskState",
    "appendRouteSelection",
    "appendFindingToTask",
    "transitionFindingsForRouteUpgrade",
    "ProgressEventStore",
    "createHandoffTokenService",
  ];

  for (const depName of requiredDeps) {
    test(`throws when ${depName} is missing`, () => {
      const deps = { ...BASE_DEPS };
      delete deps[depName];
      assert.throws(() => createTaskStoreClass(deps), /must be provided/);
    });
  }
});

// ─── TaskStore.create ─────────────────────────────────────────────────────────

describe("TaskStore.create", () => {
  test("stores task and returns a clone with correct task_id", () => {
    const store = makeTaskStore();
    const result = store.create(makeTask());
    assert.equal(result.task_id, "task-001");
  });

  test("returned value is a clone — mutating original does not affect store", () => {
    const store = makeTaskStore();
    const task = makeTask();
    store.create(task);
    task.goal = "mutated";
    assert.equal(store.load("task-001").goal, "Analyse the repo");
  });

  test("creates initial snapshot on create", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const snapshots = store.listSnapshots("task-001");
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].snapshot_version, 1);
    assert.equal(snapshots[0].task_id, "task-001");
  });

  test("throws TaskConflictError when task already exists", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    assert.throws(() => store.create(makeTask()), TaskConflictError);
  });
});

// ─── TaskStore.load ───────────────────────────────────────────────────────────

describe("TaskStore.load", () => {
  test("returns a clone of the stored task", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const loaded = store.load("task-001");
    assert.equal(loaded.task_id, "task-001");
    assert.equal(loaded.goal, "Analyse the repo");
  });

  test("returned load is a clone — mutating it does not affect store", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const loaded = store.load("task-001");
    loaded.goal = "mutated";
    assert.equal(store.load("task-001").goal, "Analyse the repo");
  });

  test("throws TaskNotFoundError for unknown taskId", () => {
    const store = makeTaskStore();
    assert.throws(() => store.load("nonexistent"), TaskNotFoundError);
  });
});

// ─── TaskStore.update ─────────────────────────────────────────────────────────

describe("TaskStore.update", () => {
  test("merges changes and increments version", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const result = store.update("task-001", {
      expectedVersion: 1,
      changes: { goal: "Updated" },
    });
    assert.equal(result.version, 2);
    assert.equal(result.goal, "Updated");
  });

  test("throws TaskConflictError on version mismatch", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    assert.throws(
      () => store.update("task-001", { expectedVersion: 99, changes: {} }),
      TaskConflictError,
    );
  });

  test("throws TaskNotFoundError for unknown taskId", () => {
    const store = makeTaskStore();
    assert.throws(
      () => store.update("nonexistent", { expectedVersion: 1, changes: {} }),
      TaskNotFoundError,
    );
  });

  test("appends a snapshot on each update", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    store.update("task-001", { expectedVersion: 1, changes: { goal: "v2" } });
    store.update("task-001", { expectedVersion: 2, changes: { goal: "v3" } });
    assert.equal(store.listSnapshots("task-001").length, 3);
  });
});

// ─── TaskStore.transitionState ────────────────────────────────────────────────

describe("TaskStore.transitionState", () => {
  test("transitions state via stub and emits state_change progress event", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const result = store.transitionState("task-001", {
      expectedVersion: 1,
      nextState: "complete",
      updatedAt: "2024-02-01T00:00:00Z",
    });
    assert.equal(result.state, "complete");
    const events = store.listProgressEvents("task-001");
    assert.ok(
      events.some((e) => e.type === "state_change"),
      "should emit state_change event",
    );
  });

  test("emitted state_change event has correct metadata", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    store.transitionState("task-001", {
      expectedVersion: 1,
      nextState: "paused",
      updatedAt: "2024-02-01T00:00:00Z",
    });
    const events = store.listProgressEvents("task-001");
    const stateEvent = events.find((e) => e.type === "state_change");
    assert.equal(stateEvent.metadata.next_state, "paused");
  });

  test("throws TaskConflictError on version mismatch", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    assert.throws(
      () =>
        store.transitionState("task-001", {
          expectedVersion: 99,
          nextState: "complete",
        }),
      TaskConflictError,
    );
  });

  test("throws TaskNotFoundError for unknown taskId", () => {
    const store = makeTaskStore();
    assert.throws(
      () =>
        store.transitionState("nonexistent", {
          expectedVersion: 1,
          nextState: "complete",
        }),
      TaskNotFoundError,
    );
  });
});

// ─── TaskStore.appendFinding ──────────────────────────────────────────────────

describe("TaskStore.appendFinding", () => {
  test("appends finding to task and emits finding_recorded event", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const result = store.appendFinding("task-001", {
      expectedVersion: 1,
      finding: { finding_id: "f-001", description: "Found an issue" },
      updatedAt: "2024-02-01T00:00:00Z",
    });
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].finding_id, "f-001");
    const events = store.listProgressEvents("task-001");
    assert.ok(events.some((e) => e.type === "finding_recorded"));
  });

  test("finding_recorded event includes finding_id in metadata", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    store.appendFinding("task-001", {
      expectedVersion: 1,
      finding: { finding_id: "f-abc" },
      updatedAt: "2024-02-01T00:00:00Z",
    });
    const events = store.listProgressEvents("task-001");
    const findingEvent = events.find((e) => e.type === "finding_recorded");
    assert.equal(findingEvent.metadata.finding_id, "f-abc");
  });

  test("throws TaskConflictError on version mismatch", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    assert.throws(
      () =>
        store.appendFinding("task-001", {
          expectedVersion: 99,
          finding: {},
          updatedAt: "",
        }),
      TaskConflictError,
    );
  });

  test("throws TaskNotFoundError for unknown taskId", () => {
    const store = makeTaskStore();
    assert.throws(
      () =>
        store.appendFinding("nonexistent", {
          expectedVersion: 1,
          finding: {},
          updatedAt: "",
        }),
      TaskNotFoundError,
    );
  });
});

// ─── TaskStore.selectRoute ────────────────────────────────────────────────────

describe("TaskStore.selectRoute", () => {
  test("updates current_route and emits route_selected event", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const result = store.selectRoute("task-001", {
      routeId: "local_repo",
      expectedVersion: 1,
      selectedAt: "2024-03-01T00:00:00Z",
    });
    assert.equal(result.current_route, "local_repo");
    const events = store.listProgressEvents("task-001");
    assert.ok(events.some((e) => e.type === "route_selected"));
  });

  test("route_selected event has correct route_id in metadata", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    store.selectRoute("task-001", {
      routeId: "local_repo",
      expectedVersion: 1,
      selectedAt: "2024-03-01T00:00:00Z",
    });
    const events = store.listProgressEvents("task-001");
    const routeEvent = events.find((e) => e.type === "route_selected");
    assert.equal(routeEvent.metadata.route_id, "local_repo");
  });

  test("throws TaskConflictError on version mismatch", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    assert.throws(
      () =>
        store.selectRoute("task-001", {
          routeId: "x",
          expectedVersion: 99,
          selectedAt: "",
        }),
      TaskConflictError,
    );
  });

  test("throws TaskNotFoundError for unknown taskId", () => {
    const store = makeTaskStore();
    assert.throws(
      () =>
        store.selectRoute("nonexistent", {
          routeId: "x",
          expectedVersion: 1,
          selectedAt: "",
        }),
      TaskNotFoundError,
    );
  });
});

// ─── TaskStore.listProgressEvents ─────────────────────────────────────────────

describe("TaskStore.listProgressEvents", () => {
  test("returns empty array for task with no events", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    assert.deepEqual(store.listProgressEvents("task-001"), []);
  });

  test("throws TaskNotFoundError for unknown taskId", () => {
    const store = makeTaskStore();
    assert.throws(
      () => store.listProgressEvents("nonexistent"),
      TaskNotFoundError,
    );
  });

  test("returns events scoped to the correct task", () => {
    const store = makeTaskStore();
    store.create(makeTask({ task_id: "task-A" }));
    store.create(makeTask({ task_id: "task-B" }));
    store.transitionState("task-A", {
      expectedVersion: 1,
      nextState: "paused",
      updatedAt: "",
    });
    assert.equal(store.listProgressEvents("task-A").length, 1);
    assert.equal(store.listProgressEvents("task-B").length, 0);
  });
});

// ─── TaskStore.listSnapshots / getSnapshot ────────────────────────────────────

describe("TaskStore.listSnapshots", () => {
  test("throws TaskNotFoundError for unknown task", () => {
    const store = makeTaskStore();
    assert.throws(() => store.listSnapshots("nonexistent"), TaskNotFoundError);
  });

  test("snapshot has schema_version, task_id, and snapshot_version", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const [snap] = store.listSnapshots("task-001");
    assert.ok("schema_version" in snap);
    assert.equal(snap.task_id, "task-001");
    assert.equal(snap.snapshot_version, 1);
  });
});

describe("TaskStore.getSnapshot", () => {
  test("retrieves snapshot by version number", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    const snap = store.getSnapshot("task-001", 1);
    assert.equal(snap.snapshot_version, 1);
    assert.equal(snap.task_id, "task-001");
  });

  test("throws TaskNotFoundError for non-existent snapshot version", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    assert.throws(() => store.getSnapshot("task-001", 999), TaskNotFoundError);
  });

  test("throws TaskNotFoundError for unknown task", () => {
    const store = makeTaskStore();
    assert.throws(() => store.getSnapshot("nonexistent", 1), TaskNotFoundError);
  });
});

// ─── maxSnapshots enforcement ─────────────────────────────────────────────────

describe("maxSnapshots", () => {
  test("caps snapshot count to maxSnapshots, keeping most recent", () => {
    const store = makeTaskStore({ maxSnapshots: 2 });
    store.create(makeTask()); // version 1
    store.update("task-001", { expectedVersion: 1, changes: { goal: "v2" } }); // version 2
    store.update("task-001", { expectedVersion: 2, changes: { goal: "v3" } }); // version 3
    const snapshots = store.listSnapshots("task-001");
    assert.equal(snapshots.length, 2, "should keep only 2 snapshots");
    assert.ok(snapshots.some((s) => s.snapshot_version === 2));
    assert.ok(snapshots.some((s) => s.snapshot_version === 3));
    assert.ok(
      !snapshots.some((s) => s.snapshot_version === 1),
      "oldest snapshot should be evicted",
    );
  });

  test("no cap when maxSnapshots is not set", () => {
    const store = makeTaskStore();
    store.create(makeTask());
    store.update("task-001", { expectedVersion: 1, changes: {} });
    store.update("task-001", { expectedVersion: 2, changes: {} });
    assert.equal(store.listSnapshots("task-001").length, 3);
  });
});

// ─── Error class identity ─────────────────────────────────────────────────────

describe("TaskConflictError and TaskNotFoundError re-exports", () => {
  test("TaskConflictError is an Error subclass with correct code", () => {
    const err = new TaskConflictError("conflict", { taskId: "t1" });
    assert.ok(err instanceof Error);
    assert.equal(err.code, "task_version_conflict");
    assert.equal(err.name, "TaskConflictError");
  });

  test("TaskNotFoundError is an Error subclass with correct code", () => {
    const err = new TaskNotFoundError("t1");
    assert.ok(err instanceof Error);
    assert.equal(err.code, "task_not_found");
    assert.equal(err.name, "TaskNotFoundError");
  });
});
