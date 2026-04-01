/**
 * Resource policy Atom 1: resolveExecutionPolicy + validators.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeImport } from "../lib/windows-safe-import.mjs";

const {
  resolveExecutionPolicy,
  validateExecutionPolicy,
  validateNormalizedAccountingResult,
  validateExecutionObservationFields,
  DEFAULT_REPLAN_ATTEMPTS_K,
  RUNTIME_CONFIG_REPLAN_ATTEMPTS_KEY,
} = await safeImport(
  "../../../shared/contracts/resource-policy-types.mjs",
  import.meta.url,
);

const { normalizeResourceBudget } = await safeImport(
  "../../../shared/contracts/resource-budget-normalize.mjs",
  import.meta.url,
);

const { getResourceBudgetForSkill } = await safeImport(
  "../../../runtime/lib/resource-budget-for-skill.mjs",
  import.meta.url,
);

const baseSkillSubscription = {
  mode: "subscription",
  max_input_tokens: 100_000,
  max_output_tokens: 8_000,
  max_total_tokens: 200_000,
  max_latency_ms: 60_000,
  preferred_model_tier: "sonnet",
  minimum_model_tier: "haiku",
  compaction_policy: "aggressive",
  escalation_allowed: true,
};

test("resolveExecutionPolicy: skill defaults when project, machine, route empty", () => {
  const p = resolveExecutionPolicy({ skillBudget: baseSkillSubscription });
  assert.equal(p.mode, "subscription");
  assert.equal(p.budget.max_input_tokens, 100_000);
  assert.equal(p.accounting_adapter, "subscription");
  assert.deepEqual(p.planner_rules, {});
  const v = validateExecutionPolicy(p);
  assert.equal(v.ok, true);
});

test("resolveExecutionPolicy: project overrides explicit key over skill", () => {
  const p = resolveExecutionPolicy({
    skillBudget: baseSkillSubscription,
    projectConfig: { max_input_tokens: 10_000 },
  });
  assert.equal(p.budget.max_input_tokens, 10_000);
  assert.equal(p.mode, "subscription");
});

test("resolveExecutionPolicy: route overrides mode for safety", () => {
  const p = resolveExecutionPolicy({
    skillBudget: baseSkillSubscription,
    route: { mode: "api_key" },
  });
  assert.equal(p.mode, "api_key");
  assert.equal(p.budget.mode, "api_key");
});

test("resolveExecutionPolicy: route narrows caps (cannot widen)", () => {
  const p = resolveExecutionPolicy({
    skillBudget: baseSkillSubscription,
    projectConfig: { max_input_tokens: 50_000 },
    route: { max_input_tokens: 5_000 },
  });
  assert.equal(p.budget.max_input_tokens, 5_000);
});

test("resolveExecutionPolicy: route does not widen max_input_tokens", () => {
  const p = resolveExecutionPolicy({
    skillBudget: baseSkillSubscription,
    route: { max_input_tokens: 500_000 },
  });
  assert.equal(p.budget.max_input_tokens, 100_000);
});

test("resolveExecutionPolicy: machine defaults overridden by skill", () => {
  const p = resolveExecutionPolicy({
    skillBudget: baseSkillSubscription,
    machineConfig: { max_input_tokens: 1_000 },
  });
  assert.equal(p.budget.max_input_tokens, 100_000);
});

test("resolveExecutionPolicy: planner_rules merge order (route wins)", () => {
  const p = resolveExecutionPolicy({
    skillBudget: {
      ...baseSkillSubscription,
      planner_rules: { a: 1, b: 2 },
    },
    machineConfig: { planner_rules: { a: 0 } },
    projectConfig: { planner_rules: { b: 3 } },
    route: { planner_rules: { c: 4 } },
  });
  assert.deepEqual(p.planner_rules, { a: 1, b: 3, c: 4 });
});

test("validateNormalizedAccountingResult: empty payload ok", () => {
  const r = validateNormalizedAccountingResult({}, "subscription");
  assert.equal(r.ok, true);
  const r2 = validateNormalizedAccountingResult(undefined, "api_key");
  assert.equal(r2.ok, true);
});

test("validateNormalizedAccountingResult: rejects malformed pressure_score", () => {
  const r = validateNormalizedAccountingResult({ pressure_score: 2 }, "hybrid");
  assert.equal(r.ok, false);
});

test("validateNormalizedAccountingResult: subscription rejects monetary fields", () => {
  const r = validateNormalizedAccountingResult({ estimated_cost_minor: 10 }, "subscription");
  assert.equal(r.ok, false);
});

test("validateNormalizedAccountingResult: api_key rejects pressure_score", () => {
  const r = validateNormalizedAccountingResult({ pressure_score: 0.5 }, "api_key");
  assert.equal(r.ok, false);
});

test("validateNormalizedAccountingResult: hybrid allows cost and pressure", () => {
  const r = validateNormalizedAccountingResult(
    { estimated_cost_minor: 10, pressure_score: 0.4, actual_cost_minor: 12 },
    "hybrid",
  );
  assert.equal(r.ok, true);
});

test("validateExecutionObservationFields: minimal ok", () => {
  assert.equal(validateExecutionObservationFields({}).ok, true);
});

test("validateExecutionObservationFields: rejects bad user_mode", () => {
  assert.equal(validateExecutionObservationFields({ user_mode: "invalid" }).ok, false);
});

test("constants exported for enforcer / facade", () => {
  assert.equal(DEFAULT_REPLAN_ATTEMPTS_K, 3);
  assert.equal(RUNTIME_CONFIG_REPLAN_ATTEMPTS_KEY, "execution.replan_max_attempts");
});

test("resolveExecutionPolicy throws without skillBudget object", () => {
  assert.throws(() => resolveExecutionPolicy({}), /skillBudget/);
});

test("integration: normalizeResourceBudget(subscription) feeds resolveExecutionPolicy", () => {
  const raw = {
    mode: "subscription",
    max_input_tokens: 100_000,
    max_output_tokens: 8_000,
    max_total_tokens: 200_000,
    max_latency_ms: 60_000,
    preferred_model_tier: "sonnet",
    minimum_model_tier: "haiku",
    compaction_policy: "aggressive",
    escalation_allowed: true,
  };
  const n = normalizeResourceBudget(raw);
  assert.ok(n);
  const p = resolveExecutionPolicy({ skillBudget: /** @type {Record<string, unknown>} */ (n) });
  assert.equal(p.mode, "subscription");
  assert.equal(validateExecutionPolicy(p).ok, true);
});

