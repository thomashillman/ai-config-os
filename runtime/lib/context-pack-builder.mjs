/**
 * Context pack builder (Atom 4): planner output + task state → packed input + breakdown.
 */

import { validateExecutionPolicy } from "../../shared/contracts/resource-policy-types.mjs";
import {
  estimatePackedTaskStateTokens,
  estimateTokensFromString,
  truncateStringToMaxTokens,
} from "./token-estimate.mjs";

/**
 * @typedef {object} TaskStateInput
 * @property {string} [system_prompt]
 * @property {Array<{ role: string, content: string }>} [messages]
 * @property {string} [optional_retrieval]
 * @property {Array<{ title: string, body: string }>} [artifacts]
 */

/**
 * @param {unknown} v
 * @returns {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState}
 */
function normalizePacked(v) {
  const o =
    v && typeof v === "object"
      ? /** @type {Record<string, unknown>} */ (v)
      : {};
  return {
    system_prompt: typeof o.system_prompt === "string" ? o.system_prompt : "",
    messages: Array.isArray(o.messages)
      ? o.messages.map((m) => {
          const row =
            m && typeof m === "object"
              ? /** @type {Record<string, unknown>} */ (m)
              : {};
          return {
            role: typeof row.role === "string" ? row.role : "user",
            content: typeof row.content === "string" ? row.content : "",
          };
        })
      : [],
    optional_retrieval:
      typeof o.optional_retrieval === "string" ? o.optional_retrieval : "",
    artifacts: Array.isArray(o.artifacts)
      ? o.artifacts.map((a) => {
          const row =
            a && typeof a === "object"
              ? /** @type {Record<string, unknown>} */ (a)
              : {};
          return {
            title: typeof row.title === "string" ? row.title : "",
            body: typeof row.body === "string" ? row.body : "",
          };
        })
      : [],
  };
}

/**
 * @param {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState} packed
 * @returns {string}
 */
export function serializePackedTaskState(packed) {
  const parts = [];
  if (packed.system_prompt) parts.push(packed.system_prompt);
  for (const m of packed.messages) {
    parts.push(`${m.role}: ${m.content}`);
  }
  if (packed.optional_retrieval) parts.push(packed.optional_retrieval);
  for (const a of packed.artifacts) {
    parts.push(`${a.title}\n${a.body}`);
  }
  return parts.join("\n\n");
}

/**
 * @param {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState} state
 * @returns {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState}
 */
function clonePacked(state) {
  return {
    system_prompt: state.system_prompt,
    messages: state.messages.map((m) => ({ ...m })),
    optional_retrieval: state.optional_retrieval,
    artifacts: state.artifacts.map((a) => ({ ...a })),
  };
}

/**
 * @param {object} input
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPolicy} input.policy
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ExecutionPlannerOutput} input.planner
 * @param {TaskStateInput} input.taskState
 * @returns {import('../../shared/contracts/resource-policy-types.mjs').ContextPackResult}
 */
