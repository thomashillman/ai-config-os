/**
 * Atom 7 — execution-policy-compose facade + pilot budgets × three modes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeImport } from "../lib/windows-safe-import.mjs";

const { resolveExecutionPolicy } = await safeImport(
  "../../../shared/contracts/resource-policy-types.mjs",
  import.meta.url,
);

const {
  ATOM7_PILOT_IDS,
  getPilotSkillBudget,
  runExecutionPolicyPipeline,
  plannerOutputToEnforcementConstraints,
  getTaskJourneyResourcePolicySummary,
} = await safeImport(
  "../../../runtime/lib/execution-policy-compose.mjs",
  import.meta.url,
);

const { summarizeExecutionPolicyForRegistrySkill } = await safeImport(
  "../../../runtime/lib/resource-budget-for-skill.mjs",
  import.meta.url,
);

test("getTaskJourneyResourcePolicySummary exposes replan K and pilot id", () => {
  const s = getTaskJourneyResourcePolicySummary();
  assert.equal(s.pilot, ATOM7_PILOT_IDS.REVIEW_REPOSITORY);
  assert.equal(s.replan_max_attempts, 3);
  assert.ok(s.runtime_config_key);
});

test("golden: each pilot × subscription | api_key | hybrid resolves ExecutionPolicy.mode", () => {
  const modes = /** @type {const} */ (["subscription", "api_key", "hybrid"]);
  const pilots = [
    ATOM7_PILOT_IDS.CONTEXT_BUDGET,
    ATOM7_PILOT_IDS.REVIEW_REPOSITORY,
    ATOM7_PILOT_IDS.AUTORESEARCH,
  ];
  for (const pilot of pilots) {
    for (const mode of modes) {
      const skillBudget = getPilotSkillBudget(pilot, mode);
      const policy = resolveExecutionPolicy({ skillBudget });
      assert.equal(policy.mode, mode, `pilot=${pilot} mode=${mode}`);
    }
  }
});

test("summarizeExecutionPolicyForRegistrySkill matches context-budget hybrid shape", () => {
  const policy = summarizeExecutionPolicyForRegistrySkill({
    id: "context-budget",
    resource_budget: {
      mode: "hybrid",
      max_input_tokens: 128_000,
      max_output_tokens: 8192,
      max_total_tokens: 200_000,
      max_latency_ms: 120_000,
      preferred_model_tier: "sonnet",
      minimum_model_tier: "haiku",
      compaction_policy: "aggressive",
      escalation_allowed: true,
      primary_mode: "subscription",
      overflow_mode: "api_key",
      overflow_trigger: "throttle",
    },
  });
  assert.ok(policy);
  if (!policy) return;
  assert.equal(policy.mode, "hybrid");
});

test("runExecutionPolicyPipeline: success when meter within subscription pressure", async () => {
  const result = await runExecutionPolicyPipeline({
    skillBudget: getPilotSkillBudget(
      ATOM7_PILOT_IDS.REVIEW_REPOSITORY,
      "subscription",
    ),
    task_class: "balanced",
    signals: { pressure_score: 0.1 },
    taskState: { messages: [{ role: "user", content: "hello" }] },
    execute: () => ({
      pressure_score: 0.2,
      packed_context_tokens: 100,
    }),
  });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.ok(result.pack?.packed_text);
});

test("runExecutionPolicyPipeline: terminal when ladder exhausts", async () => {
  const result = await runExecutionPolicyPipeline({
    skillBudget: getPilotSkillBudget(
      ATOM7_PILOT_IDS.REVIEW_REPOSITORY,
      "subscription",
    ),
    task_class: "balanced",
    signals: { pressure_score: 0.1 },
    taskState: { messages: [{ role: "user", content: "x".repeat(5000) }] },
    maxReplanAttempts: 2,
    execute: () => ({
      pressure_score: 0.99,
      throttle_detected: false,
    }),
  });
  assert.ok(
    result.status === "terminal" || result.status === "replan_exhausted",
  );
});

test("plannerOutputToEnforcementConstraints carries max_output_tokens from budget", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: getPilotSkillBudget(ATOM7_PILOT_IDS.AUTORESEARCH, "api_key"),
  });
  assert.ok(policy.budget);
  const c = plannerOutputToEnforcementConstraints(
    {
      context_ceiling_tokens: 4000,
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    /** @type {Record<string, unknown>} */ (policy.budget),
  );
  assert.equal(c.max_output_tokens, 16_000);
});
