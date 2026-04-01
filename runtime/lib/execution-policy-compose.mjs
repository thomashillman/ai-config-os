/**
 * Execution policy facade (Atom 7): bounded replan over planner → context pack → meter → enforcer.
 *
 * @see docs/superpowers/specs/2026-04-01-resource-policy-execution-stack-design.md §4.2a, §5.7
 */

import {
  DEFAULT_REPLAN_ATTEMPTS_K,
  RUNTIME_CONFIG_REPLAN_ATTEMPTS_KEY,
  resolveExecutionPolicy,
} from "../../shared/contracts/resource-policy-types.mjs";
import { planExecution } from "./execution-planner.mjs";
import { buildContextPack } from "./context-pack-builder.mjs";
import { evaluateBudgetEnforcement } from "./execution-budget-enforcer.mjs";

/**
 * @typedef {object} EnforcementConstraints
 * @property {number} context_ceiling_tokens
 * @property {boolean} optional_passes_included
 * @property {string} model_tier
 * @property {number} [max_output_tokens]
 */

/** Three pilot anchors (spec §5.7) — budgets align with compiled skills / task journeys. */
export const ATOM7_PILOT_IDS = Object.freeze({
  CONTEXT_BUDGET: "context-budget",
  REVIEW_REPOSITORY: "review_repository",
  AUTORESEARCH: "autoresearch",
});

/**
 * Canonical hybrid pilot (context-budget skill).
 * @type {Record<string, unknown>}
 */
export const PILOT_BUDGET_CONTEXT_BUDGET = Object.freeze({
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
});

/**
 * Structured task journey (review_repository) — subscription pressure framing.
 * @type {Record<string, unknown>}
 */
export const PILOT_BUDGET_REVIEW_REPOSITORY = Object.freeze({
  mode: "subscription",
  max_input_tokens: 100_000,
  max_output_tokens: 16_000,
  max_total_tokens: 250_000,
  max_latency_ms: 180_000,
  preferred_model_tier: "sonnet",
  minimum_model_tier: "haiku",
  compaction_policy: "aggressive",
  escalation_allowed: true,
  pressure_threshold: 0.85,
});

/**
 * Research-style autoresearch pilot — api_key spend cap framing.
 * @type {Record<string, unknown>}
 */
export const PILOT_BUDGET_AUTORESEARCH = Object.freeze({
  mode: "api_key",
  max_input_tokens: 200_000,
  max_output_tokens: 16_000,
  max_total_tokens: 400_000,
  max_latency_ms: 600_000,
  max_estimated_cost_minor: 500_000,
  preferred_model_tier: "opus",
  minimum_model_tier: "haiku",
  compaction_policy: "aggressive",
  escalation_allowed: true,
});

/**
 * @param {string} pilotId
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionMode} [modeOverride]
 * @returns {Record<string, unknown>}
 */
export function getPilotSkillBudget(pilotId, modeOverride) {
  let base;
  if (pilotId === ATOM7_PILOT_IDS.CONTEXT_BUDGET) {
    base = { ...PILOT_BUDGET_CONTEXT_BUDGET };
  } else if (pilotId === ATOM7_PILOT_IDS.REVIEW_REPOSITORY) {
    base = { ...PILOT_BUDGET_REVIEW_REPOSITORY };
  } else if (pilotId === ATOM7_PILOT_IDS.AUTORESEARCH) {
    base = { ...PILOT_BUDGET_AUTORESEARCH };
  } else {
    throw new TypeError(`getPilotSkillBudget: unknown pilot ${pilotId}`);
  }
  if (modeOverride !== undefined) {
    return { ...base, mode: modeOverride };
  }
  return base;
}

/**
 * Metadata surfaced on structured task journeys (pilot 2).
 * @returns {{ atom: string; pilot: string; replan_max_attempts: number; runtime_config_key: string }}
 */
export function getTaskJourneyResourcePolicySummary() {
  return {
    atom: "atom7",
    pilot: ATOM7_PILOT_IDS.REVIEW_REPOSITORY,
    replan_max_attempts: DEFAULT_REPLAN_ATTEMPTS_K,
    runtime_config_key: RUNTIME_CONFIG_REPLAN_ATTEMPTS_KEY,
  };
}

/**
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPlannerOutput} planner
 * @param {Record<string, unknown>} budget
 * @returns {EnforcementConstraints}
 */
export function plannerOutputToEnforcementConstraints(planner, budget) {
  const maxOut =
    typeof budget.max_output_tokens === "number"
      ? budget.max_output_tokens
      : undefined;
  /** @type {EnforcementConstraints} */
  const c = {
    context_ceiling_tokens: planner.context_ceiling_tokens,
    optional_passes_included: planner.optional_passes_included,
    model_tier:
      typeof planner.model_tier === "string" ? planner.model_tier : "sonnet",
  };
  if (maxOut !== undefined) {
    c.max_output_tokens = maxOut;
  }
  return c;
}

/**
 * @param {EnforcementConstraints} c
 * @returns {Partial<import('../../shared/contracts/resource-policy-types.mjs').ExecutionPlannerOutput>}
 */
