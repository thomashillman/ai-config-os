/**
 * Resource policy contracts (Atom 1 surface).
 * Planner / context-pack shapes (Atoms 3–4) and execution policy resolution (Atom 1).
 *
 * @see docs/superpowers/specs/2026-04-01-resource-policy-execution-stack-design.md §4.2b, §4.3
 */

/** @typedef {'subscription' | 'api_key' | 'hybrid'} ExecutionMode */

/**
 * Resolved execution policy: drives planner, meter adapters, and enforcer wiring.
 *
 * @typedef {object} ExecutionPolicy
 * @property {ExecutionMode} mode Effective mode after merge (route may override for safety).
 * @property {Record<string, unknown>} budget Merged `resource_budget`-shaped fields.
 * @property {Record<string, unknown>} planner_rules Data-driven planner inputs; may be empty.
 * @property {string} accounting_adapter Adapter id; mirrors `mode` in v1.
 * @property {unknown} fallback_ladder Degradation ladder reference from config merge.
 */

/**
 * Normalized accounting / meter output (subset populated per mode).
 * Monetary amounts use ISO 4217 minor units; `currency` names the code when money fields are present.
 *
 * @typedef {object} NormalizedAccountingResult
 * @property {number} [estimated_input_tokens]
 * @property {number} [estimated_output_tokens]
 * @property {number} [packed_context_tokens]
 * @property {number} [compacted_from_tokens]
 * @property {number} [estimated_cost_minor]
 * @property {number} [actual_cost_minor]
 * @property {string} [currency]
 * @property {number} [pressure_score] [0, 1] for subscription / hybrid; not dollars.
 * @property {boolean|number} [throttle_detected]
 * @property {boolean|number} [model_unavailable_detected]
 * @property {boolean|number} [latency_spike_detected]
 * @property {string} [model_tier_selected]
 * @property {string} [fallback_reason]
 * @property {string} [overflow_mode_used]
 */

/**
 * Optional execution-observation extension fields (telemetry; Atom 5).
 *
 * @typedef {object} ExecutionObservationFields
 * @property {ExecutionMode} [user_mode]
 * @property {number} [estimated_input_tokens]
 * @property {number} [estimated_output_tokens]
 * @property {number} [packed_context_tokens]
 * @property {number} [compacted_from_tokens]
 * @property {number} [estimated_cost_minor]
 * @property {number} [pressure_score]
 * @property {string} [model_tier_selected]
 * @property {boolean|number} [throttle_detected]
 * @property {string} [fallback_reason]
 * @property {string} [overflow_mode_used]
 */

/**
 * @typedef {object} ExecutionPlannerOutput
 * Deterministic planner result (Atom 3). Context pack reads only this + task state.
 * @property {number} context_ceiling_tokens
 * @property {boolean} optional_passes_included
 * @property {string} [model_tier]
 */

/**
 * @typedef {object} ContextPackOmission
 * @property {string} kind
 * @property {string} detail
 * @property {number} estimated_tokens_saved
 */

/**
 * @typedef {object} ContextPackCompressionStep
 * @property {string} stage
 * @property {string} detail
 * @property {number} estimated_tokens_saved
 */

/**
 * @typedef {object} ContextPackBreakdown
 * @property {ExecutionMode} mode
 * @property {number} context_ceiling_tokens
 * @property {number} estimated_input_tokens_before
 * @property {number} estimated_input_tokens_after
 * @property {number} compacted_from_tokens
 * @property {ContextPackOmission[]} omissions
 * @property {ContextPackCompressionStep[]} compression
 * @property {boolean} [hybrid_second_pass_applied] True when hybrid mode still exceeded the ceiling after the subscription-style pass, so the API-key-style pass ran (even if the pack remained above the ceiling due to the heuristic stopping early).
 */

/**
 * @typedef {object} PackedTaskState
 * @property {string} system_prompt
 * @property {Array<{ role: string, content: string }>} messages
 * @property {string} optional_retrieval
 * @property {Array<{ title: string, body: string }>} artifacts
 */

/**
 * @typedef {object} ContextPackResult
 * @property {string} packed_text
 * @property {PackedTaskState} packed
 * @property {ContextPackBreakdown} breakdown
 */

/** Default bounded replan attempts K (§4.2a). */
export const DEFAULT_REPLAN_ATTEMPTS_K = 3;

/** Runtime config key for default replan K (enforcer / facade). */
export const RUNTIME_CONFIG_REPLAN_ATTEMPTS_KEY = "execution.replan_max_attempts";

/** @type {ReadonlySet<string>} */
const EXECUTION_MODES = new Set(["subscription", "api_key", "hybrid"]);

/** Config keys not merged into the `budget` object. */
const BUDGET_EXCLUDE = new Set(["planner_rules", "fallback_ladder"]);

/** @type {Readonly<Record<string, number>>} */
const TIER_RANK = Object.freeze({ haiku: 0, sonnet: 1, opus: 2 });

/**
 * @param {unknown} mode
 * @returns {mode is ExecutionMode}
 */
