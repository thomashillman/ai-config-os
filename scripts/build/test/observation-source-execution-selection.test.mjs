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
    captureReason: "development",
    timestamp: new Date().toISOString(),
    routeCandidates: [
      { route_id: "route_claude_native", route_kind: "native_claude" },
    ],
    modelCandidates: [
      {
        provider: "anthropic",
        model_id: "claude-opus-4",
        model_tier: "premium",
        execution_mode: "native",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
    ],
  });

  const observations = source.loadObservations(taskId);

  assert.ok(Array.isArray(observations));
  assert.equal(observations.length, 1);
  assert.ok(observations[0].selected_pair_summary);
  assert.equal(observations[0].task_id, taskId);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: summarizes selection statistics from bounded contract", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-summary-stats";
  const selection = createMockExecutionSelection();

  // Record a selection with 5 route candidates and 10 model candidates
  // The bounded contract stores only summaries, not evaluation results
  sink.recordSelection(selection, {
    taskId,
    captureReason: "development",
    timestamp: new Date().toISOString(),
    routeCandidates: [
      { route_id: "route_claude_native", route_kind: "native_claude" },
      { route_id: "route_fallback_1", route_kind: "fallback" },
      { route_id: "route_fallback_2", route_kind: "fallback" },
      { route_id: "route_fallback_3", route_kind: "fallback" },
      { route_id: "route_fallback_4", route_kind: "fallback" },
    ],
    modelCandidates: [
      {
        provider: "anthropic",
        model_id: "claude-opus-4",
        model_tier: "premium",
        execution_mode: "native",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
      {
        provider: "anthropic",
        model_id: "claude-sonnet-3",
        model_tier: "standard",
        execution_mode: "api",
        cost_basis: "cost_light",
        reliability_margin: "standard",
        latency_risk: "batch_safe",
      },
      {
        provider: "anthropic",
        model_id: "claude-haiku-2",
        model_tier: "light",
        execution_mode: "api",
        cost_basis: "cost_light",
        reliability_margin: "standard",
        latency_risk: "batch_safe",
      },
      {
        provider: "openai",
        model_id: "gpt-4",
        model_tier: "premium",
        execution_mode: "api",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
      {
        provider: "openai",
        model_id: "gpt-4-turbo",
        model_tier: "premium",
        execution_mode: "api",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
      {
        provider: "openai",
        model_id: "gpt-3.5-turbo",
        model_tier: "light",
        execution_mode: "api",
        cost_basis: "cost_light",
        reliability_margin: "standard",
        latency_risk: "batch_safe",
      },
      {
        provider: "google",
        model_id: "gemini-pro",
        model_tier: "premium",
        execution_mode: "api",
        cost_basis: "cost_heavy",
        reliability_margin: "standard",
        latency_risk: "interactive_safe",
      },
      {
        provider: "google",
        model_id: "gemini-1.5",
        model_tier: "premium",
        execution_mode: "api",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
      {
        provider: "meta",
        model_id: "llama-2",
        model_tier: "light",
        execution_mode: "api",
        cost_basis: "cost_light",
        reliability_margin: "standard",
        latency_risk: "batch_safe",
      },
      {
        provider: "meta",
        model_id: "llama-3",
        model_tier: "standard",
        execution_mode: "api",
        cost_basis: "cost_light",
        reliability_margin: "standard",
        latency_risk: "interactive_safe",
      },
    ],
  });

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_selections, 1);
  // Bounded contract: avg_evaluation_time_ms is always 0
  assert.equal(summary.avg_evaluation_time_ms, 0);
  // Bounded contract: total_evaluations is always 0 (no separate evaluation entries)
  assert.equal(summary.total_evaluations, 0);
  // Bounded contract: routes_admitted_rate = 1 / 5 = 0.2
  assert.equal(summary.routes_admitted_rate, 0.2);
  // Bounded contract: models_admitted_rate = 1 / 10 = 0.1
  assert.equal(summary.models_admitted_rate, 0.1);
  // Fallback usage rate is always 0 (bounded contract does not store fallback chains)
  assert.equal(summary.fallback_usage_rate, 0);
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

test("ExecutionSelectionObservationSource: tracks model diversity from selected_pair_summary", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-model-diversity";

  const modelIds = ["model-opus", "model-sonnet", "model-haiku"];

  for (const modelId of modelIds) {
    const selection = createMockExecutionSelection({ model_id: modelId });
    sink.recordSelection(selection, {
      taskId,
      captureReason: "development",
      timestamp: new Date().toISOString(),
      routeCandidates: [
        { route_id: "route_claude_native", route_kind: "native_claude" },
      ],
      modelCandidates: [
        {
          provider: "anthropic",
          model_id: modelId,
          model_tier: "premium",
          execution_mode: "native",
          cost_basis: "cost_heavy",
          reliability_margin: "high_margin",
          latency_risk: "interactive_safe",
        },
      ],
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

test("ExecutionSelectionObservationSource: tracks route distribution from selected_pair_summary", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-route-distribution";

  // Record multiple selections with same route
  for (let i = 0; i < 5; i++) {
    const selection = createMockExecutionSelection();
    sink.recordSelection(selection, {
      taskId,
      captureReason: "development",
      timestamp: new Date().toISOString(),
      routeCandidates: [
        { route_id: "route_claude_native", route_kind: "native_claude" },
      ],
      modelCandidates: [
        {
          provider: "anthropic",
          model_id: "claude-opus-4",
          model_tier: "premium",
          execution_mode: "native",
          cost_basis: "cost_heavy",
          reliability_margin: "high_margin",
          latency_risk: "interactive_safe",
        },
      ],
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

test("ExecutionSelectionObservationSource: fallback_usage_rate is always 0 with bounded contract", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-fallback-usage";

  // The bounded contract does not store fallback chains, so fallback_usage_rate is always 0
  const selection1 = createMockExecutionSelection();
  const selection2 = createMockExecutionSelection();

  sink.recordSelection(selection1, {
    taskId,
    captureReason: "development",
    timestamp: new Date().toISOString(),
    routeCandidates: [
      { route_id: "route_claude_native", route_kind: "native_claude" },
    ],
    modelCandidates: [
      {
        provider: "anthropic",
        model_id: "claude-opus-4",
        model_tier: "premium",
        execution_mode: "native",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
    ],
  });

  sink.recordSelection(selection2, {
    taskId,
    captureReason: "development",
    timestamp: new Date().toISOString(),
    routeCandidates: [
      { route_id: "route_claude_native", route_kind: "native_claude" },
    ],
    modelCandidates: [
      {
        provider: "anthropic",
        model_id: "claude-opus-4",
        model_tier: "premium",
        execution_mode: "native",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
    ],
  });

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_selections, 2);
  // Bounded contract does not store fallback chains, so this is always 0
  assert.equal(summary.fallback_usage_rate, 0);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: computes selection_stability from revision changes", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-stability";

  // Record same selection multiple times (stable)
  // selection_revision will be the same since the selection is identical
  const selection = createMockExecutionSelection();
  for (let i = 0; i < 10; i++) {
    sink.recordSelection(selection, {
      taskId,
      captureReason: "development",
      timestamp: new Date().toISOString(),
      routeCandidates: [
        { route_id: "route_claude_native", route_kind: "native_claude" },
      ],
      modelCandidates: [
        {
          provider: "anthropic",
          model_id: "claude-opus-4",
          model_tier: "premium",
          execution_mode: "native",
          cost_basis: "cost_heavy",
          reliability_margin: "high_margin",
          latency_risk: "interactive_safe",
        },
      ],
    });
  }

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  assert.equal(summary.total_selections, 10);
  // No selection_revision changes = 0 stability (meaning very stable)
  assert.equal(summary.selection_stability, 0);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: avg_evaluation_time_ms is always 0 with bounded contract", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-eval-time";
  const selection = createMockExecutionSelection();

  // The bounded contract does not store evaluation time information
  sink.recordSelection(selection, {
    taskId,
    captureReason: "development",
    timestamp: new Date().toISOString(),
    routeCandidates: [
      { route_id: "route_claude_native", route_kind: "native_claude" },
    ],
    modelCandidates: [
      {
        provider: "anthropic",
        model_id: "claude-opus-4",
        model_tier: "premium",
        execution_mode: "native",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
    ],
  });

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  // Bounded contract never includes evaluation time
  assert.equal(summary.total_evaluations, 0);
  assert.equal(summary.avg_evaluation_time_ms, 0);

  rmSync(tempDir, { recursive: true, force: true });
});

test("ExecutionSelectionObservationSource: bounded contract has no separate evaluation entries", () => {
  const tempDir = createTempDir();
  const sink = new ExecutionSelectionDiagnosticSink(tempDir);
  const source = createExecutionSelectionObservationSource(tempDir);
  const taskId = "task-type-filtering";
  const selection = createMockExecutionSelection();

  // Bounded contract only stores selection entries, no separate evaluation entries
  sink.recordSelection(selection, {
    taskId,
    captureReason: "development",
    timestamp: new Date().toISOString(),
    routeCandidates: [
      { route_id: "route_claude_native", route_kind: "native_claude" },
    ],
    modelCandidates: [
      {
        provider: "anthropic",
        model_id: "claude-opus-4",
        model_tier: "premium",
        execution_mode: "native",
        cost_basis: "cost_heavy",
        reliability_margin: "high_margin",
        latency_risk: "interactive_safe",
      },
    ],
  });

  const observations = source.loadObservations(taskId);
  const summary = source.summarize(observations);

  // Bounded contract: only selections, no separate evaluation entries
  assert.equal(summary.total_selections, 1);
  assert.equal(summary.total_evaluations, 0);
  assert.equal(summary.avg_evaluation_time_ms, 0);

  rmSync(tempDir, { recursive: true, force: true });
});
