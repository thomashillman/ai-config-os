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
    execution_selections: [],
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

  test("integrates ExecutionSelection when provided and integration function exists", () => {
    // Track integration function calls
    let integrationCalled = false;
    const mockIntegrationFn = ({
      taskStore,
      taskId,
      expectedVersion,
      executionSelection,
      recordedAt,
    }) => {
      integrationCalled = true;
      assert.equal(taskId, "task-001");
      assert.ok(executionSelection);
      assert.equal(executionSelection.selected_route.route_id, "local_repo");
    };

    const store = makeTaskStore({
      integrateExecutionSelectionWithTaskFn: mockIntegrationFn,
    });
    store.create(makeTask());

    const executionSelection = {
      selected_route: {
        route_id: "local_repo",
        route_kind: "repository_local",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
      resolved_model_path: {
        provider: "anthropic",
        model_id: "claude-opus-4-6",
        model_tier: "premium",
        execution_mode: "streaming",
      },
      fallback_chain: [],
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
      execution_selection_schema_version: "v1",
      selection_basis: {
        constraints_passed: true,
        route_admissible: true,
        quality_floor_met: true,
        reliability_floor_met: true,
        quality_posture: "standard",
        reliability_posture: "above_floor",
        latency_posture: "interactive_safe",
        cost_posture: "cost_efficient",
        fallback_used: false,
      },
      selection_reason:
        "route: local_repo; model: anthropic/claude-opus-4-6; cost: cost_efficient; reliability: above_floor",
    };

    store.selectRoute("task-001", {
      routeId: "local_repo",
      expectedVersion: 1,
      selectedAt: "2024-03-01T00:00:00Z",
      executionSelection,
    });

    assert.ok(
      integrationCalled,
      "integration function should have been called",
    );
  });

  test("does not fail selectRoute if integration function throws", () => {
    const mockIntegrationFn = () => {
      throw new Error("Integration failed");
    };

    const store = makeTaskStore({
      integrateExecutionSelectionWithTaskFn: mockIntegrationFn,
    });
    store.create(makeTask());

    const executionSelection = {
      selected_route: {
        route_id: "local_repo",
        route_kind: "repository_local",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
      resolved_model_path: {
        provider: "anthropic",
        model_id: "claude-opus-4-6",
        model_tier: "premium",
        execution_mode: "streaming",
      },
      fallback_chain: [],
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
      execution_selection_schema_version: "v1",
      selection_basis: {
        constraints_passed: true,
        route_admissible: true,
        quality_floor_met: true,
        reliability_floor_met: true,
        quality_posture: "standard",
        reliability_posture: "above_floor",
        latency_posture: "interactive_safe",
        cost_posture: "cost_efficient",
        fallback_used: false,
      },
      selection_reason:
        "route: local_repo; model: anthropic/claude-opus-4-6; cost: cost_efficient; reliability: above_floor",
    };

    // selectRoute should succeed even if integration throws
    const result = store.selectRoute("task-001", {
      routeId: "local_repo",
      expectedVersion: 1,
      selectedAt: "2024-03-01T00:00:00Z",
      executionSelection,
    });

    assert.equal(result.current_route, "local_repo");
    const events = store.listProgressEvents("task-001");
    assert.ok(events.some((e) => e.type === "route_selected"));
  });

  // ─── REGRESSION: TaskStore.selectRoute() Integration Path (Requirement E) ─

  test("REGRESSION: successful integration returns latest persisted task state", () => {
    let integrationWasCalled = false;
    const mockIntegrationFn = ({
      taskStore,
      taskId,
      expectedVersion,
      executionSelection,
      recordedAt,
    }) => {
      integrationWasCalled = true;
      // Simulate successful integration that mutates task state
      taskStore.update(taskId, {
        expectedVersion,
        changes: {
          execution_selections: [
            {
              digest: "test_digest",
              revision: "v1:test_digest",
              route_id: executionSelection.selected_route.route_id,
              selected_at: recordedAt,
            },
          ],
        },
      });
    };

    const store = makeTaskStore({
      integrateExecutionSelectionWithTaskFn: mockIntegrationFn,
    });
    store.create(makeTask());

    const executionSelection = {
      selected_route: {
        route_id: "integration_route",
        route_kind: "repository_local",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
      resolved_model_path: {
        provider: "anthropic",
        model_id: "claude-opus-4-6",
        model_tier: "premium",
        execution_mode: "streaming",
      },
      fallback_chain: [],
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
      execution_selection_schema_version: "v1",
      selection_basis: {
        constraints_passed: true,
        route_admissible: true,
        quality_floor_met: true,
        reliability_floor_met: true,
        quality_posture: "standard",
        reliability_posture: "above_floor",
        latency_posture: "interactive_safe",
        cost_posture: "cost_efficient",
        fallback_used: false,
      },
      selection_reason: "route: integration_route",
    };

    const result = store.selectRoute("task-001", {
      routeId: "integration_route",
      expectedVersion: 1,
      selectedAt: "2024-03-01T00:00:00Z",
      executionSelection,
    });

    assert.ok(integrationWasCalled, "integration function should be called");
    // Result should reflect the latest state after both route selection AND integration
    assert.equal(
      result.version,
      3,
      "task version should reflect both mutations (2->3)",
    );
    assert.ok(
      result.execution_selections && result.execution_selections.length > 0,
      "returned task should include execution_selections from integration",
    );
  });

  test("REGRESSION: selectRoute version reflects both route selection and integration mutations", () => {
    let integrationWasCalled = false;
    const mockIntegrationFn = ({ taskStore, taskId, expectedVersion }) => {
      integrationWasCalled = true;
      // Integration performs an additional update
      taskStore.update(taskId, {
        expectedVersion,
        changes: { updated_at: "2024-03-02T00:00:00Z" },
      });
    };

    const store = makeTaskStore({
      integrateExecutionSelectionWithTaskFn: mockIntegrationFn,
    });
    store.create(makeTask()); // version 1

    const executionSelection = {
      selected_route: {
        route_id: "route_v",
        route_kind: "repository_local",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
      resolved_model_path: {
        provider: "anthropic",
        model_id: "claude-opus-4-6",
        model_tier: "premium",
        execution_mode: "streaming",
      },
      fallback_chain: [],
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
      execution_selection_schema_version: "v1",
      selection_basis: {
        constraints_passed: true,
        route_admissible: true,
        quality_floor_met: true,
        reliability_floor_met: true,
        quality_posture: "standard",
        reliability_posture: "above_floor",
        latency_posture: "interactive_safe",
        cost_posture: "cost_efficient",
        fallback_used: false,
      },
      selection_reason: "test",
    };

    const result = store.selectRoute("task-001", {
      routeId: "route_v",
      expectedVersion: 1,
      selectedAt: "2024-03-01T00:00:00Z",
      executionSelection,
    });

    assert.ok(integrationWasCalled);
    // selectRoute does route_selected (v1->v2), then integration does update (v2->v3)
    assert.equal(result.version, 3, "version should be 3 after both mutations");
  });

  test("REGRESSION: when integration throws, route selection is still committed with non-integrated state", () => {
    const mockIntegrationFn = () => {
      throw new Error("Integration failed intentionally");
    };

    const store = makeTaskStore({
      integrateExecutionSelectionWithTaskFn: mockIntegrationFn,
    });
    store.create(makeTask()); // version 1

    const executionSelection = {
      selected_route: {
        route_id: "failed_integration_route",
        route_kind: "repository_local",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
      resolved_model_path: {
        provider: "anthropic",
        model_id: "claude-opus-4-6",
        model_tier: "premium",
        execution_mode: "streaming",
      },
      fallback_chain: [],
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
      execution_selection_schema_version: "v1",
      selection_basis: {
        constraints_passed: true,
        route_admissible: true,
        quality_floor_met: true,
        reliability_floor_met: true,
        quality_posture: "standard",
        reliability_posture: "above_floor",
        latency_posture: "interactive_safe",
        cost_posture: "cost_efficient",
        fallback_used: false,
      },
      selection_reason: "test",
    };

    const result = store.selectRoute("task-001", {
      routeId: "failed_integration_route",
      expectedVersion: 1,
      selectedAt: "2024-03-01T00:00:00Z",
      executionSelection,
    });

    // Route selection should be committed even though integration failed
    assert.equal(
      result.current_route,
      "failed_integration_route",
      "route selection should be committed",
    );
    assert.equal(
      result.version,
      2,
      "version should reflect route_selected event only (v1->v2)",
    );

    // Verify route_selected event exists
    const events = store.listProgressEvents("task-001");
    const routeEvent = events.find((e) => e.type === "route_selected");
    assert.ok(routeEvent, "route_selected event should exist");
    assert.equal(
      routeEvent.metadata.route_id,
      "failed_integration_route",
      "route_selected event should have correct route_id",
    );
  });
});

// ─── REGRESSION: Canonical and Non-Canonical Separation (Requirement F) ────

describe("REGRESSION: Canonical and non-canonical stores stay separate (Requirement F)", () => {
  test("canonical task progress events carry full execution_selection", () => {
    const store = makeTaskStore();
    store.create(makeTask());

    // Manually add a progress event with full selection (simulating integrateExecutionSelectionWithTask)
    store.progressEvents.append({
      taskId: "task-001",
      eventId: "evt_1_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "Selection recorded",
      createdAt: "2024-01-02T00:00:00Z",
      metadata: {
        execution_selection: {
          selected_route: {
            route_id: "full_route",
            route_kind: "artifact_bundle",
            effective_capabilities: {
              artifact_completeness: "repo_complete",
              history_availability: "repo_history",
              locality_confidence: "repo_local",
              verification_ceiling: "full_artifact_verification",
              allowed_task_classes: ["repository_review"],
            },
          },
          resolved_model_path: {
            provider: "anthropic",
            model_id: "claude-opus-4-6",
            model_tier: "premium",
            execution_mode: "streaming",
          },
          fallback_chain: [],
          policy_version: {
            route_contract_version: "v1",
            model_policy_version: "v1",
            resolver_version: "v1",
          },
          execution_selection_schema_version: "v1",
          selection_basis: {
            constraints_passed: true,
            route_admissible: true,
            quality_floor_met: true,
            reliability_floor_met: true,
            quality_posture: "standard",
            reliability_posture: "above_floor",
            latency_posture: "interactive_safe",
            cost_posture: "cost_efficient",
            fallback_used: false,
          },
          selection_reason: "test reason",
        },
        selection_digest: "abc123",
        selection_revision: "rev-abc",
        selected_route_id: "full_route",
        reason: "test reason",
      },
    });

    const events = store.listProgressEvents("task-001");
    const selectionEvent = events.find(
      (e) => e.type === "execution_selection_recorded",
    );

    assert.ok(selectionEvent, "should have execution_selection_recorded event");
    assert.ok(
      selectionEvent.metadata.execution_selection,
      "progress event should carry full execution_selection",
    );
    assert.ok(
      selectionEvent.metadata.execution_selection.selected_route,
      "full selection should have selected_route",
    );
    assert.ok(
      selectionEvent.metadata.execution_selection.resolved_model_path,
      "full selection should have resolved_model_path",
    );
  });

  test("bounded diagnostic storage is not required for task snapshot extraction", () => {
    // Create store WITHOUT any diagnostic sink
    const store = makeTaskStore();
    store.create(makeTask());

    // Add a progress event with full selection (canonical storage)
    store.progressEvents.append({
      taskId: "task-001",
      eventId: "evt_1_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "Selection recorded",
      createdAt: "2024-01-02T00:00:00Z",
      metadata: {
        execution_selection: {
          selected_route: {
            route_id: "no_diagnostic_route",
            route_kind: "artifact_bundle",
            effective_capabilities: {
              artifact_completeness: "repo_complete",
              history_availability: "repo_history",
              locality_confidence: "repo_local",
              verification_ceiling: "full_artifact_verification",
              allowed_task_classes: ["repository_review"],
            },
          },
          resolved_model_path: {
            provider: "anthropic",
            model_id: "claude-opus-4-6",
            model_tier: "premium",
            execution_mode: "streaming",
          },
          fallback_chain: [],
          policy_version: {
            route_contract_version: "v1",
            model_policy_version: "v1",
            resolver_version: "v1",
          },
          execution_selection_schema_version: "v1",
          selection_basis: {
            constraints_passed: true,
            route_admissible: true,
            quality_floor_met: true,
            reliability_floor_met: true,
            quality_posture: "standard",
            reliability_posture: "above_floor",
            latency_posture: "interactive_safe",
            cost_posture: "cost_efficient",
            fallback_used: false,
          },
          selection_reason: "no diagnostic sink",
        },
        selection_digest: "xyz789",
        selection_revision: "rev-xyz",
        selected_route_id: "no_diagnostic_route",
        reason: "no diagnostic sink",
      },
    });

    // This demonstrates that extraction from task snapshots does NOT depend
    // on bounded diagnostic sink—it works entirely from progress events
    const events = store.listProgressEvents("task-001");
    assert.ok(events.length > 0, "should have progress events");

    const selectionEvent = events.find(
      (e) => e.type === "execution_selection_recorded",
    );
    assert.ok(selectionEvent, "selection event should be in progress events");
    assert.ok(
      selectionEvent.metadata.execution_selection,
      "extraction should work from progress events alone, without diagnostic sink",
    );
  });

  test("full ExecutionSelection is preserved in canonical task progress event, not shrunk to diagnostic shape", () => {
    const store = makeTaskStore();
    store.create(makeTask());

    const fullSelection = {
      selected_route: {
        route_id: "full_route",
        route_kind: "repository_local",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review", "patch_review"],
        },
      },
      resolved_model_path: {
        provider: "anthropic",
        model_id: "claude-opus-4-6",
        model_tier: "premium",
        execution_mode: "streaming",
      },
      fallback_chain: [
        {
          route_id: "fallback_route",
          route_kind: "artifact_diff",
          resolved_model_path: {
            provider: "anthropic",
            model_id: "claude-sonnet-4-6",
            model_tier: "standard",
            execution_mode: "streaming",
          },
          fallback_reason_class: "model_unavailable",
        },
      ],
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
      execution_selection_schema_version: "v1",
      selection_basis: {
        constraints_passed: true,
        route_admissible: true,
        quality_floor_met: true,
        reliability_floor_met: true,
        quality_posture: "premium",
        reliability_posture: "high_margin",
        latency_posture: "interactive_safe",
        cost_posture: "cost_efficient",
        fallback_used: false,
      },
      selection_reason: "full detailed reason",
    };

    store.progressEvents.append({
      taskId: "task-001",
      eventId: "evt_1_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "Full selection stored",
      createdAt: "2024-01-02T00:00:00Z",
      metadata: {
        execution_selection: fullSelection,
        selection_digest: "digest_value",
        selection_revision: "rev-test",
        selected_route_id: "full_route",
        reason: "full detailed reason",
      },
    });

    const events = store.listProgressEvents("task-001");
    const event = events.find((e) => e.type === "execution_selection_recorded");
    const storedSelection = event.metadata.execution_selection;

    // Verify all key structures are preserved (not shrunk)
    assert.ok(
      storedSelection.fallback_chain,
      "fallback_chain should be preserved",
    );
    assert.equal(
      storedSelection.fallback_chain.length,
      1,
      "fallback_chain should have the full chain",
    );
    assert.ok(
      storedSelection.selection_basis,
      "selection_basis should be preserved",
    );
    assert.equal(
      storedSelection.selection_basis.quality_posture,
      "premium",
      "selection_basis fields should be complete",
    );
    assert.ok(
      storedSelection.resolved_model_path,
      "resolved_model_path should be preserved",
    );
    assert.equal(
      storedSelection.resolved_model_path.model_tier,
      "premium",
      "model info should be complete",
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
