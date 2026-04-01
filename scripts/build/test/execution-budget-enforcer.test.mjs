/**
 * Execution budget enforcer (Atom 6): ladder evaluation + constraint deltas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeImport } from "../lib/windows-safe-import.mjs";

const { resolveExecutionPolicy } = await safeImport(
  "../../../shared/contracts/resource-policy-types.mjs",
  import.meta.url,
);

const {
  evaluateBudgetEnforcement,
  detectPolicyViolation,
  applyConstraintDelta,
  loadDegradationLaddersFromFile,
} = await safeImport(
  "../../../runtime/lib/execution-budget-enforcer.mjs",
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
const LADDERS_PATH = join(REPO_ROOT, "runtime/config/degradation-ladders.yaml");

const sharedBudget = {
  max_input_tokens: 100_000,
  max_output_tokens: 8_000,
  max_total_tokens: 200_000,
  preferred_model_tier: "opus",
  minimum_model_tier: "haiku",
};

test("loadDegradationLaddersFromFile parses version and default bundle", () => {
  const doc = loadDegradationLaddersFromFile(LADDERS_PATH);
  assert.equal(doc.version, 1);
  assert.ok(/** @type {Record<string, unknown>} */ (doc.ladders).default);
});

test("detectPolicyViolation subscription: pressure at threshold", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "subscription",
      ...sharedBudget,
      pressure_threshold: 0.85,
    },
  });
  assert.equal(detectPolicyViolation(policy, { pressure_score: 0.85 }), true);
  assert.equal(detectPolicyViolation(policy, { pressure_score: 0.84 }), false);
});

test("detectPolicyViolation subscription: throttle", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", ...sharedBudget },
  });
  assert.equal(
    detectPolicyViolation(policy, {
      pressure_score: 0,
      throttle_detected: true,
    }),
    true,
  );
});

test("detectPolicyViolation api_key: spend over cap", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "api_key",
      ...sharedBudget,
      max_estimated_cost_minor: 100,
    },
  });
  assert.equal(
    detectPolicyViolation(policy, { estimated_cost_minor: 101 }),
    true,
  );
  assert.equal(
    detectPolicyViolation(policy, { estimated_cost_minor: 50 }),
    false,
  );
});

test("detectPolicyViolation hybrid: either pressure or spend", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "hybrid",
      ...sharedBudget,
      max_estimated_cost_minor: 50,
    },
  });
  assert.equal(detectPolicyViolation(policy, { pressure_score: 0.9 }), true);
  assert.equal(
    detectPolicyViolation(policy, {
      pressure_score: 0.1,
      estimated_cost_minor: 60,
    }),
    true,
  );
  assert.equal(
    detectPolicyViolation(policy, {
      pressure_score: 0.1,
      estimated_cost_minor: 10,
    }),
    false,
  );
});

test("evaluateBudgetEnforcement: no violation → ok", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", ...sharedBudget },
  });
  const r = evaluateBudgetEnforcement({
    policy,
    meter: { pressure_score: 0.1 },
    constraints: {
      context_ceiling_tokens: 5000,
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    ladderStepIndex: 0,
  });
  assert.equal(r.outcome, "ok");
});

test("evaluateBudgetEnforcement subscription: first ladder step applies compact delta", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", ...sharedBudget },
  });
  const r = evaluateBudgetEnforcement({
    policy,
    meter: { pressure_score: 0.95 },
    constraints: {
      context_ceiling_tokens: 10_000,
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    ladderStepIndex: 0,
  });
  assert.equal(r.outcome, "retry");
  if (r.outcome !== "retry") return;
  assert.equal(r.ladder_step_id, "compact_harder");
  assert.equal(r.applied_constraints.context_ceiling_tokens, 8500);
});

test("evaluateBudgetEnforcement subscription: terminal step returns reason", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", ...sharedBudget },
  });
  const r = evaluateBudgetEnforcement({
    policy,
    meter: { pressure_score: 0.95 },
    constraints: {
      context_ceiling_tokens: 4000,
      optional_passes_included: false,
      model_tier: "haiku",
    },
    ladderStepIndex: 4,
  });
  assert.equal(r.outcome, "terminal");
  if (r.outcome !== "terminal") return;
  assert.equal(r.reason_code, "subscription_policy_exhausted");
  assert.ok(r.message);
});

test("evaluateBudgetEnforcement: index past steps → policy_exhausted", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", ...sharedBudget },
  });
  const r = evaluateBudgetEnforcement({
    policy,
    meter: { pressure_score: 0.95 },
    constraints: {
      context_ceiling_tokens: 4000,
      optional_passes_included: false,
      model_tier: "haiku",
    },
    ladderStepIndex: 99,
  });
  assert.equal(r.outcome, "terminal");
  if (r.outcome !== "terminal") return;
  assert.equal(r.reason_code, "policy_exhausted");
});

test("evaluateBudgetEnforcement api_key: max_output_tokens multiplier", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "api_key",
      ...sharedBudget,
      max_estimated_cost_minor: 100,
    },
  });
  const r = evaluateBudgetEnforcement({
    policy,
    meter: { estimated_cost_minor: 200 },
    constraints: {
      context_ceiling_tokens: 8000,
      optional_passes_included: true,
      model_tier: "opus",
      max_output_tokens: 8000,
    },
    ladderStepIndex: 2,
  });
  assert.equal(r.outcome, "retry");
  if (r.outcome !== "retry") return;
  assert.equal(r.ladder_step_id, "reduce_output_budget");
  assert.equal(r.applied_constraints.max_output_tokens, 6000);
});

test("applyConstraintDelta tier_downshift clamps to minimum_model_tier", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: {
      mode: "api_key",
      ...sharedBudget,
      minimum_model_tier: "sonnet",
    },
  });
  const next = applyConstraintDelta(
    {
      context_ceiling_tokens: 5000,
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    { tier_downshift: 1 },
    policy,
  );
  assert.equal(next.model_tier, "sonnet");
});
