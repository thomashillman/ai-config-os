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
    execution_selection_schema_version: "1.0.0",
    selected_route: {
      route_id: "github_pr",
      route_kind: "pull_request",
      effective_capabilities: {
        artifact_completeness: "repo_complete",
        history_availability: "repo_history",
        locality_confidence: "high",
        verification_ceiling: "moderate",
        allowed_task_classes: ["review_repository", "analyze_code"],
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
      route_contract_version: "1.0.0",
      model_policy_version: "1.0.0",
      resolver_version: "1.0.0",
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
    selection_reason: "route: github_pr; model: anthropic/claude-opus; cost: cost_efficient; reliability: above_floor",
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
      ...(event.metadata && { metadata: JSON.parse(JSON.stringify(event.metadata)) }),
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
    assert.equal(events[0].metadata.selection_revision, result.selectionRevision);
  });

  test("updates route_history with selection reference", () => {
    const store = new StubTaskStore();
    const task = makeTask();
    store.tasks.set(task.task_id, task);

    const selection = makeExecutionSelection({
      selected_route: {
        route_id: "claude_direct",
        route_kind: "direct_api",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "high",
          verification_ceiling: "high",
          allowed_task_classes: ["analyze_code"],
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
        route_kind: "test",
        effective_capabilities: {
          artifact_completeness: "repo_complete",
          history_availability: "repo_history",
          locality_confidence: "high",
          verification_ceiling: "high",
          allowed_task_classes: ["analyze_code"],
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
    assert.equal(updated.execution_selections[0].selected_at, "2024-01-02T00:00:00Z");
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
});
