// Tests for runtime/lib/execution-selection-task-integration.mjs
//
// Tests the integration of ExecutionSelection with TaskStore.
// Uses stubs for TaskStore to remain pure and allow parallel execution.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  integrateExecutionSelectionWithTask,
  resolveExecutionSelectionForTask,
  extractExecutionSelectionFromTaskSnapshot,
} from "../../../runtime/lib/execution-selection-task-integration.mjs";

// ─── Test Data ────────────────────────────────────────────────────────────────

function makeExecutionSelection(overrides = {}) {
  return {
    execution_selection_schema_version: "v1",
    selected_route: {
      route_id: "github_pr",
      route_kind: "repository_remote",
      effective_capabilities: {
        artifact_completeness: "repo_complete",
        history_availability: "repo_history",
        locality_confidence: "repo_remote_bound",
        verification_ceiling: "partial_artifact_verification",
        allowed_task_classes: ["patch_review", "artifact_review"],
      },
    },
    resolved_model_path: {
      provider: "anthropic",
      model_id: "claude-opus",
      model_tier: "premium",
      execution_mode: "streaming",
    },
    fallback_chain: [],
    policy_version: {
      route_contract_version: "v1",
      model_policy_version: "v1",
      resolver_version: "v1",
    },
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
      "route: github_pr; model: anthropic/claude-opus; cost: cost_efficient; reliability: above_floor",
    ...overrides,
  };
}

// Stub TaskStore that mimics the real one
class StubTaskStore {
  constructor() {
    this.tasks = new Map();
    this.progressEvents = new StubProgressEventStore();
  }

  load(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return JSON.parse(JSON.stringify(task));
  }

  update(taskId, { expectedVersion, changes }) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    if (task.version !== expectedVersion) {
      throw new Error(
        `Version conflict: expected ${expectedVersion}, got ${task.version}`,
      );
    }
    const updated = {
      ...task,
      ...changes,
      version: task.version + 1,
    };
    this.tasks.set(taskId, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  listProgressEvents(taskId) {
    return this.progressEvents.listByTaskId(taskId);
  }
}

class StubProgressEventStore {
  constructor() {
    this.events = [];
  }

  append(event) {
    const createdEvent = {
      schema_version: "1.0.0",
      task_id: event.taskId,
      event_id: event.eventId,
      type: event.type,
      message: event.message,
      created_at: event.createdAt,
      ...(event.metadata && {
        metadata: JSON.parse(JSON.stringify(event.metadata)),
      }),
    };
    this.events.push(createdEvent);
    return createdEvent;
  }

  listByTaskId(taskId) {
    return this.events
      .filter((e) => e.task_id === taskId)
      .map((e) => JSON.parse(JSON.stringify(e)));
  }
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
    schema_version: "1.0.0",
    unresolved_questions: [],
    approvals: [],
    ...overrides,
  };
}

// ─── integrateExecutionSelectionWithTask ────────────────────────────────────

