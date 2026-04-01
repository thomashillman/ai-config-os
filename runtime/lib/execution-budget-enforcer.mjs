/**
 * Execution budget enforcer (Atom 6): data-driven degradation ladders.
 * Maps meter output + policy → constraint delta for replan (Atom 7) or terminal reason.
 *
 * @see docs/superpowers/specs/2026-04-01-resource-policy-execution-stack-design.md §4.2a, §5.6
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DEGRADATION_LADDERS_PATH = join(
  __dirname,
  "..",
  "config",
  "degradation-ladders.yaml",
);

/** @type {Readonly<Record<string, number>>} */
const TIER_RANK = Object.freeze({ haiku: 0, sonnet: 1, opus: 2 });

const TIERS_BY_RANK = /** @type {const} */ (["haiku", "sonnet", "opus"]);

/**
 * Planner-aligned constraints for an execution attempt (may include optional output cap).
 *
 * @typedef {object} EnforcementConstraints
 * @property {number} context_ceiling_tokens
 * @property {boolean} optional_passes_included
 * @property {string} model_tier
 * @property {number} [max_output_tokens] When set, `max_output_tokens_multiplier` deltas apply
 */

/**
 * @typedef {object} ConstraintDelta
 * @property {number} [context_ceiling_multiplier]
 * @property {boolean} [optional_passes_included]
 * @property {number} [tier_downshift]
 * @property {number} [max_output_tokens_multiplier]
 */

/**
 * @typedef {{ outcome: 'ok' }
 *   | { outcome: 'retry'; ladder_step_id: string; constraint_delta: ConstraintDelta; applied_constraints: EnforcementConstraints; ladder_step_index: number }
 *   | { outcome: 'terminal'; reason_code: string; message?: string; ladder_step_id?: string }
 * } EnforcementEvaluation
 */

let cachedDefaultLadders = null;

/**
 * @param {unknown} doc
 */
function assertLaddersDocument(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new TypeError("degradation-ladders: expected object root");
  }
  const o = /** @type {Record<string, unknown>} */ (doc);
  if (typeof o.version !== "number") {
    throw new TypeError("degradation-ladders: version (number) required");
  }
  if (!o.ladders || typeof o.ladders !== "object" || Array.isArray(o.ladders)) {
    throw new TypeError("degradation-ladders: ladders required");
  }
  return o;
}

/**
 * @param {string} [filePath]
 * @returns {Record<string, unknown>}
 */
export function loadDegradationLaddersFromFile(
  filePath = DEFAULT_DEGRADATION_LADDERS_PATH,
) {
  const raw = readFileSync(filePath, "utf8");
  const parsed = parseYaml(raw);
  return assertLaddersDocument(parsed);
}

/**
 * @returns {Record<string, unknown>}
 */
export function getDefaultDegradationLadders() {
  if (!cachedDefaultLadders) {
    cachedDefaultLadders = loadDegradationLaddersFromFile();
  }
  return cachedDefaultLadders;
}

/**
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy} policy
 * @returns {string}
 */
export function resolveLadderIdFromPolicy(policy) {
  const fl = policy.fallback_ladder;
  if (typeof fl === "string" && fl.trim()) return fl.trim();
  if (
    fl &&
    typeof fl === "object" &&
    !Array.isArray(fl) &&
    typeof (/** @type {Record<string, unknown>} */ (fl).id) === "string"
  ) {
    return String(/** @type {Record<string, unknown>} */ (fl).id);
  }
  return "default";
}

/**
 * Whether meter output violates resolved policy limits (triggers ladder).
 *
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy} policy
 * @param {import('../../shared/contracts/resource-policy-types.mjs').NormalizedAccountingResult} meter
 * @returns {boolean}
 */
