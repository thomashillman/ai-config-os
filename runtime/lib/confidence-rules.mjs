/**
 * confidence-rules.mjs
 *
 * Pure data module: route ID → confidence level mapping.
 * No I/O, no side effects.
 */

export const ROUTE_CONFIDENCE_MAP = Object.freeze({
  pasted_diff: "low",
  uploaded_bundle: "low",
  github_pr: "medium",
  local_repo: "high",
});

export const CONFIDENCE_BASIS_MAP = Object.freeze({
  pasted_diff: "diff_only",
  uploaded_bundle: "bundle_context",
  github_pr: "github_context",
  local_repo: "full_repo_verification",
});

/** Ordinal ordering of confidence levels (weakest → strongest). */
export const CONFIDENCE_ORDER = Object.freeze(["low", "medium", "high"]);

/**
 * Returns the confidence and confidence_basis for a route.
 * @param {string} routeId
 * @returns {{ confidence: string, confidence_basis: string }}
 * @throws {Error} if routeId is unknown
 */
export function confidenceForRoute(routeId) {
  const confidence = ROUTE_CONFIDENCE_MAP[routeId];
  if (!confidence) {
    throw new Error(
      `Unknown route ID: "${routeId}". Expected one of: ${Object.keys(ROUTE_CONFIDENCE_MAP).join(", ")}`,
    );
  }
  return {
    confidence,
    confidence_basis: CONFIDENCE_BASIS_MAP[routeId],
  };
}

/**
 * Returns true if proposed confidence is strictly higher than current.
 * @param {string} current - current confidence level
 * @param {string} proposed - proposed confidence level
 * @returns {boolean}
 */
export function canUpgradeConfidence(current, proposed) {
  const ci = CONFIDENCE_ORDER.indexOf(current);
  const pi = CONFIDENCE_ORDER.indexOf(proposed);
  if (ci === -1) throw new Error(`Unknown confidence level: "${current}"`);
  if (pi === -1) throw new Error(`Unknown confidence level: "${proposed}"`);
  return pi > ci;
}

/**
 * Compares two confidence levels by ordinal position.
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compareConfidence(a, b) {
  const ai = CONFIDENCE_ORDER.indexOf(a);
  const bi = CONFIDENCE_ORDER.indexOf(b);
  if (ai === -1) throw new Error(`Unknown confidence level: "${a}"`);
  if (bi === -1) throw new Error(`Unknown confidence level: "${b}"`);
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}
