/**
 * Deterministic normalization for `resource_budget` skill frontmatter.
 * Defaults apply only to optional subscription knobs; api_key and hybrid pass through.
 */

/** @type {Readonly<{ pressure_threshold: number; premium_tier_allowed: boolean; defer_nonessential_passes: boolean; backoff_on_throttle: boolean; reserve_headroom: number }>} */
const SUBSCRIPTION_OPTIONAL_DEFAULTS = Object.freeze({
  pressure_threshold: 0.85,
  premium_tier_allowed: true,
  defer_nonessential_passes: true,
  backoff_on_throttle: true,
  reserve_headroom: 0.2,
});

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown> | null}
 */
export function normalizeResourceBudget(raw) {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  const mode = o.mode;
  if (mode === "subscription") {
    return {
      ...o,
      pressure_threshold:
        o.pressure_threshold ??
        SUBSCRIPTION_OPTIONAL_DEFAULTS.pressure_threshold,
      premium_tier_allowed:
        o.premium_tier_allowed ??
        SUBSCRIPTION_OPTIONAL_DEFAULTS.premium_tier_allowed,
      defer_nonessential_passes:
        o.defer_nonessential_passes ??
        SUBSCRIPTION_OPTIONAL_DEFAULTS.defer_nonessential_passes,
      backoff_on_throttle:
        o.backoff_on_throttle ??
        SUBSCRIPTION_OPTIONAL_DEFAULTS.backoff_on_throttle,
      reserve_headroom:
        o.reserve_headroom ?? SUBSCRIPTION_OPTIONAL_DEFAULTS.reserve_headroom,
    };
  }
  if (mode === "api_key" || mode === "hybrid") {
    return { ...o };
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function getResourceBudgetMode(raw) {
  const n = normalizeResourceBudget(raw);
  if (!n || typeof n.mode !== "string") return null;
  return n.mode;
}
