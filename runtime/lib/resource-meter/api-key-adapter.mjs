/**
 * API-key mode: spend estimates from token counts × local pricing profile.
 */

/**
 * @param {Record<string, unknown>} profile from load-pricing-profile or inline
 * @param {string} tier haiku | sonnet | opus
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number} minor units (non-negative integer)
 */
export function computeCostMinorFromTokens(
  profile,
  tier,
  inputTokens,
  outputTokens,
) {
  const tiers = /** @type {Record<string, unknown>} */ (profile.tiers);
  const t = tiers?.[tier];
  if (!t || typeof t !== "object" || Array.isArray(t)) {
    throw new TypeError(`api-key meter: unknown tier ${tier}`);
  }
  const row = /** @type {Record<string, unknown>} */ (t);
  const inRate = row.input_per_1k_tokens_minor;
  const outRate = row.output_per_1k_tokens_minor;
  if (typeof inRate !== "number" || typeof outRate !== "number") {
    throw new TypeError(`api-key meter: tier ${tier} missing rate fields`);
  }
  const i = Math.max(0, inputTokens);
  const o = Math.max(0, outputTokens);
  const cost = (i / 1000) * inRate + (o / 1000) * outRate;
  return Math.max(0, Math.floor(cost));
}

/**
 * @param {Record<string, unknown>} pricingProfile
 * @param {string} [defaultTier]
 * @returns {{ estimate: Function; observe: Function }}
 */
export function createApiKeyMeter(pricingProfile, defaultTier = "haiku") {
  const currency = String(pricingProfile.currency ?? "USD");

  /**
   * @param {object} ctx
   * @param {number} [ctx.estimated_input_tokens]
   * @param {number} [ctx.estimated_output_tokens]
   * @param {string} [ctx.model_tier]
   * @returns {NormalizedAccountingResult}
   */
  function estimate(ctx) {
    const tier = ctx.model_tier ?? defaultTier;
    const ein = Number(ctx.estimated_input_tokens ?? 0);
    const eout = Number(ctx.estimated_output_tokens ?? 0);
    const minor = computeCostMinorFromTokens(pricingProfile, tier, ein, eout);
    return {
      estimated_input_tokens: ein,
      estimated_output_tokens: eout,
      estimated_cost_minor: minor,
      currency,
      model_tier_selected: tier,
    };
  }

  /**
   * @param {object} ctx
   * @param {number} [ctx.actual_input_tokens]
   * @param {number} [ctx.actual_output_tokens]
   * @param {string} [ctx.model_tier]
   * @returns {NormalizedAccountingResult}
   */
  function observe(ctx) {
    const tier = ctx.model_tier ?? defaultTier;
    const ain = Number(ctx.actual_input_tokens ?? 0);
    const aout = Number(ctx.actual_output_tokens ?? 0);
    const minor = computeCostMinorFromTokens(pricingProfile, tier, ain, aout);
    return {
      estimated_input_tokens: ain,
      estimated_output_tokens: aout,
      actual_cost_minor: minor,
      currency,
      model_tier_selected: tier,
    };
  }

  return { estimate, observe };
}