export function isExecutionMode(mode) {
  return typeof mode === "string" && EXECUTION_MODES.has(mode);
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * @param {Record<string, unknown>} o
 * @returns {Record<string, unknown>}
 */
function withoutBudgetExcluded(o) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of Object.keys(o)) {
    if (!BUDGET_EXCLUDE.has(k)) out[k] = o[k];
  }
  return out;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function narrowPreferredModelTier(a, b) {
  const ra = TIER_RANK[a];
  const rb = TIER_RANK[b];
  if (ra === undefined || rb === undefined) return a;
  const m = Math.min(ra, rb);
  return ra === m ? a : b;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function narrowMinimumModelTier(a, b) {
  const ra = TIER_RANK[a];
  const rb = TIER_RANK[b];
  if (ra === undefined || rb === undefined) return a;
  const m = Math.max(ra, rb);
  return ra === m ? a : b;
}

/**
 * @param {number} current
 * @param {number} routeVal
 * @returns {number}
 */
function narrowCap(current, routeVal) {
  if (!Number.isFinite(routeVal) || routeVal < 0) return current;
  return Math.min(current, routeVal);
}

/**
 * Merge machine → skill → project; apply route narrowing; route `mode` wins (§4.2b).
 *
 * @param {object} input
 * @param {Record<string, unknown>} input.skillBudget
 * @param {Record<string, unknown>} [input.projectConfig]
 * @param {Record<string, unknown>} [input.machineConfig]
 * @param {Record<string, unknown>} [input.route]
 * @returns {ExecutionPolicy}
 */
export function resolveExecutionPolicy(input) {
  if (!isPlainObject(input) || !isPlainObject(input.skillBudget)) {
    throw new TypeError("resolveExecutionPolicy: skillBudget must be a plain object");
  }
  const skillBudget = { ...input.skillBudget };
  const machineConfig = isPlainObject(input.machineConfig)
    ? input.machineConfig
    : {};
  const projectConfig = isPlainObject(input.projectConfig)
    ? input.projectConfig
    : {};
  const route = isPlainObject(input.route) ? input.route : {};

  /** @type {Record<string, unknown>} */
  let budget = {
    ...withoutBudgetExcluded(machineConfig),
    ...withoutBudgetExcluded(skillBudget),
  };
  for (const k of Object.keys(projectConfig)) {
    if (BUDGET_EXCLUDE.has(k)) continue;
    if (Object.prototype.hasOwnProperty.call(projectConfig, k)) {
      budget[k] = projectConfig[k];
    }
  }

  const CAP_KEYS = [
    "max_input_tokens",
    "max_output_tokens",
    "max_total_tokens",
    "max_latency_ms",
    "max_estimated_cost_minor",
    "max_monthly_spend_minor",
  ];

  const routeCaps = withoutBudgetExcluded(route);
  for (const key of CAP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(routeCaps, key)) {
      const rv = routeCaps[key];
      const cur = budget[key];
      if (typeof rv === "number" && typeof cur === "number") {
        budget[key] = narrowCap(cur, rv);
      }
    }
  }

  if (
    typeof routeCaps.preferred_model_tier === "string" &&
    typeof budget.preferred_model_tier === "string"
  ) {
    budget.preferred_model_tier = narrowPreferredModelTier(
      /** @type {string} */ (budget.preferred_model_tier),
      /** @type {string} */ (routeCaps.preferred_model_tier),
    );
  }
  if (
    typeof routeCaps.minimum_model_tier === "string" &&
    typeof budget.minimum_model_tier === "string"
  ) {
    budget.minimum_model_tier = narrowMinimumModelTier(
      /** @type {string} */ (budget.minimum_model_tier),
      /** @type {string} */ (routeCaps.minimum_model_tier),
    );
  }

  const mergedModeCandidate = budget.mode;
  const routeMode = routeCaps.mode;
  const effectiveMode = isExecutionMode(routeMode)
    ? routeMode
    : isExecutionMode(mergedModeCandidate)
      ? mergedModeCandidate
      : "subscription";

  budget = { ...budget, mode: effectiveMode };

  const planner_rules = mergePolicyObjects(
    machineConfig.planner_rules,
    skillBudget.planner_rules,
    projectConfig.planner_rules,
    route.planner_rules,
  );

  const fallback_ladder = pickFallbackLadder(
    machineConfig.fallback_ladder,
    skillBudget.fallback_ladder,
    projectConfig.fallback_ladder,
    route.fallback_ladder,
  );

  return {
    mode: effectiveMode,
    budget,
    planner_rules,
    accounting_adapter: effectiveMode,
    fallback_ladder,
  };
}

/**
 * @param {...unknown} layers
 * @returns {Record<string, unknown>}
 */
function mergePolicyObjects(...layers) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const layer of layers) {
    if (!isPlainObject(layer)) continue;
    Object.assign(out, layer);
  }
  return out;
}

/**
 * @param {...unknown} layers
 * @returns {unknown}
 */
function pickFallbackLadder(...layers) {
  let v;
  for (const layer of layers) {
    if (layer !== undefined) v = layer;
  }
  return v ?? null;
}