export function buildContextPack(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("buildContextPack: input required");
  }
  const pol = input.policy;
  const planner = input.planner;
  const rawTask = input.taskState;
  if (!pol || typeof pol !== "object") {
    throw new TypeError("buildContextPack: policy required");
  }
  if (!planner || typeof planner !== "object") {
    throw new TypeError("buildContextPack: planner required");
  }
  const v = validateExecutionPolicy(pol);
  if (!v.ok) {
    throw new TypeError(
      `buildContextPack: invalid policy: ${v.errors.join("; ")}`,
    );
  }
  const mode = v.policy.mode;
  const ceiling = Math.floor(planner.context_ceiling_tokens);
  if (!Number.isFinite(ceiling) || ceiling < 1) {
    throw new TypeError(
      "buildContextPack: planner.context_ceiling_tokens invalid",
    );
  }

  const optionalPasses = planner.optional_passes_included === true;

  let packed = normalizePacked(rawTask);

  /** @type {import('../../shared/contracts/resource-policy-types.mjs').ContextPackOmission[]} */
  const omissions = [];
  /** @type {import('../../shared/contracts/resource-policy-types.mjs').ContextPackCompressionStep[]} */
  const compression = [];

  if (!optionalPasses && packed.optional_retrieval) {
    const saved = estimateTokensFromString(packed.optional_retrieval);
    packed.optional_retrieval = "";
    omissions.push({
      kind: "optional_retrieval",
      detail: "excluded: planner.optional_passes_included is false",
      estimated_tokens_saved: saved,
    });
  }

  const beforeTokens = estimatePackedTaskStateTokens(packed);

  let hybridSecond = false;

  if (mode === "subscription") {
    packed = compactSubscriptionStyle(packed, ceiling, omissions, compression);
  } else if (mode === "api_key") {
    packed = compactApiKeyStyle(packed, ceiling, omissions, compression);
  } else {
    packed = compactSubscriptionStyle(packed, ceiling, omissions, compression);
    const afterSub = estimatePackedTaskStateTokens(packed);
    if (afterSub > ceiling) {
      hybridSecond = true;
      packed = compactApiKeyStyle(packed, ceiling, omissions, compression);
    }
  }

  const afterTokens = estimatePackedTaskStateTokens(packed);
  const packedText = serializePackedTaskState(packed);

  /** @type {import('../../shared/contracts/resource-policy-types.mjs').ContextPackBreakdown} */
  const breakdown = {
    mode,
    context_ceiling_tokens: ceiling,
    estimated_input_tokens_before: beforeTokens,
    estimated_input_tokens_after: afterTokens,
    compacted_from_tokens: Math.max(0, beforeTokens - afterTokens),
    omissions,
    compression,
    ...(mode === "hybrid" ? { hybrid_second_pass_applied: hybridSecond } : {}),
  };

  return {
    packed_text: packedText,
    packed,
    breakdown,
  };
}

/**
 * Subscription: drop retrieval → artifacts → oldest messages → truncate.
 *
 * @param {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState} packed
 * @param {number} ceiling
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ContextPackOmission[]} omissions
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ContextPackCompressionStep[]} compression
 * @returns {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState}
 */
function compactSubscriptionStyle(packed, ceiling, omissions, compression) {
  let state = clonePacked(packed);
  let guard = 0;
  while (estimatePackedTaskStateTokens(state) > ceiling && guard++ < 1000) {
    const before = estimatePackedTaskStateTokens(state);
    if (state.optional_retrieval) {
      const saved = estimateTokensFromString(state.optional_retrieval);
      state.optional_retrieval = "";
      omissions.push({
        kind: "optional_retrieval",
        detail: "removed: subscription compaction (headroom)",
        estimated_tokens_saved: saved,
      });
      continue;
    }
    if (state.artifacts.length > 0) {
      const removed = /** @type {{ title: string, body: string }} */ (
        state.artifacts.shift()
      );
      const saved =
        estimateTokensFromString(removed.title) +
        estimateTokensFromString(removed.body);
      omissions.push({
        kind: "artifact",
        detail: `removed artifact: ${removed.title}`,
        estimated_tokens_saved: saved,
      });
      continue;
    }
    if (state.messages.length > 1) {
      const removed = /** @type {{ role: string, content: string }} */ (
        state.messages.shift()
      );
      const saved = estimateTokensFromString(removed.content);
      omissions.push({
        kind: "message",
        detail: `removed oldest ${removed.role} message`,
        estimated_tokens_saved: saved,
      });
      continue;
    }
    if (!shrinkLargestTextField(state, ceiling, compression)) {
      break;
    }
    const after = estimatePackedTaskStateTokens(state);
    if (after >= before) break;
  }
  return state;
}

/**
 * API key: drop oldest messages → retrieval → artifacts → truncate.
 *
 * @param {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState} packed
 * @param {number} ceiling
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ContextPackOmission[]} omissions
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ContextPackCompressionStep[]} compression
 * @returns {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState}
 */
