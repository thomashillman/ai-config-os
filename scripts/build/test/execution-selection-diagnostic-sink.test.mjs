/**
 * Tests for ExecutionSelectionDiagnosticSink
 *
 * Validates:
 * - Recording selection decisions to JSONL files
 * - Recording evaluation outcomes
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
    },
    fallback_chain: [
      {
        route_id: "route_fallback_api",
        route_kind: "api_fallback",
        priority: 1,
        policy: "standard",
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
    selection_reason: "cheapest_valid_pair_with_margin",
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
    taskType: "implementation",
    timestamp,
    reason: "initial_selection",
  });

  // Verify file was created
  const history = sink.retrieveSelectionHistory(taskId);
  assert.ok(history.length > 0);
  assert.equal(history[0].task_id, taskId);
  assert.equal(history[0].execution_selection.selected_route.route_id, "route_claude_native");
  assert.equal(history[0].recorded_at, timestamp);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: recordSelection includes evaluation context", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "task-456";

  sink.recordSelection(selection, {
    taskId,
    taskType: "research",
    timestamp: new Date().toISOString(),
    reason: "policy_driven_selection",
  });

  const history = sink.retrieveSelectionHistory(taskId);
  const entry = history[0];

  assert.ok(entry.selection_digest);
  assert.ok(entry.selection_revision);
  assert.deepEqual(entry.metadata.policy_intent, selection.selection_basis);
  assert.ok(entry.metadata.route_compatibility_projection);
  assert.ok(entry.metadata.fallback_policy);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: recordSelectionEvaluation appends to file", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "task-789";

  // Record initial selection
  sink.recordSelection(selection, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "initial",
  });

  // Record evaluation outcome
  sink.recordSelectionEvaluation(selection, {
    taskId,
    success: true,
    duration_ms: 245,
    routes_evaluated: 3,
    models_considered: 12,
    routes_admitted: 2,
    models_admitted: 8,
    reason: "evaluation_successful",
    timestamp: new Date().toISOString(),
  });

  // Retrieve and verify both entries exist
  const history = sink.retrieveSelectionHistory(taskId);
  assert.equal(history.length, 2);
  assert.ok(!history[0].type || history[0].type === "selection");
  assert.equal(history[1].type, "evaluation_result");

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: retrieveSelectionHistory returns empty for missing task", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);

  const history = sink.retrieveSelectionHistory("nonexistent-task");

  assert.deepEqual(history, []);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: retrieveSelectionDiagnostics returns aggregated data", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();
  const taskId = "task-diag-test";

  sink.recordSelection(selection, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "test",
  });

  sink.recordSelectionEvaluation(selection, {
    taskId,
    success: true,
    duration_ms: 150,
    routes_evaluated: 5,
    models_considered: 10,
    routes_admitted: 3,
    models_admitted: 7,
  });

  // Retrieve diagnostics
  const selectionRevision = sink.retrieveSelectionHistory(taskId)[0].selection_revision;
  const diagnostics = sink.retrieveSelectionDiagnostics(taskId, selectionRevision);

  assert.equal(diagnostics.task_id, taskId);
  assert.equal(diagnostics.selection_revision, selectionRevision);
  assert.equal(diagnostics.summary.total_entries, 2);
  assert.ok(diagnostics.summary.selection_entry);
  assert.equal(diagnostics.summary.evaluations.length, 1);
  assert.equal(diagnostics.summary.evaluations[0].duration_ms, 150);

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
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "first",
  });

  sink.recordSelection(selection2, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "second",
  });

  const history = sink.retrieveSelectionHistory(taskId);

  // Both selections should be recorded
  assert.ok(history.length >= 1);
  assert.ok(history.some((e) => e.execution_selection?.resolved_model_path?.model_id === "claude-opus-4"));
  assert.ok(history.some((e) => e.execution_selection?.resolved_model_path?.model_id === "claude-sonnet-3"));

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionDiagnosticSink: rejects invalid parameters", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const selection = createMockExecutionSelection();

  assert.throws(
    () => {
      sink.recordSelection(null, { taskId: "task-1", reason: "test" });
    },
    /executionSelection must be a non-null object/,
  );

  assert.throws(
    () => {
      sink.recordSelection(selection, null);
    },
    /context must be a non-null object/,
  );

  assert.throws(
    () => {
      sink.recordSelection(selection, { taskType: "impl" });
    },
    /context.taskId is required/,
  );

  assert.throws(
    () => {
      sink.retrieveSelectionHistory("");
    },
    /taskId is required/,
  );

  assert.throws(
    () => {
      sink.retrieveSelectionDiagnostics("task-1", "");
    },
    /selectionRevision is required/,
  );

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
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "test",
  });

  // Manually append malformed line
  const taskDir = join(tempDir, taskId);
  const filePath = join(taskDir, `${sink.retrieveSelectionHistory(taskId)[0].selection_revision}.jsonl`);
  appendFileSync(filePath, "not valid json\n");
  appendFileSync(filePath, '{"partial": "entry without all fields"}\n');

  // Should skip malformed lines and return valid entry
  const history = sink.retrieveSelectionHistory(taskId);
  assert.ok(history.length > 0);
  assert.ok(history[0].execution_selection);

  rmSync(tempDir, { recursive: true, force: true });
});