describe("integrateExecutionSelectionWithTask", () => {
  test("throws when taskStore is missing", () => {
    assert.throws(() => {
      integrateExecutionSelectionWithTask({
        taskStore: null,
        taskId: "task-001",
        expectedVersion: 1,
        executionSelection: makeExecutionSelection(),
      });
    }, /taskStore must be a valid TaskStore instance/);
  });

  test("throws when taskId is missing", () => {
    const store = new StubTaskStore();
    assert.throws(() => {
      integrateExecutionSelectionWithTask({
        taskStore: store,
        taskId: "",
        expectedVersion: 1,
        executionSelection: makeExecutionSelection(),
      });
    }, /taskId is required/);
  });

  test("throws when executionSelection is missing", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);
    assert.throws(() => {
      integrateExecutionSelectionWithTask({
        taskStore: store,
        taskId: task.task_id,
        expectedVersion: 1,
        executionSelection: null,
      });
    }, /executionSelection must be a non-null object/);
  });

  test("throws on version conflict", () => {
    const store = new StubTaskStore();
    const task = makeTask({ version: 2 });
    store.tasks.set(task.task_id, task);
    assert.throws(() => {
      integrateExecutionSelectionWithTask({
        taskStore: store,
        taskId: task.task_id,
        expectedVersion: 1,
        executionSelection: makeExecutionSelection(),
      });
    }, /Version conflict/);
  });

  test("records execution selection in progress events", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();
    const result = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    assert.ok(result.selectionDigest, "selectionDigest should be computed");
    assert.ok(result.selectionRevision, "selectionRevision should be computed");
    assert.equal(result.taskId, task.task_id);
    assert.equal(result.newTaskVersion, 2);

    // Verify event was recorded
    const events = store.listProgressEvents(task.task_id);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "execution_selection_recorded");
    assert.ok(events[0].metadata.execution_selection);
    assert.equal(events[0].metadata.selection_digest, result.selectionDigest);
    assert.equal(
      events[0].metadata.selection_revision,
      result.selectionRevision,
    );
  });

  test("updates route_history with selection reference", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      selected_route: {
        route_id: "claude_direct",
        route_kind: "repository_local",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
    });

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const updated = store.load(task.task_id);
    assert.equal(updated.route_history.length, 1);
    assert.equal(updated.route_history[0].route, "claude_direct");
    assert.ok(updated.route_history[0].selection_reference);
    assert.ok(updated.route_history[0].selection_reference.digest);
    assert.ok(updated.route_history[0].selection_reference.revision);
  });

  test("appends to execution_selections audit trail", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      selected_route: {
        route_id: "test_route",
        route_kind: "artifact_bundle",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
    });

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const updated = store.load(task.task_id);
    assert.equal(updated.execution_selections.length, 1);
    assert.equal(updated.execution_selections[0].route_id, "test_route");
    assert.ok(updated.execution_selections[0].digest);
    assert.ok(updated.execution_selections[0].revision);
    assert.equal(
      updated.execution_selections[0].selected_at,
      "2024-01-02T00:00:00Z",
    );
  });
});

// ─── resolveExecutionSelectionForTask ────────────────────────────────────────

describe("resolveExecutionSelectionForTask", () => {
  test("throws when taskStore is missing", () => {
    assert.throws(() => {
      resolveExecutionSelectionForTask({
        taskStore: null,
        taskId: "task-001",
        taskType: "review_repository",
        policyContext: {},
        routeCandidates: [],
        modelCandidates: [],
        resolveExecutionSelection: () => ({}),
      });
    }, /taskStore must be a valid TaskStore instance/);
  });

  test("throws when routeCandidates is empty", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    assert.throws(() => {
      resolveExecutionSelectionForTask({
        taskStore: store,
        taskId: task.task_id,
        taskType: "review_repository",
        policyContext: {},
        routeCandidates: [],
        modelCandidates: [{ model_id: "m1" }],
        resolveExecutionSelection: () => ({}),
      });
    }, /routeCandidates must be a non-empty array/);
  });

  test("throws when task type mismatch", () => {
    const store = new StubTaskStore();
    const task = makeTask({ task_type: "code_review" });
    store.tasks.set(task.task_id, task);

    assert.throws(() => {
      resolveExecutionSelectionForTask({
        taskStore: store,
        taskId: task.task_id,
        taskType: "review_repository",
        policyContext: {},
        routeCandidates: [{ route_id: "r1" }],
        modelCandidates: [{ model_id: "m1" }],
        resolveExecutionSelection: () => ({}),
      });
    }, /Task type mismatch/);
  });

  test("calls resolver with proper constraints", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    let resolverInput = null;
    const mockResolver = (input) => {
      resolverInput = input;
      return {
        execution_selection: makeExecutionSelection(),
        selection_success: true,
      };
    };

    resolveExecutionSelectionForTask({
      taskStore: store,
      taskId: task.task_id,
      taskType: "review_repository",
      policyContext: {
        minimum_quality_floor: "premium",
        minimum_reliability_floor: "high_margin",
      },
      routeCandidates: [{ route_id: "r1" }],
      modelCandidates: [{ model_id: "m1" }],
      resolveExecutionSelection: mockResolver,
    });

    assert.ok(resolverInput);
    assert.equal(
      resolverInput.policy_constraints.minimum_quality_floor,
      "premium",
    );
    assert.equal(
      resolverInput.policy_constraints.minimum_reliability_floor,
      "high_margin",
    );
  });

  test("returns error when resolver fails", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const mockResolver = () => ({
      error: "no_valid_pairs",
      reason: "No pairs met constraints",
    });

    const result = resolveExecutionSelectionForTask({
      taskStore: store,
      taskId: task.task_id,
      taskType: "review_repository",
      policyContext: {},
      routeCandidates: [{ route_id: "r1" }],
      modelCandidates: [{ model_id: "m1" }],
      resolveExecutionSelection: mockResolver,
    });

    assert.equal(result.error, "no_valid_pairs");
    assert.ok(result.reason);
  });
});

