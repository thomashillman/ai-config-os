/**
 * Tests for ExecutionSelectionDiagnosticSink
 *
 * Validates:
 * - Recording selection decisions with bounded diagnostic contract
 * - Bounded contract enforcement (no full execution_selection storage)
 * - Path safety and validation
 * - Retrieving selection history for a task
 * - Retrieving specific selection diagnostics
 * - JSONL append-only semantics
 * - Directory creation and error handling
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, readFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { ExecutionSelectionDiagnosticSink } from "../../../runtime/lib/execution-selection-diagnostic-sink.mjs";

function createTempDir() {
  const dir = join(
    tmpdir(),
    `execution-selection-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createMockExecutionSelection() {
  return {
    selected_route: {
      route_id: "route_claude_native",
      route_kind: "native_claude",
      effective_capabilities: {
        artifact_completeness: "repo_complete",
        history_availability: "repo_history",
        locality_confidence: "high",
        verification_ceiling: "permissive",
        allowed_task_classes: ["analysis", "implementation"],
      },
    },
    resolved_model_path: {
      provider: "anthropic",
      model_id: "claude-opus-4",
      model_tier: "premium",
      execution_mode: "native",
      cost_basis: "cost_heavy",
      reliability_margin: "high_margin",
      latency_risk: "interactive_safe",
    },
    fallback_chain: [
      {
        route_id: "route_fallback_api",
        route_kind: "api_fallback",
        resolved_model_path: {
          provider: "anthropic",
          model_id: "claude-sonnet-3",
          model_tier: "standard",
          execution_mode: "api",
        },
        fallback_reason_class: "resource_exhaustion",
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
      latency_posture: "low",
      cost_posture: "cost_balanced",
      fallback_used: false,
    },
  };
}

function createMockRouteCandidate() {
  return {
    route_id: "route_claude_native",
    route_kind: "native_claude",
  };
}

function createMockModelCandidate() {
  return {
    provider: "anthropic",
    model_id: "claude-opus-4",
    model_tier: "premium",
    execution_mode: "native",
    cost_basis: "cost_heavy",
    reliability_margin: "high_margin",
    latency_risk: "interactive_safe",
  };
}

test("ExecutionSelectionDiagnosticSink: constructor creates base directory", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);

  assert.equal(sink.baseDir, tempDir);
  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: recordSelection writes JSONL entry", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "task-123";
  const timestamp = "2026-04-03T10:00:00Z";

  sink.recordSelection(selection, {
    taskId,
    captureReason: "development",
    timestamp,
    routeCandidates: [createMockRouteCandidate()],
    modelCandidates: [createMockModelCandidate()],
  });

  // Verify file was created and contains bounded contract
  const history = sink.retrieveSelectionHistory(taskId);
  assert.ok(history.length > 0);
  const entry = history[0];

  assert.equal(entry.task_id, taskId);
  assert.equal(entry.capture_reason, "development");
  assert.ok(entry.selection_revision);
  assert.equal(entry.recorded_at, timestamp);

  // Verify bounded contract - no full execution_selection
  assert.equal(entry.execution_selection, undefined);

  // Verify bounded fields exist
  assert.ok(Array.isArray(entry.route_candidate_summaries));
  assert.ok(Array.isArray(entry.model_candidate_summaries));
  assert.ok(entry.selected_pair_summary);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: recordSelection includes bounded diagnostic fields", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "task-456";

  sink.recordSelection(selection, {
    taskId,
    captureReason: "replay_validation",
    timestamp: new Date().toISOString(),
    routeCandidates: [createMockRouteCandidate()],
    modelCandidates: [createMockModelCandidate()],
  });

  const history = sink.retrieveSelectionHistory(taskId);
  const entry = history[0];

  // Verify selected_pair_summary has only required fields
  assert.equal(entry.selected_pair_summary.route_id, "route_claude_native");
  assert.equal(entry.selected_pair_summary.route_kind, "native_claude");
  assert.equal(entry.selected_pair_summary.provider, "anthropic");
  assert.equal(entry.selected_pair_summary.model_id, "claude-opus-4");
  assert.equal(entry.selected_pair_summary.model_tier, "premium");
  assert.equal(entry.selected_pair_summary.execution_mode, "native");

  // Verify route candidate summaries
  assert.equal(entry.route_candidate_summaries[0].route_id, "route_claude_native");
  assert.equal(entry.route_candidate_summaries[0].route_kind, "native_claude");

  // Verify model candidate summaries
  assert.ok(entry.model_candidate_summaries[0].provider);
  assert.ok(entry.model_candidate_summaries[0].model_id);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: capture_reason must be one of allowed values", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "task-reason-test";

  // Valid reasons
  const validReasons = ["development", "replay_validation", "targeted_troubleshooting"];
  for (const reason of validReasons) {
    assert.doesNotThrow(() => {
      sink.recordSelection(selection, {
        taskId: `${taskId}-${reason}`,
        captureReason: reason,
      });
    });
  }

  // Invalid reason
  assert.throws(() => {
    sink.recordSelection(selection, {
      taskId: `${taskId}-invalid`,
      captureReason: "invalid_reason",
    });
  }, /captureReason must be one of/);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: retrieveSelectionHistory returns empty for missing task", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);

  const history = sink.retrieveSelectionHistory("nonexistent-task");

  assert.deepEqual(history, []);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: retrieveSelectionDiagnostics returns bounded diagnostic entries", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "task-diag-test";

  sink.recordSelection(selection, {
    taskId,
    captureReason: "development",
    timestamp: new Date().toISOString(),
  });

  // Retrieve diagnostics
  const selectionRevision =
    sink.retrieveSelectionHistory(taskId)[0].selection_revision;
  const diagnostics = sink.retrieveSelectionDiagnostics(
    taskId,
    selectionRevision,
  );

  assert.equal(diagnostics.task_id, taskId);
  assert.equal(diagnostics.selection_revision, selectionRevision);
  assert.ok(Array.isArray(diagnostics.entries));
  assert.ok(diagnostics.entries.length > 0);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: handles multiple selections per task", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const taskId = "task-multi";

  const selection1 = createMockExecutionSelection();
  const selection2 = {
    ...createMockExecutionSelection(),
    resolved_model_path: {
      ...createMockExecutionSelection().resolved_model_path,
      model_id: "claude-sonnet-3",
    },
  };

  sink.recordSelection(selection1, {
    taskId,
    captureReason: "development",
    timestamp: new Date().toISOString(),
  });

  sink.recordSelection(selection2, {
    taskId,
    captureReason: "replay_validation",
    timestamp: new Date().toISOString(),
  });

  const history = sink.retrieveSelectionHistory(taskId);

  // Both selections should be recorded
  assert.ok(history.length >= 1);
  // Verify no full execution_selection is stored
  assert.ok(history.every((e) => e.execution_selection === undefined));

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: rejects invalid parameters", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();

  assert.throws(() => {
    sink.recordSelection(null, { taskId: "task-1", captureReason: "development" });
  }, /executionSelection must be a non-null object/);

  assert.throws(() => {
    sink.recordSelection(selection, null);
  }, /context must be a non-null object/);

  assert.throws(() => {
    sink.recordSelection(selection, { captureReason: "development" });
  }, /taskId must be a non-empty string/);

  assert.throws(() => {
    sink.retrieveSelectionHistory("");
  }, /taskId must be a non-empty string/);

  assert.throws(() => {
    sink.retrieveSelectionDiagnostics("task-1", "");
  }, /selectionRevision must be a non-empty string/);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: handles malformed JSONL lines gracefully", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const taskId = "task-malformed";

  // Record a valid selection
  const selection = createMockExecutionSelection();
  sink.recordSelection(selection, {
    taskId,
    captureReason: "development",
    timestamp: new Date().toISOString(),
  });

  // Manually append malformed line
  const taskDir = join(tempDir, taskId);
  const filePath = join(
    taskDir,
    `${sink.retrieveSelectionHistory(taskId)[0].selection_revision}.jsonl`,
  );
  appendFileSync(filePath, "not valid json\n");
  appendFileSync(filePath, '{"partial": "entry"}\n');

  // Should skip malformed lines and return valid entries
  const history = sink.retrieveSelectionHistory(taskId);
  assert.ok(history.length > 0);
  // Verify bounded contract - no full execution_selection
  assert.equal(history[0].execution_selection, undefined);
  assert.ok(history[0].selected_pair_summary);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: rejects path traversal in taskId", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();

  const evilTaskIds = [
    "../../etc/passwd",
    "task/../../../etc/passwd",
    "task/..\\..\\..\\windows\\system32",
  ];

  for (const evilTaskId of evilTaskIds) {
    assert.throws(() => {
      sink.recordSelection(selection, {
        taskId: evilTaskId,
        captureReason: "development",
      });
    }, /path traversal detected/);
  }

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: rejects path traversal in selection_revision", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "safe-task-id";

  const evilRevisions = [
    "../../etc/passwd",
    "rev/../../../secret",
  ];

  for (const evilRev of evilRevisions) {
    assert.throws(() => {
      sink.recordSelection(selection, {
        taskId,
        selectionRevision: evilRev,
        captureReason: "development",
      });
    }, /path traversal detected/);
  }

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: stored records must use bounded diagnostic contract", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "task-contract-test";

  sink.recordSelection(selection, {
    taskId,
    captureReason: "development",
  });

  const history = sink.retrieveSelectionHistory(taskId);
  const entry = history[0];

  // Prohibited fields must not exist
  assert.equal(entry.execution_selection, undefined, "full execution_selection must not be stored");
  assert.equal(entry.selection_reason, undefined, "prose selection_reason must not be stored");
  assert.equal(entry.selection_basis, undefined, "selection_basis must not be stored");
  assert.equal(entry.evaluation, undefined, "evaluation must not be stored");
  assert.equal(entry.metadata, undefined, "metadata must not be stored");
  assert.equal(entry.fallback_chain, undefined, "full fallback_chain must not be stored");

  // Required bounded fields must exist
  assert.ok(entry.task_id, "task_id is required");
  assert.ok(entry.selection_revision, "selection_revision is required");
  assert.ok(entry.capture_reason, "capture_reason is required");
  assert.ok(entry.recorded_at, "recorded_at is required");
  assert.ok(entry.route_candidate_summaries !== undefined, "route_candidate_summaries is required");
  assert.ok(entry.model_candidate_summaries !== undefined, "model_candidate_summaries is required");
  assert.ok(entry.selected_pair_summary, "selected_pair_summary is required");

  rmSync(tempDir, { recursive: true, force: true });
});