export function enforcementConstraintsToPlannerOverrides(c) {
  /** @type {Partial<import('../../shared/contracts/resource-policy-types.mjs').ExecutionPlannerOutput>} */
  const o = {
    context_ceiling_tokens: c.context_ceiling_tokens,
    optional_passes_included: c.optional_passes_included,
    model_tier: c.model_tier,
  };
  return o;
}

/**
 * @param {object} opts
 * @param {Record<string, unknown>} opts.skillBudget
 * @param {Record<string, unknown>} [opts.projectConfig]
 * @param {Record<string, unknown>} [opts.machineConfig]
 * @param {Record<string, unknown>} [opts.route]
 * @param {string} [opts.task_class]
 * @param {unknown} [opts.taskState]
 * @param {Record<string, unknown>} [opts.signals]
 * @param {number} [opts.maxReplanAttempts]
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPlannerOutput} [opts.initialPlannerOverrides]
 * @param {(ctx: {
 *   policy: import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy;
 *   planner: import('../../shared/contracts/resource-policy-types.mjs').ExecutionPlannerOutput;
 *   pack: import('../../shared/contracts/resource-policy-types.mjs').ContextPackResult;
 *   attempt: number;
 *   ladderStepIndex: number;
 * }) => import('../../shared/contracts/resource-policy-types.mjs').NormalizedAccountingResult | Promise<import('../../shared/contracts/resource-policy-types.mjs').NormalizedAccountingResult>} opts.execute
 * @returns {Promise<object>}
 */
export async function runExecutionPolicyPipeline(opts) {
  if (!opts || typeof opts !== "object") {
    throw new TypeError("runExecutionPolicyPipeline: options required");
  }
  if (!opts.skillBudget || typeof opts.skillBudget !== "object") {
    throw new TypeError("runExecutionPolicyPipeline: skillBudget required");
  }
  if (typeof opts.execute !== "function") {
    throw new TypeError(
      "runExecutionPolicyPipeline: execute callback required",
    );
  }

  const policy = resolveExecutionPolicy({
    skillBudget: /** @type {Record<string, unknown>} */ (opts.skillBudget),
    projectConfig:
      opts.projectConfig && typeof opts.projectConfig === "object"
        ? /** @type {Record<string, unknown>} */ (opts.projectConfig)
        : undefined,
    machineConfig:
      opts.machineConfig && typeof opts.machineConfig === "object"
        ? /** @type {Record<string, unknown>} */ (opts.machineConfig)
        : undefined,
    route:
      opts.route && typeof opts.route === "object"
        ? /** @type {Record<string, unknown>} */ (opts.route)
        : undefined,
  });

  const taskClass =
    typeof opts.task_class === "string" && opts.task_class.trim()
      ? opts.task_class.trim()
      : "balanced";
  const signals =
    opts.signals && typeof opts.signals === "object"
      ? /** @type {Record<string, unknown>} */ (opts.signals)
      : {};
  const taskState = opts.taskState ?? {};
  const maxAttempts =
    typeof opts.maxReplanAttempts === "number" && opts.maxReplanAttempts >= 1
      ? Math.floor(opts.maxReplanAttempts)
      : DEFAULT_REPLAN_ATTEMPTS_K;

  let ladderStepIndex = 0;
  /** @type {Partial<import('../../shared/contracts/resource-policy-types.mjs').ExecutionPlannerOutput> | undefined} */
  let plannerOverrides =
    opts.initialPlannerOverrides &&
    typeof opts.initialPlannerOverrides === "object"
      ? opts.initialPlannerOverrides
      : undefined;

  /** @type {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy} */
  const pol = policy;
  const budget =
    pol.budget && typeof pol.budget === "object"
      ? /** @type {Record<string, unknown>} */ (pol.budget)
      : {};

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const planner = planExecution({
      policy: pol,
      task_class: taskClass,
      signals,
      ...(plannerOverrides ? { plannerOverrides } : {}),
    });
    plannerOverrides = undefined;

    const constraints = plannerOutputToEnforcementConstraints(planner, budget);
    const pack = buildContextPack({
      policy: pol,
      planner,
      taskState,
    });

    const meter = await opts.execute({
      policy: pol,
      planner,
      pack,
      attempt,
      ladderStepIndex,
    });

    const enf = evaluateBudgetEnforcement({
      policy: pol,
      meter,
      constraints,
      ladderStepIndex,
    });

    if (enf.outcome === "ok") {
      return {
        status: "success",
        policy: pol,
        planner,
        pack,
        meter,
        attempt,
        ladderStepIndex,
      };
    }

    if (enf.outcome === "terminal") {
      return {
        status: "terminal",
        policy: pol,
        planner,
        pack,
        meter,
        enforcement: enf,
        attempt,
        ladderStepIndex,
      };
    }

    if (enf.outcome === "retry") {
      ladderStepIndex += 1;
      plannerOverrides = enforcementConstraintsToPlannerOverrides(
        enf.applied_constraints,
      );
      continue;
    }

    return {
      status: "unknown_enforcement",
      policy: pol,
      planner,
      pack,
      meter,
      enforcement: enf,
      attempt,
      ladderStepIndex,
    };
  }

  return {
    status: "replan_exhausted",
    policy: pol,
    maxReplanAttempts: maxAttempts,
  };
}