// ─── extractExecutionSelectionFromTaskSnapshot ───────────────────────────────

describe("extractExecutionSelectionFromTaskSnapshot", () => {
  test("throws when taskStore is missing", () => {
    assert.throws(() => {
      extractExecutionSelectionFromTaskSnapshot({
        taskStore: null,
        taskId: "task-001",
      });
    }, /taskStore must be a valid TaskStore instance/);
  });

  test("throws when taskId is missing", () => {
    const store = new StubTaskStore();
    assert.throws(() => {
      extractExecutionSelectionFromTaskSnapshot({
        taskStore: store,
        taskId: "",
      });
    }, /taskId is required/);
  });

  test("returns null when no execution_selection_recorded events exist", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const result = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
    });

    assert.equal(result, null);
  });

  test("extracts ExecutionSelection from latest event", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection1 = makeExecutionSelection({ selection_reason: "first" });
    const selection2 = makeExecutionSelection({ selection_reason: "second" });

    store.progressEvents.append({
      taskId: task.task_id,
      eventId: "evt_1_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "First selection",
      createdAt: "2024-01-01T00:00:00Z",
      metadata: { execution_selection: selection1 },
    });

    store.progressEvents.append({
      taskId: task.task_id,
      eventId: "evt_2_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "Second selection",
      createdAt: "2024-01-02T00:00:00Z",
      metadata: { execution_selection: selection2 },
    });

    const result = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
    });

    assert.ok(result);
    assert.equal(result.selection_reason, "second");
  });

  test("filters by version when provided", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection1 = makeExecutionSelection({ selection_reason: "v1" });
    const selection2 = makeExecutionSelection({ selection_reason: "v2" });

    store.progressEvents.append({
      taskId: task.task_id,
      eventId: "evt_1_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "First",
      createdAt: "2024-01-01T00:00:00Z",
      metadata: { execution_selection: selection1 },
    });

    store.progressEvents.append({
      taskId: task.task_id,
      eventId: "evt_2_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "Second",
      createdAt: "2024-01-02T00:00:00Z",
      metadata: { execution_selection: selection2 },
    });

    const result = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
      version: 1,
    });

    assert.ok(result);
    assert.equal(result.selection_reason, "v1");
  });

  test("does not return future selection with lower version boundary (version-bounded boundary)", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection1 = makeExecutionSelection({ selection_reason: "v1" });
    const selection2 = makeExecutionSelection({ selection_reason: "v2" });
    const selection3 = makeExecutionSelection({ selection_reason: "v3" });

    store.progressEvents.append({
      taskId: task.task_id,
      eventId: "evt_1_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "First",
      createdAt: "2024-01-01T00:00:00Z",
      metadata: { execution_selection: selection1 },
    });

    store.progressEvents.append({
      taskId: task.task_id,
      eventId: "evt_2_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "Second",
      createdAt: "2024-01-02T00:00:00Z",
      metadata: { execution_selection: selection2 },
    });

    store.progressEvents.append({
      taskId: task.task_id,
      eventId: "evt_3_execution_selection_recorded",
      type: "execution_selection_recorded",
      message: "Third",
      createdAt: "2024-01-03T00:00:00Z",
      metadata: { execution_selection: selection3 },
    });

    // Request with version boundary of 2 should get v2, not v3
    const result = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
      version: 2,
    });

    assert.ok(result);
    assert.equal(result.selection_reason, "v2", "should return v2, not v3");
  });
});

// ─── REGRESSION: Canonical Selection Storage ────────────────────────────────

