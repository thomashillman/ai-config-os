/**
 * Deterministic execution planner (Atom 3). Model tier and options come from data + policy, not LLM.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateExecutionPlannerOutput } from "../../shared/contracts/resource-policy-types.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_PATH = join(
  __dirname,
  "..",
  "config",
  "planner-rules.yaml",
);

/** @type {Readonly<Record<string, number>>} */
const TIER_RANK = Object.freeze({ haiku: 0, sonnet: 1, opus: 2 });

const TIERS_BY_RANK = /** @type {const} */ (["haiku", "sonnet", "opus"]);

/**
 * @param {unknown} rules
 * @returns {Record<string, unknown>}
 */
function assertRules(rules) {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    throw new TypeError("planner rules: expected object root");
  }
  return /** @type {Record<string, unknown>} */ (rules);
}

/**
 * @param {string} [filePath]
 * @returns {Record<string, unknown>}
 */
export function loadPlannerRulesFromFile(filePath = DEFAULT_RULES_PATH) {
  const raw = readFileSync(filePath, "utf8");
  const parsed = parseYaml(raw);
  const o = assertRules(parsed);
  if (typeof o.version !== "number") {
    throw new TypeError("planner-rules: version (number) required");
  }
  if (!o.task_classes || typeof o.task_classes !== "object") {
    throw new TypeError("planner-rules: task_classes required");
  }
  return o;
}

let cachedDefaultRules = null;

/**
 * @returns {Record<string, unknown>}
 */
export function getDefaultPlannerRules() {
  if (!cachedDefaultRules) {
    cachedDefaultRules = loadPlannerRulesFromFile();
  }
  return cachedDefaultRules;
}

/**
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} overlay
 * @returns {Record<string, unknown>}
 */
function mergeTaskClasses(base, overlay) {
  const b =
    base.task_classes && typeof base.task_classes === "object"
      ? /** @type {Record<string, unknown>} */ (base.task_classes)
      : {};
  const o =
    overlay.task_classes && typeof overlay.task_classes === "object"
      ? /** @type {Record<string, unknown>} */ (overlay.task_classes)
      : {};
  /** @type {Record<string, unknown>} */
  const out = { ...b };
  for (const k of Object.keys(o)) {
    const patch = o[k];
    const prev = out[k];
    if (
      prev &&
      typeof prev === "object" &&
      !Array.isArray(prev) &&
      patch &&
      typeof patch === "object" &&
      !Array.isArray(patch)
    ) {
      out[k] = {
        .../** @type {Record<string, unknown>} */ (prev),
        .../** @type {Record<string, unknown>} */ (patch),
      };
    } else if (patch !== undefined) {
      out[k] = patch;
    }
  }
  return { ...base, task_classes: out };
}

/**
 * @param {Record<string, unknown>} defaults
 * @param {Record<string, unknown>} policyRules
 * @returns {Record<string, unknown>}
 */
export function mergePlannerRules(defaults, policyRules) {
  if (!policyRules || typeof policyRules !== "object") {
    return defaults;
  }
  return mergeTaskClasses(defaults, policyRules);
}

/**
 * @param {string} tier
 * @param {string} minTier skill budget minimum_model_tier
 * @param {string} maxTier skill budget preferred_model_tier (ceiling)
 * @returns {string}
 */
export function clampTierToBudget(tier, minTier, maxTier) {
  const t = TIER_RANK[tier] ?? TIER_RANK.sonnet;
  const lo = TIER_RANK[minTier] ?? TIER_RANK.haiku;
  const hi = TIER_RANK[maxTier] ?? TIER_RANK.opus;
  const c = Math.max(lo, Math.min(hi, t));
  return TIERS_BY_RANK[c];
}

/**
 * @param {object} input
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy} input.policy
 * @param {string} [input.task_class]
 * @param {Record<string, unknown>} [input.signals] mock: pressure_score, estimated_cost_minor, throttle_detected
 * @param {Record<string, unknown>} [input.rules] full merged rules (optional; else default + policy.planner_rules)
 * @returns {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPlannerOutput}
 */
