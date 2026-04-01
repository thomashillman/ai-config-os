/**
 * Hybrid mode: both spend (API leg) and pressure (subscription leg) in one accounting view.
 */

import { createApiKeyMeter } from "./api-key-adapter.mjs";
import { createSubscriptionMeter } from "./subscription-adapter.mjs";

/**
 * @param {Record<string, unknown>} pricingProfile
 * @param {string} [defaultTier]
 */
export function createHybridMeter(pricingProfile, defaultTier = "haiku") {
  const api = createApiKeyMeter(pricingProfile, defaultTier);
  const sub = createSubscriptionMeter();

  return {
    /**
     * @param {object} ctx
     */
    estimate(ctx) {
      const a = api.estimate(ctx);
      const s = sub.estimate(ctx);
      return {
        estimated_input_tokens: a.estimated_input_tokens,
        estimated_output_tokens: a.estimated_output_tokens,
        estimated_cost_minor: a.estimated_cost_minor,
        currency: a.currency,
        pressure_score: s.pressure_score,
        model_tier_selected: a.model_tier_selected ?? s.model_tier_selected,
        overflow_mode_used: undefined,
      };
    },
    /**
     * @param {object} ctx
     */
    observe(ctx) {
      const a = api.observe(ctx);
      const s = sub.observe(ctx);
      return {
        estimated_input_tokens:
          a.estimated_input_tokens ?? s.estimated_input_tokens,
        estimated_output_tokens:
          a.estimated_output_tokens ?? s.estimated_output_tokens,
        actual_cost_minor: a.actual_cost_minor,
        currency: a.currency,
        pressure_score: s.pressure_score,
        throttle_detected: s.throttle_detected,
        model_unavailable_detected: s.model_unavailable_detected,
        latency_spike_detected: s.latency_spike_detected,
        model_tier_selected: a.model_tier_selected ?? s.model_tier_selected,
      };
    },
  };
}