describe("REGRESSION: Canonical selection storage remains intact (Requirement A)", () => {
  test("progress event metadata contains full ExecutionSelection with all fields", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      selected_route: {
        route_id: "test_route_canonical",
        route_kind: "artifact_bundle",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
    });

    const result = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const events = store.listProgressEvents(task.task_id);
    const event = events.find((e) => e.type === "execution_selection_recorded");

    assert.ok(event, "should have execution_selection_recorded event");
    assert.ok(event.metadata, "event should have metadata");
    assert.ok(
      event.metadata.execution_selection,
      "metadata should have full execution_selection",
    );

    // Verify the stored selection is complete and not flattened
    const storedSelection = event.metadata.execution_selection;
    assert.ok(
      storedSelection.selected_route,
      "stored selection should have selected_route",
    );
    assert.ok(
      storedSelection.selected_route.route_id,
      "stored selection should have route_id",
    );
    assert.ok(
      storedSelection.resolved_model_path,
      "stored selection should have resolved_model_path",
    );
    assert.ok(
      storedSelection.fallback_chain,
      "stored selection should have fallback_chain",
    );
    assert.ok(
      storedSelection.policy_version,
      "stored selection should have policy_version",
    );
    assert.ok(
      storedSelection.execution_selection_schema_version,
      "stored selection should have execution_selection_schema_version",
    );
  });

  test("progress event metadata contains selection_digest matching computed identity", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();

    const result = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const events = store.listProgressEvents(task.task_id);
    const event = events.find((e) => e.type === "execution_selection_recorded");

    assert.equal(
      event.metadata.selection_digest,
      result.selectionDigest,
      "event metadata digest should match returned digest",
    );
  });

  test("progress event metadata contains selection_revision matching computed identity", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();

    const result = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const events = store.listProgressEvents(task.task_id);
    const event = events.find((e) => e.type === "execution_selection_recorded");

    assert.equal(
      event.metadata.selection_revision,
      result.selectionRevision,
      "event metadata revision should match returned revision",
    );
  });

  test("progress event metadata contains selected_route_id matching execution_selection.selected_route.route_id", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      selected_route: {
        route_id: "specific_route_x",
        route_kind: "artifact_bundle",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
    });

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const events = store.listProgressEvents(task.task_id);
    const event = events.find((e) => e.type === "execution_selection_recorded");

    assert.equal(
      event.metadata.selected_route_id,
      "specific_route_x",
      "metadata selected_route_id should match selection.selected_route.route_id",
    );
    assert.equal(
      event.metadata.selected_route_id,
      selection.selected_route.route_id,
      "metadata selected_route_id should match selection property",
    );
  });
});

// ─── REGRESSION: Task-State Audit References Alignment ─────────────────────