/**
 * @param {unknown} policy
 * @returns {{ ok: true, policy: ExecutionPolicy } | { ok: false, errors: string[] }}
 */
export function validateExecutionPolicy(policy) {
  const errors = [];
  if (!isPlainObject(policy)) {
    return { ok: false, errors: ["ExecutionPolicy must be an object"] };
  }
  if (!isExecutionMode(policy.mode)) {
    errors.push("ExecutionPolicy.mode must be subscription | api_key | hybrid");
  }
  if (!isPlainObject(policy.budget)) {
    errors.push("ExecutionPolicy.budget must be an object");
  }
  if (!isPlainObject(policy.planner_rules)) {
    errors.push("ExecutionPolicy.planner_rules must be an object");
  }
  if (typeof policy.accounting_adapter !== "string" || !policy.accounting_adapter) {
    errors.push("ExecutionPolicy.accounting_adapter must be a non-empty string");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, policy: /** @type {ExecutionPolicy} */ (policy) };
}

/**
 * @param {unknown} raw
 * @param {ExecutionMode} mode
 * @returns {{ ok: true, value: NormalizedAccountingResult } | { ok: false, errors: string[] }}
 */
export function validateNormalizedAccountingResult(raw, mode) {
  if (!isExecutionMode(mode)) {
    return { ok: false, errors: ["validateNormalizedAccountingResult: invalid mode"] };
  }
  if (raw === null || raw === undefined) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["NormalizedAccountingResult must be an object"] };
  }
  const errors = [];

  if (raw.pressure_score !== undefined) {
    const p = raw.pressure_score;
    if (typeof p !== "number" || p < 0 || p > 1 || Number.isNaN(p)) {
      errors.push("pressure_score must be a number in [0, 1]");
    }
  }

  for (const key of ["estimated_cost_minor", "actual_cost_minor"]) {
    const v = raw[key];
    if (v !== undefined && (!Number.isInteger(v) || v < 0)) {
      errors.push(`${key} must be a non-negative integer when present`);
    }
  }

  for (const key of [
    "estimated_input_tokens",
    "estimated_output_tokens",
    "packed_context_tokens",
    "compacted_from_tokens",
  ]) {
    const v = raw[key];
    if (v !== undefined && (typeof v !== "number" || v < 0 || Number.isNaN(v))) {
      errors.push(`${key} must be a non-negative number when present`);
    }
  }

  for (const key of [
    "throttle_detected",
    "model_unavailable_detected",
    "latency_spike_detected",
  ]) {
    const v = raw[key];
    if (v !== undefined && typeof v !== "boolean" && typeof v !== "number") {
      errors.push(`${key} must be boolean or number when present`);
    }
  }

  if (raw.currency !== undefined && typeof raw.currency !== "string") {
    errors.push("currency must be a string when present");
  }

  if (mode === "subscription") {
    if (raw.estimated_cost_minor !== undefined || raw.actual_cost_minor !== undefined) {
      errors.push("subscription mode: monetary fields must not be set on accounting result");
    }
  }
  if (mode === "api_key") {
    if (raw.pressure_score !== undefined) {
      errors.push("api_key mode: pressure_score must not be set on accounting result");
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: /** @type {NormalizedAccountingResult} */ (raw) };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: ExecutionObservationFields } | { ok: false, errors: string[] }}
 */
export function validateExecutionObservationFields(raw) {
  if (raw === null || raw === undefined) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["ExecutionObservationFields must be an object"] };
  }
  const errors = [];
  if (raw.user_mode !== undefined && !isExecutionMode(raw.user_mode)) {
    errors.push("user_mode must be subscription | api_key | hybrid when present");
  }
  if (raw.pressure_score !== undefined) {
    const p = raw.pressure_score;
    if (typeof p !== "number" || p < 0 || p > 1 || Number.isNaN(p)) {
      errors.push("pressure_score must be a number in [0, 1] when present");
    }
  }
  for (const key of [
    "estimated_input_tokens",
    "estimated_output_tokens",
    "packed_context_tokens",
    "compacted_from_tokens",
    "estimated_cost_minor",
  ]) {
    const v = raw[key];
    if (v !== undefined && (typeof v !== "number" || v < 0 || Number.isNaN(v))) {
      errors.push(`${key} must be a non-negative number when present`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: /** @type {ExecutionObservationFields} */ (raw) };
}

/**
 * @param {unknown} value
 * @returns {ExecutionPlannerOutput | null}
 */
export function validateExecutionPlannerOutput(value) {
  if (value === null || typeof value !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (value);
  const ceiling = o.context_ceiling_tokens;
  const passes = o.optional_passes_included;
  if (typeof ceiling !== "number" || !Number.isFinite(ceiling) || ceiling < 1) {
    return null;
  }
  if (typeof passes !== "boolean") return null;
  const tier = o.model_tier;
  if (tier !== undefined && typeof tier !== "string") return null;
  return {
    context_ceiling_tokens: Math.floor(ceiling),
    optional_passes_included: passes,
    ...(tier !== undefined ? { model_tier: tier } : {}),
  };
}
