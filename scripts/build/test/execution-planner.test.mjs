/**
 * Execution planner (Atom 3): deterministic planExecution + planner-rules data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeImport } from "../lib/windows-safe-import.mjs";

const { resolveExecutionPolicy } = await safeImport(
  "../../../shared/contracts/resource-policy-types.mjs",
  import.meta.url,
);

const {
  planExecution,
  loadPlannerRulesFromFile,
  mergePlannerRules,
  clampTierToBudget,
  getDefaultPlannerRules,
} = await safeImport(
  "../../../runtime/lib/execution-planner.mjs",
  import.meta.url,
);

const { dirname, join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const RULES_PATH = join(REPO_ROOT, "runtime/config/planner-rules.yaml");

const sharedBudgetFields = {
  max_input_tokens: 100_000,
  max_output_tokens: 8_000,
  max_total_tokens: 200_000,
  max_latency_ms: 60_000,
  preferred_model_tier: "opus",
  minimum_model_tier: "haiku",
  compaction_policy: "aggressive",
  escalation_allowed: true,
};

test("loadPlannerRulesFromFile includes task_classes", () => {
  const r = loadPlannerRulesFromFile(RULES_PATH);
  assert.equal(r.version, 1);
  assert.ok(r.task_classes.balanced);
  assert.ok(r.task_classes.deep_research);
});

test("clampTierToBudget respects min and max", () => {
  assert.equal(clampTierToBudget("opus", "haiku", "sonnet"), "sonnet");
  assert.equal(clampTierToBudget("haiku", "sonnet", "opus"), "sonnet");
});

test("subscription + balanced: low pressure keeps optional passes", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", ...sharedBudgetFields },
  });
  const plan = planExecution({
    policy,
    task_class: "balanced",
    signals: { pressure_score: 0.1 },
  });
  assert.equal(plan.optional_passes_included, true);
  assert.equal(plan.model_tier, "sonnet");
});

test("subscription + balanced: high pressure drops optional passes", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", ...sharedBudgetFields },
  });
  const plan = planExecution({
    policy,
    task_class: "balanced",
    signals: { pressure_score: 0.9 },
  });
  assert.equal(plan.optional_passes_included, false);
});

test("subscription deep_research without premium: tier clamped below opus", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "subscription",
      ...sharedBudgetFields,
      premium_tier_allowed: false,
    },
  });
  const plan = planExecution({
    policy,
    task_class: "deep_research",
    signals: { pressure_score: 0.1 },
  });
  assert.equal(plan.model_tier, "sonnet");
});

test("api_key: spend above cap downshifts tier and tightens ceiling", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "api_key",
      ...sharedBudgetFields,
      max_estimated_cost_minor: 500,
    },
  });
  const low = planExecution({
    policy,
    task_class: "balanced",
    signals: { estimated_cost_minor: 100 },
  });
  const high = planExecution({
    policy,
    task_class: "balanced",
    signals: { estimated_cost_minor: 600 },
  });
  assert.equal(low.model_tier, "sonnet");
  assert.equal(high.model_tier, "haiku");
  assert.ok(high.context_ceiling_tokens < low.context_ceiling_tokens);
});

test("api_key near cap drops optional passes", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "api_key",
      ...sharedBudgetFields,
      max_estimated_cost_minor: 1000,
    },
  });
  const plan = planExecution({
    policy,
    task_class: "balanced",
    signals: { estimated_cost_minor: 900 },
  });
  assert.equal(plan.optional_passes_included, false);
});

test("same task_class: subscription ceiling lower than api_key (reserve_headroom)", () => {
  const sub = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", ...sharedBudgetFields },
  });
  const api = resolveExecutionPolicy({
    skillBudget: { mode: "api_key", ...sharedBudgetFields },
  });
  const ps = planExecution({
    policy: sub,
    task_class: "balanced",
    signals: { pressure_score: 0.2 },
  });
  const pa = planExecution({
    policy: api,
    task_class: "balanced",
    signals: { estimated_cost_minor: 50 },
  });
  assert.ok(ps.context_ceiling_tokens < pa.context_ceiling_tokens);
});

test("hybrid: high pressure disables optional passes", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "hybrid",
      ...sharedBudgetFields,
      primary_mode: "subscription",
      overflow_mode: "api_key",
      max_estimated_cost_minor: 10_000,
    },
  });
  const plan = planExecution({
    policy,
    task_class: "balanced",
    signals: { pressure_score: 0.92, estimated_cost_minor: 10 },
  });
  assert.equal(plan.optional_passes_included, false);
});

test("skill planner_rules lowers ceiling_ratio (data-driven override)", () => {
  const baseline = resolveExecutionPolicy({
    skillBudget: { mode: "api_key", ...sharedBudgetFields },
  });
  const tuned = resolveExecutionPolicy({
    skillBudget: {
      mode: "api_key",
      ...sharedBudgetFields,
      planner_rules: { task_classes: { balanced: { ceiling_ratio: 0.22 } } },
    },
  });
  const pb = planExecution({
    policy: baseline,
    task_class: "balanced",
    signals: { estimated_cost_minor: 10 },
  });
  const pt = planExecution({
    policy: tuned,
    task_class: "balanced",
    signals: { estimated_cost_minor: 10 },
  });
  assert.ok(pt.context_ceiling_tokens < pb.context_ceiling_tokens);
});

test("mergePlannerRules patches task_classes", () => {
  const base = getDefaultPlannerRules();
  const merged = mergePlannerRules(base, {
    task_classes: { balanced: { ceiling_ratio: 0.3 } },
  });
  assert.equal(
    /** @type {{ ceiling_ratio: number }} */ (merged.task_classes.balanced)
      .ceiling_ratio,
    0.3,
  );
});