describe("REGRESSION: Task-state audit references remain aligned (Requirement B)", () => {
  test("route_history entry contains selection_reference.digest matching progress event", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();

    const integrationResult = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const updated = store.load(task.task_id);
    const latestRouteHistory =
      updated.route_history[updated.route_history.length - 1];

    assert.ok(
      latestRouteHistory.selection_reference,
      "route_history should have selection_reference",
    );
    assert.equal(
      latestRouteHistory.selection_reference.digest,
      integrationResult.selectionDigest,
      "route_history.selection_reference.digest should match progress event",
    );
  });

  test("route_history entry contains selection_reference.revision matching progress event", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();

    const integrationResult = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const updated = store.load(task.task_id);
    const latestRouteHistory =
      updated.route_history[updated.route_history.length - 1];

    assert.equal(
      latestRouteHistory.selection_reference.revision,
      integrationResult.selectionRevision,
      "route_history.selection_reference.revision should match progress event",
    );
  });

  test("execution_selections audit entry contains digest matching progress event", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();

    const integrationResult = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const updated = store.load(task.task_id);
    const auditEntry =
      updated.execution_selections[updated.execution_selections.length - 1];

    assert.equal(
      auditEntry.digest,
      integrationResult.selectionDigest,
      "execution_selections audit entry.digest should match progress event",
    );
  });

  test("execution_selections audit entry contains revision matching progress event", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();

    const integrationResult = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const updated = store.load(task.task_id);
    const auditEntry =
      updated.execution_selections[updated.execution_selections.length - 1];

    assert.equal(
      auditEntry.revision,
      integrationResult.selectionRevision,
      "execution_selections audit entry.revision should match progress event",
    );
  });

  test("execution_selections audit entry contains route_id and selected_at", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      selected_route: {
        route_id: "audit_test_route",
        route_kind: "artifact_bundle",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "repo_local",
          verification_ceiling: "full_artifact_verification",
          allowed_task_classes: ["repository_review"],
        },
      },
    });

    const recordedAt = "2024-01-02T00:00:00Z";

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: recordedAt,
    });

    const updated = store.load(task.task_id);
    const auditEntry =
      updated.execution_selections[updated.execution_selections.length - 1];

    assert.equal(
      auditEntry.route_id,
      "audit_test_route",
      "execution_selections audit entry should have route_id",
    );
    assert.equal(
      auditEntry.selected_at,
      recordedAt,
      "execution_selections audit entry should have selected_at timestamp",
    );
  });

  test("all three canonical stores (progress_event, route_history, execution_selections) remain synchronized", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();
    const recordedAt = "2024-01-02T00:00:00Z";

    const integrationResult = integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: recordedAt,
    });

    const events = store.listProgressEvents(task.task_id);
    const progressEvent = events.find(
      (e) => e.type === "execution_selection_recorded",
    );

    const updated = store.load(task.task_id);
    const routeHistoryEntry =
      updated.route_history[updated.route_history.length - 1];
    const auditEntry =
      updated.execution_selections[updated.execution_selections.length - 1];

    // All three should agree on digest
    assert.equal(
      progressEvent.metadata.selection_digest,
      routeHistoryEntry.selection_reference.digest,
      "progress event digest should match route_history digest",
    );
    assert.equal(
      progressEvent.metadata.selection_digest,
      auditEntry.digest,
      "progress event digest should match audit entry digest",
    );

    // All three should agree on revision
    assert.equal(
      progressEvent.metadata.selection_revision,
      routeHistoryEntry.selection_reference.revision,
      "progress event revision should match route_history revision",
    );
    assert.equal(
      progressEvent.metadata.selection_revision,
      auditEntry.revision,
      "progress event revision should match audit entry revision",
    );
  });
});

// ─── REGRESSION: Version Fields Survive Round-Trip Exactly ────────────────

describe("REGRESSION: Version fields survive round-trip exactly (Requirement D)", () => {
  test("execution_selection_schema_version is preserved exactly in stored selection", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      execution_selection_schema_version: "v1",
    });

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const extracted = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
    });

    assert.equal(
      extracted.execution_selection_schema_version,
      "v1",
      "execution_selection_schema_version should survive round-trip",
    );
  });

  test("policy_version.route_contract_version is preserved exactly", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
    });

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const extracted = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
    });

    assert.ok(
      extracted.policy_version,
      "policy_version should exist in extracted selection",
    );
    assert.equal(
      extracted.policy_version.route_contract_version,
      "v1",
      "policy_version.route_contract_version should survive round-trip",
    );
  });

  test("policy_version.model_policy_version is preserved exactly", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
    });

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const extracted = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
    });

    assert.equal(
      extracted.policy_version.model_policy_version,
      "v1",
      "policy_version.model_policy_version should survive round-trip",
    );
  });

  test("policy_version.resolver_version is preserved exactly", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      policy_version: {
        route_contract_version: "v1",
        model_policy_version: "v1",
        resolver_version: "v1",
      },
    });

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const extracted = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
    });

    assert.equal(
      extracted.policy_version.resolver_version,
      "v1",
      "policy_version.resolver_version should survive round-trip",
    );
  });

  test("policy_version object structure is preserved (nested, not flattened)", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection();

    integrateExecutionSelectionWithTask({
      taskStore: store,
      taskId: task.task_id,
      expectedVersion: 1,
      executionSelection: selection,
      recordedAt: "2024-01-02T00:00:00Z",
    });

    const extracted = extractExecutionSelectionFromTaskSnapshot({
      taskStore: store,
      taskId: task.task_id,
    });

    assert.ok(
      typeof extracted.policy_version === "object",
      "policy_version should be an object, not flattened",
    );
    assert.ok(
      extracted.policy_version.route_contract_version,
      "policy_version should be nested structure with fields",
    );
  });
});
