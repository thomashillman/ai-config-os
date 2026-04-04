/**
 * Tests for ExecutionSelectionObservationSource
 *
 * Validates:
 * - Loading observations from the diagnostic sink
 * - Summarizing selection statistics
 * - Tracking model and route distribution
 * - Integration with observation-read-model
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { ExecutionSelectionDiagnosticSink } from "../../../runtime/lib/execution-selection-diagnostic-sink.mjs";
import { createExecutionSelectionObservationSource } from "../../../runtime/lib/observation-sources/execution-selection.mjs";

function createTempDir() {
  const dir = join(
    tmpdir(),
    `exec-sel-obs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createMockExecutionSelection(overrides = {}) {
  return {
    selected_route: {
      route_id: overrides.route_id || "route_claude_native",
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
      model_id: overrides.model_id || "claude-opus-4",
      model_tier: "premium",
      execution_mode: "native",
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
    },
  };
}

test("ExecutionSelectionObservationSource: loads observations from sink", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-obs-load";
  const selection = createMockExecutionSelection();

  sink.recordSelection(selection, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "test_load",
  });

  const observations = source.loadObservations(taskId);

  assert.ok(Array.isArray(observations));
  assert.equal(observations.length, 1);
  assert.ok(observations[0].execution_selection);
  assert.equal(observations[0].task_id, taskId);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: summarizes selection statistics", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-summary-stats";
  const selection = createMockExecutionSelection();

  sink.recordSelection(selection, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "initial",
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

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_selections, 1);
  assert.equal(summary.avg_evaluation_time_ms, 150);
  assert.equal(summary.total_evaluations, 1);
  assert.equal(summary.routes_admitted_rate, 0.6); // 3 / 5
  assert.equal(summary.models_admitted_rate, 0.7); // 7 / 10
  assert.ok(summary.most_selected_route);
  assert.equal(summary.most_selected_route, "route_claude_native");
  assert.ok(summary.most_used_model);
  assert.equal(summary.most_used_model, "claude-opus-4");

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: returns empty summary for no observations", () => {
  const tempDir = createTempDir();
  const source = createExecutionSelectionObservationSource(tempDir);

  const summary = source.summarize([]);

  assert.equal(summary.total_selections, 0);
  assert.equal(summary.avg_evaluation_time_ms, 0);
  assert.equal(summary.total_evaluations, 0);
  assert.deepEqual(summary.routes_used, {});
  assert.equal(summary.model_diversity, 0);
  assert.equal(summary.route_diversity, 0);
  assert.equal(summary.fallback_usage_rate, 0);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: tracks model diversity", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-model-diversity";

  const modelIds = ["model-opus", "model-sonnet", "model-haiku"];

  for (const modelId of modelIds) {
    const selection = createMockExecutionSelection({ model_id: modelId });
    sink.recordSelection(selection, {
      taskId,
      taskType: "implementation",
      timestamp: new Date().toISOString(),
      reason: `selection-${modelId}`,
    });
  }

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_selections, 3);
  assert.equal(summary.model_diversity, 3);
  assert.ok(summary.models_used[modelIds[0]]);
  assert.ok(summary.models_used[modelIds[1]]);
  assert.ok(summary.models_used[modelIds[2]]);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: tracks route distribution", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-route-distribution";

  // Record multiple selections with same route
  for (let i = 0; i < 5; i++) {
    const selection = createMockExecutionSelection();
    sink.recordSelection(selection, {
      taskId,
      taskType: "implementation",
      timestamp: new Date().toISOString(),
      reason: `selection-${i}`,
    });
  }

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_selections, 5);
  assert.equal(summary.routes_used["route_claude_native"], 5);
  assert.equal(summary.most_selected_route, "route_claude_native");
  assert.equal(summary.most_selected_route_count, 5);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: tracks fallback usage", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-fallback-usage";

  const selectionWithFallback = createMockExecutionSelection();
  const selectionWithoutFallback = {
    ...createMockExecutionSelection(),
    fallback_chain: [],
  };

  sink.recordSelection(selectionWithFallback, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "with_fallback",
  });

  sink.recordSelection(selectionWithoutFallback, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "without_fallback",
  });

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_selections, 2);
  assert.equal(summary.fallback_usage_rate, 0.5); // 1 out of 2

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: computes selection stability", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-stability";

  // Record same selection multiple times (stable)
  const selection = createMockExecutionSelection();
  for (let i = 0; i < 10; i++) {
    sink.recordSelection(selection, {
      taskId,
      taskType: "implementation",
      timestamp: new Date().toISOString(),
      reason: `selection-${i}`,
    });
  }

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_selections, 10);
  // No digest changes = 0 stability (meaning very stable)
  assert.equal(summary.selection_stability, 0);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: computes average evaluation time", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-eval-time";
  const selection = createMockExecutionSelection();

  sink.recordSelection(selection, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "initial",
  });

  // Record multiple evaluations
  const durations = [100, 150, 200];
  for (const duration of durations) {
    sink.recordSelectionEvaluation(selection, {
      taskId,
      success: true,
      duration_ms: duration,
      routes_evaluated: 5,
      models_considered: 10,
      routes_admitted: 3,
      models_admitted: 7,
    });
  }

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_evaluations, 3);
  const expectedAvg = Math.round((100 + 150 + 200) / 3);
  assert.equal(summary.avg_evaluation_time_ms, expectedAvg);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: filters by type in summarize", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-type-filtering";
  const selection = createMockExecutionSelection();

  sink.recordSelection(selection, {
    taskId,
    taskType: "implementation",
    timestamp: new Date().toISOString(),
    reason: "test",
  });

  sink.recordSelectionEvaluation(selection, {
    taskId,
    success: true,
    duration_ms: 100,
    routes_evaluated: 3,
    models_considered: 5,
    routes_admitted: 2,
    models_admitted: 4,
  });

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  // Should have both selection and evaluation data
  assert.equal(summary.total_selections, 1);
  assert.equal(summary.total_evaluations, 1);
  assert.equal(summary.avg_evaluation_time_ms, 100);

  rmSync(tempDir, { recursive: true, force: true });
});