export function detectPolicyViolation(policy, meter) {
  const m =
    meter && typeof meter === "object"
      ? /** @type {Record<string, unknown>} */ (meter)
      : {};
  const budget =
    policy.budget && typeof policy.budget === "object"
      ? /** @type {Record<string, unknown>} */ (policy.budget)
      : {};
  const mode = policy.mode;

  if (mode === "subscription") {
    const th =
      typeof budget.pressure_threshold === "number"
        ? budget.pressure_threshold
        : 0.85;
    const p = typeof m.pressure_score === "number" ? m.pressure_score : 0;
    if (p >= th) return true;
    if (m.throttle_detected === true || m.throttle_detected === 1) return true;
    return false;
  }

  if (mode === "api_key") {
    const cap = budget.max_estimated_cost_minor;
    if (typeof cap !== "number" || cap < 0) return false;
    const spend =
      typeof m.actual_cost_minor === "number"
        ? m.actual_cost_minor
        : typeof m.estimated_cost_minor === "number"
          ? m.estimated_cost_minor
          : null;
    if (spend === null) return false;
    return spend > cap;
  }

  if (mode === "hybrid") {
    const th =
      typeof budget.pressure_threshold === "number"
        ? budget.pressure_threshold
        : 0.85;
    const p = typeof m.pressure_score === "number" ? m.pressure_score : 0;
    if (p >= th) return true;
    if (m.throttle_detected === true || m.throttle_detected === 1) return true;
    const cap = budget.max_estimated_cost_minor;
    if (typeof cap === "number" && cap >= 0) {
      const spend =
        typeof m.actual_cost_minor === "number"
          ? m.actual_cost_minor
          : typeof m.estimated_cost_minor === "number"
            ? m.estimated_cost_minor
            : null;
      if (spend !== null && spend > cap) return true;
    }
    return false;
  }

  return false;
}

/**
 * Apply a ladder delta to current constraints (does not call the planner).
 *
 * @param {EnforcementConstraints} constraints
 * @param {ConstraintDelta} delta
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy} policy
 * @returns {EnforcementConstraints}
 */
export function applyConstraintDelta(constraints, delta, policy) {
  if (!constraints || typeof constraints !== "object") {
    throw new TypeError("applyConstraintDelta: constraints required");
  }
  if (!delta || typeof delta !== "object") {
    throw new TypeError("applyConstraintDelta: delta required");
  }
  const budget =
    policy.budget && typeof policy.budget === "object"
      ? /** @type {Record<string, unknown>} */ (policy.budget)
      : {};
  const minTier = String(budget.minimum_model_tier ?? "haiku");
  const maxTier = String(budget.preferred_model_tier ?? "opus");
  const lo = TIER_RANK[minTier] ?? TIER_RANK.haiku;
  const hi = TIER_RANK[maxTier] ?? TIER_RANK.opus;

  let contextCeiling = constraints.context_ceiling_tokens;
  let optionalPasses = constraints.optional_passes_included;
  let modelTier = String(constraints.model_tier ?? "sonnet");
  let maxOut =
    typeof constraints.max_output_tokens === "number"
      ? constraints.max_output_tokens
      : undefined;

  if (typeof delta.context_ceiling_multiplier === "number") {
    const c = Number(contextCeiling);
    contextCeiling = Math.max(
      1,
      Math.floor(c * delta.context_ceiling_multiplier),
    );
  }
  if (typeof delta.optional_passes_included === "boolean") {
    optionalPasses = delta.optional_passes_included;
  }
  if (typeof delta.tier_downshift === "number" && delta.tier_downshift > 0) {
    let r = TIER_RANK[modelTier] ?? TIER_RANK.sonnet;
    r = Math.max(lo, r - delta.tier_downshift);
    modelTier = TIERS_BY_RANK[r];
    if ((TIER_RANK[modelTier] ?? 0) > hi) {
      modelTier = maxTier;
    }
  }
  if (
    typeof delta.max_output_tokens_multiplier === "number" &&
    typeof maxOut === "number"
  ) {
    maxOut = Math.max(
      1,
      Math.floor(maxOut * delta.max_output_tokens_multiplier),
    );
  }

  /** @type {EnforcementConstraints} */
  const out = {
    context_ceiling_tokens: contextCeiling,
    optional_passes_included: optionalPasses,
    model_tier: modelTier,
  };
  if (maxOut !== undefined) {
    out.max_output_tokens = maxOut;
  }
  return out;
}