test("integration: normalizeResourceBudget(api_key) feeds resolveExecutionPolicy", () => {
  const raw = {
    mode: "api_key",
    max_input_tokens: 50_000,
    max_output_tokens: 4_000,
    max_total_tokens: 100_000,
    max_latency_ms: 30_000,
    preferred_model_tier: "haiku",
    minimum_model_tier: "haiku",
    compaction_policy: "light",
    escalation_allowed: false,
    max_estimated_cost_minor: 500,
    max_monthly_spend_minor: 10_000,
  };
  const n = normalizeResourceBudget(raw);
  assert.ok(n);
  const p = resolveExecutionPolicy({ skillBudget: /** @type {Record<string, unknown>} */ (n) });
  assert.equal(p.mode, "api_key");
  assert.equal(validateExecutionPolicy(p).ok, true);
});

test("integration: getResourceBudgetForSkill + resolveExecutionPolicy (registry path)", () => {
  const entry = {
    id: "context-budget",
    resource_budget: {
      mode: "hybrid",
      max_input_tokens: 100_000,
      max_output_tokens: 8_000,
      max_total_tokens: 200_000,
      max_latency_ms: 60_000,
      preferred_model_tier: "sonnet",
      minimum_model_tier: "haiku",
      compaction_policy: "aggressive",
      escalation_allowed: true,
      primary_mode: "subscription",
      overflow_mode: "api_key",
      overflow_trigger: "throttle_or_cap",
    },
  };
  const meta = getResourceBudgetForSkill(entry);
  assert.ok(meta);
  const p = resolveExecutionPolicy({
    skillBudget: /** @type {Record<string, unknown>} */ (meta.normalized),
  });
  assert.equal(p.mode, "hybrid");
  assert.equal(validateExecutionPolicy(p).ok, true);
});