function compactApiKeyStyle(packed, ceiling, omissions, compression) {
  let state = clonePacked(packed);
  let guard = 0;
  while (estimatePackedTaskStateTokens(state) > ceiling && guard++ < 1000) {
    const before = estimatePackedTaskStateTokens(state);
    if (state.messages.length > 1) {
      const removed = /** @type {{ role: string, content: string }} */ (
        state.messages.shift()
      );
      const saved = estimateTokensFromString(removed.content);
      omissions.push({
        kind: "message",
        detail: `removed oldest ${removed.role} message (spend order)`,
        estimated_tokens_saved: saved,
      });
      continue;
    }
    if (state.optional_retrieval) {
      const saved = estimateTokensFromString(state.optional_retrieval);
      state.optional_retrieval = "";
      omissions.push({
        kind: "optional_retrieval",
        detail: "removed: api_key compaction (cost order)",
        estimated_tokens_saved: saved,
      });
      continue;
    }
    if (state.artifacts.length > 0) {
      const removed = /** @type {{ title: string, body: string }} */ (
        state.artifacts.shift()
      );
      const saved =
        estimateTokensFromString(removed.title) +
        estimateTokensFromString(removed.body);
      omissions.push({
        kind: "artifact",
        detail: `removed artifact: ${removed.title} (spend order)`,
        estimated_tokens_saved: saved,
      });
      continue;
    }
    if (!shrinkLargestTextField(state, ceiling, compression)) {
      break;
    }
    const after = estimatePackedTaskStateTokens(state);
    if (after >= before) break;
  }
  return state;
}

/**
 * Truncate the single largest text field so the packed state fits `ceiling` (binary search).
 *
 * @param {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState} state
 * @param {number} ceiling
 * @param {import('../../shared/contracts/resource-policy-types.mjs').ContextPackCompressionStep[]} compression
 * @returns {boolean} false if nothing could be shrunk
 */
function shrinkLargestTextField(state, ceiling, compression) {
  const total = estimatePackedTaskStateTokens(state);
  if (total <= ceiling) return true;

  let best = /** @type {'system' | 'message' | 'artifact' | null} */ (null);
  let bestIdx = -1;
  let bestTokens = 0;

  const sysT = estimateTokensFromString(state.system_prompt);
  if (sysT >= bestTokens) {
    bestTokens = sysT;
    best = "system";
  }
  if (state.messages.length === 1) {
    const t = estimateTokensFromString(state.messages[0].content);
    if (t > bestTokens) {
      bestTokens = t;
      best = "message";
      bestIdx = 0;
    }
  }
  for (let i = 0; i < state.artifacts.length; i++) {
    const t =
      estimateTokensFromString(state.artifacts[i].title) +
      estimateTokensFromString(state.artifacts[i].body);
    if (t > bestTokens) {
      bestTokens = t;
      best = "artifact";
      bestIdx = i;
    }
  }

  if (best === null || bestTokens <= 0) return false;

  const others = total - bestTokens;
  const budgetTokens = Math.max(0, ceiling - others);
  const beforeField = bestTokens;

  if (best === "system") {
    const next = truncateStringToMaxTokens(state.system_prompt, budgetTokens);
    state.system_prompt = next;
    const afterField = estimateTokensFromString(next);
    compression.push({
      stage: "system_truncation",
      detail: "trimmed system prompt to fit ceiling",
      estimated_tokens_saved: Math.max(0, beforeField - afterField),
    });
    return true;
  }
  if (best === "message" && bestIdx >= 0) {
    const before = state.messages[bestIdx].content;
    const next = truncateStringToMaxTokens(before, budgetTokens);
    state.messages[bestIdx] = { ...state.messages[bestIdx], content: next };
    const afterField = estimateTokensFromString(next);
    compression.push({
      stage: "message_truncation",
      detail: "trimmed message to fit ceiling",
      estimated_tokens_saved: Math.max(0, beforeField - afterField),
    });
    return true;
  }
  if (best === "artifact" && bestIdx >= 0) {
    const art = state.artifacts[bestIdx];
    const titleT = estimateTokensFromString(art.title);
    const bodyBudget = Math.max(0, budgetTokens - titleT);
    const nextBody = truncateStringToMaxTokens(art.body, bodyBudget);
    state.artifacts[bestIdx] = { ...art, body: nextBody };
    const afterField = titleT + estimateTokensFromString(nextBody);
    compression.push({
      stage: "artifact_truncation",
      detail: `trimmed body: ${art.title}`,
      estimated_tokens_saved: Math.max(0, beforeField - afterField),
    });
    return true;
  }
  return false;
}