export function planExecution(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("planExecution: input required");
  }
  const policy = input.policy;
  if (!policy || typeof policy !== "object") {
    throw new TypeError("planExecution: policy required");
  }
  const budget =
    policy.budget && typeof policy.budget === "object"
      ? /** @type {Record<string, unknown>} */ (policy.budget)
      : {};
  const mode = policy.mode;

  const defaults = getDefaultPlannerRules();
  const mergedRules =
    input.rules && typeof input.rules === "object"
      ? /** @type {Record<string, unknown>} */ (input.rules)
      : mergePlannerRules(
          defaults,
          policy.planner_rules && typeof policy.planner_rules === "object"
            ? /** @type {Record<string, unknown>} */ (policy.planner_rules)
            : {},
        );

  const taskClass =
    typeof input.task_class === "string" && input.task_class.trim()
      ? input.task_class.trim()
      : "balanced";
  const classes =
    mergedRules.task_classes && typeof mergedRules.task_classes === "object"
      ? /** @type {Record<string, unknown>} */ (mergedRules.task_classes)
      : {};
  const tcRaw =
    classes[taskClass] && typeof classes[taskClass] === "object"
      ? /** @type {Record<string, unknown>} */ (classes[taskClass])
      : classes.balanced && typeof classes.balanced === "object"
        ? /** @type {Record<string, unknown>} */ (classes.balanced)
        : null;
  if (!tcRaw) {
    throw new TypeError(`planExecution: unknown task_class ${taskClass}`);
  }

  const ceilingRatio =
    typeof tcRaw.ceiling_ratio === "number" &&
    tcRaw.ceiling_ratio > 0 &&
    tcRaw.ceiling_ratio <= 1
      ? tcRaw.ceiling_ratio
      : 0.55;
  const ruleTier =
    typeof tcRaw.rule_tier === "string" ? tcRaw.rule_tier : "sonnet";

  const maxIn =
    typeof budget.max_input_tokens === "number" && budget.max_input_tokens > 0
      ? budget.max_input_tokens
      : 100_000;
  let reserveHeadroom = 0;
  if (
    typeof budget.reserve_headroom === "number" &&
    budget.reserve_headroom >= 0 &&
    budget.reserve_headroom < 1
  ) {
    reserveHeadroom = budget.reserve_headroom;
  } else if (mode === "subscription" && budget.reserve_headroom === undefined) {
    reserveHeadroom = 0.2;
  }
  const effectiveMax =
    mode === "subscription"
      ? Math.max(1, Math.floor(maxIn * (1 - reserveHeadroom)))
      : maxIn;

  let contextCeiling = Math.max(1, Math.floor(effectiveMax * ceilingRatio));

  const minTier = String(budget.minimum_model_tier ?? "haiku");
  let maxTier = String(budget.preferred_model_tier ?? "opus");

  if (mode === "subscription") {
    const allowPremium = budget.premium_tier_allowed !== false;
    if (!allowPremium && TIER_RANK[maxTier] > TIER_RANK.sonnet) {
      maxTier = "sonnet";
    }
  }

  let modelTier = clampTierToBudget(ruleTier, minTier, maxTier);

  if (mode === "subscription") {
    if (TIER_RANK[modelTier] > TIER_RANK.sonnet) {
      contextCeiling = Math.max(1, Math.floor(contextCeiling * 0.88));
    }
  }

  const signals =
    input.signals && typeof input.signals === "object"
      ? /** @type {Record<string, unknown>} */ (input.signals)
      : {};

  let optionalPasses = true;

  if (mode === "subscription" || mode === "hybrid") {
    const th =
      typeof budget.pressure_threshold === "number"
        ? budget.pressure_threshold
        : 0.85;
    const p =
      typeof signals.pressure_score === "number" ? signals.pressure_score : 0;
    const defer = budget.defer_nonessential_passes !== false;
    if (!defer || p >= th) {
      optionalPasses = false;
    }
    if (mode === "subscription" && TIER_RANK[modelTier] >= TIER_RANK.opus) {
      optionalPasses = false;
    }
  }

  if (mode === "api_key" || mode === "hybrid") {
    const cap = budget.max_estimated_cost_minor;
    const est = signals.estimated_cost_minor;
    if (
      typeof cap === "number" &&
      cap >= 0 &&
      typeof est === "number" &&
      est > cap * 0.85
    ) {
      optionalPasses = false;
    }
    if (
      mode === "api_key" &&
      typeof est === "number" &&
      typeof cap === "number"
    ) {
      if (est > cap) {
        modelTier = clampTierToBudget("haiku", minTier, maxTier);
        contextCeiling = Math.max(1, Math.floor(contextCeiling * 0.75));
      }
    }
  }

  if (signals.throttle_detected === 1 || signals.throttle_detected === true) {
    modelTier = clampTierToBudget("haiku", minTier, maxTier);
    optionalPasses = false;
  }

  const out = {
    context_ceiling_tokens: contextCeiling,
    optional_passes_included: optionalPasses,
    model_tier: modelTier,
  };
  const v = validateExecutionPlannerOutput(out);
  if (!v) {
    throw new TypeError("planExecution: invalid planner output");
  }
  return v;
}