/**
 * @param {object} input
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy} input.policy
 * @param {import('../../shared/contracts/resource-policy-types.mjs').NormalizedAccountingResult} [input.meter]
 * @param {EnforcementConstraints} input.constraints
 * @param {number} [input.ladderStepIndex]
 * @param {Record<string, unknown>} [input.ladders] loaded degradation-ladders document (defaults to bundled file)
 * @returns {EnforcementEvaluation}
 */
export function evaluateBudgetEnforcement(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("evaluateBudgetEnforcement: input required");
  }
  const policy = input.policy;
  if (!policy || typeof policy !== "object") {
    throw new TypeError("evaluateBudgetEnforcement: policy required");
  }
  const meter =
    input.meter && typeof input.meter === "object"
      ? /** @type {import('../../shared/contracts/resource-policy-types.mjs').NormalizedAccountingResult} */ (
          input.meter
        )
      : {};
  const constraints = /** @type {EnforcementConstraints} */ (input.constraints);
  if (
    typeof constraints.context_ceiling_tokens !== "number" ||
    typeof constraints.optional_passes_included !== "boolean" ||
    typeof constraints.model_tier !== "string"
  ) {
    throw new TypeError(
      "evaluateBudgetEnforcement: constraints must include context_ceiling_tokens, optional_passes_included, model_tier",
    );
  }

  const ladderStepIndex = Number.isInteger(input.ladderStepIndex)
    ? /** @type {number} */ (input.ladderStepIndex)
    : 0;

  const laddersDoc =
    input.ladders && typeof input.ladders === "object"
      ? /** @type {Record<string, unknown>} */ (input.ladders)
      : getDefaultDegradationLadders();

  if (!detectPolicyViolation(policy, meter)) {
    return { outcome: "ok" };
  }

  const ladderId = resolveLadderIdFromPolicy(
    /** @type {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy} */ (
      policy
    ),
  );
  const laddersRoot =
    laddersDoc.ladders && typeof laddersDoc.ladders === "object"
      ? /** @type {Record<string, unknown>} */ (laddersDoc.ladders)
      : {};
  const bundle =
    laddersRoot[ladderId] && typeof laddersRoot[ladderId] === "object"
      ? /** @type {Record<string, unknown>} */ (laddersRoot[ladderId])
      : null;
  const mode = policy.mode;
  const modeEntry =
    bundle && bundle[mode] && typeof bundle[mode] === "object"
      ? /** @type {Record<string, unknown>} */ (bundle[mode])
      : null;
  const steps =
    modeEntry && Array.isArray(modeEntry.steps) ? modeEntry.steps : null;

  if (!steps || steps.length === 0) {
    return {
      outcome: "terminal",
      reason_code: "missing_ladder",
      message: `No degradation ladder for ladder_id=${ladderId} mode=${mode}`,
    };
  }

  if (ladderStepIndex < 0) {
    return {
      outcome: "terminal",
      reason_code: "invalid_ladder_index",
      message: "ladderStepIndex must be non-negative",
    };
  }

  if (ladderStepIndex >= steps.length) {
    return {
      outcome: "terminal",
      reason_code: "policy_exhausted",
      message: "Ladder index past final step",
    };
  }

  const step = /** @type {Record<string, unknown>} */ (steps[ladderStepIndex]);
  const stepId = typeof step.id === "string" ? step.id : "unknown_step";

  if (step.terminal && typeof step.terminal === "object") {
    const t = /** @type {Record<string, unknown>} */ (step.terminal);
    const code = typeof t.reason_code === "string" ? t.reason_code : "terminal";
    const message = typeof t.message === "string" ? t.message : undefined;
    return {
      outcome: "terminal",
      reason_code: code,
      ...(message !== undefined ? { message } : {}),
      ladder_step_id: stepId,
    };
  }

  if (!step.delta || typeof step.delta !== "object") {
    return {
      outcome: "terminal",
      reason_code: "invalid_ladder_step",
      message: `Step ${stepId} has neither terminal nor delta`,
      ladder_step_id: stepId,
    };
  }

  const delta = /** @type {ConstraintDelta} */ (step.delta);
  const applied = applyConstraintDelta(constraints, delta, policy);

  return {
    outcome: "retry",
    ladder_step_id: stepId,
    constraint_delta: delta,
    applied_constraints: applied,
    ladder_step_index: ladderStepIndex,
  };
}
