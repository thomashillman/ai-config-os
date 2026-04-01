/**
 * Resource budget: skill schema + normaliser contract tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeImport } from "../lib/windows-safe-import.mjs";

const { getSkillValidator } = await safeImport(
  "../lib/validators-cache.mjs",
  import.meta.url,
);
const { normalizeResourceBudget, getResourceBudgetMode } = await safeImport(
  "../../../shared/contracts/resource-budget-normalize.mjs",
  import.meta.url,
);
const { getResourceBudgetForSkill } = await safeImport(
  "../../../runtime/lib/resource-budget-for-skill.mjs",
  import.meta.url,
);

const minimalSkillBase = {
  skill: "test-skill",
  description: "Test.",
  type: "prompt",
  status: "stable",
  version: "1.0.0",
  capabilities: { required: [], fallback_mode: "none" },
};

test("skill validator rejects invalid resource_budget (wrong mode payload)", async () => {
  const validator = await getSkillValidator();
  const valid = validator({
    ...minimalSkillBase,
    resource_budget: {
      mode: "subscription",
      max_input_tokens: 100,
      max_output_tokens: 100,
      max_total_tokens: 200,
      max_latency_ms: 1000,
      preferred_model_tier: "sonnet",
      minimum_model_tier: "haiku",
      compaction_policy: "light",
      escalation_allowed: true,
      max_estimated_cost_minor: 100,
    },
  });
  assert.equal(valid, false);
  const path = (validator.errors || [])
    .map((e) => e.instancePath)
    .join(",");
  assert.ok(
    path.includes("resource_budget") || (validator.errors?.length ?? 0) > 0,
    `expected resource_budget validation error, got ${JSON.stringify(validator.errors)}`,
  );
});

test("skill validator accepts valid resource_budget for each mode", async () => {
  const validator = await getSkillValidator();
  const sub = {
    ...minimalSkillBase,
    resource_budget: {
      mode: "subscription",
      max_input_tokens: 100000,
      max_output_tokens: 8000,
      max_total_tokens: 200000,
      max_latency_ms: 60000,
      preferred_model_tier: "sonnet",
      minimum_model_tier: "haiku",
      compaction_policy: "aggressive",
      escalation_allowed: true,
    },
  };
  assert.ok(validator(sub), JSON.stringify(validator.errors));

  const api = {
    ...minimalSkillBase,
    skill: "test-api",
    resource_budget: {
      mode: "api_key",
      max_input_tokens: 100000,
      max_output_tokens: 8000,
      max_total_tokens: 200000,
      max_latency_ms: 60000,
      preferred_model_tier: "opus",
      minimum_model_tier: "haiku",
      compaction_policy: "light",
      escalation_allowed: false,
      max_estimated_cost_minor: 50,
      max_monthly_spend_minor: 5000,
      pricing_profile: "default",
      allow_price_escalation: true,
    },
  };
  assert.ok(validator(api), JSON.stringify(validator.errors));

  const hybrid = {
    ...minimalSkillBase,
    skill: "test-hybrid",
    resource_budget: {
      mode: "hybrid",
      max_input_tokens: 128000,
      max_output_tokens: 8192,
      max_total_tokens: 200000,
      max_latency_ms: 120000,
      preferred_model_tier: "sonnet",
      minimum_model_tier: "haiku",
      compaction_policy: "aggressive",
      escalation_allowed: true,
      primary_mode: "subscription",
      overflow_mode: "api_key",
      overflow_trigger: "throttle",
    },
  };
  assert.ok(validator(hybrid), JSON.stringify(validator.errors));
});

test("normalizeResourceBudget fills subscription optional defaults deterministically", () => {
  const raw = {
    mode: "subscription",
    max_input_tokens: 1,
    max_output_tokens: 1,
    max_total_tokens: 2,
    max_latency_ms: 0,
    preferred_model_tier: "haiku",
    minimum_model_tier: "haiku",
    compaction_policy: "none",
    escalation_allowed: false,
  };
  const a = normalizeResourceBudget(raw);
  const b = normalizeResourceBudget(raw);
  assert.deepEqual(a, b);
  assert.equal(a.pressure_threshold, 0.85);
  assert.equal(a.premium_tier_allowed, true);
});

test("getResourceBudgetMode and getResourceBudgetForSkill", () => {
  assert.equal(getResourceBudgetMode(null), null);
  const entry = {
    id: "context-budget",
    resource_budget: {
      mode: "hybrid",
      max_input_tokens: 1,
      max_output_tokens: 1,
      max_total_tokens: 2,
      max_latency_ms: 1,
      preferred_model_tier: "sonnet",
      minimum_model_tier: "haiku",
      compaction_policy: "x",
      escalation_allowed: true,
      primary_mode: "subscription",
      overflow_mode: "api_key",
      overflow_trigger: "t",
    },
  };
  const meta = getResourceBudgetForSkill(entry);
  assert.ok(meta);
  assert.equal(meta.mode, "hybrid");
  assert.equal(meta.normalized.mode, "hybrid");
});
