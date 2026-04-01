/**
 * Subscription mode: pressure score from token volume, tier, and provider signals (not dollars).
 */

import { extractProviderSignals } from "../adapters/provider-signals.mjs";

/** Rolling volume scale: at this many tokens, volume-only pressure approaches 1.0 before tier/signal bumps. */
const BASE_TOKEN_SCALE = 400_000;

/**
 * @param {string | undefined} tier
 * @returns {number} additive pressure in [0, ~0.35]
 */
function tierPressureBump(tier) {
  const m = { haiku: 0, sonnet: 0.12, opus: 0.28 };
  return m[/** @type {keyof typeof m} */ (tier)] ?? 0.08;
}

/**
 * @param {object} ctx
 * @param {number} [ctx.input_tokens]
 * @param {number} [ctx.output_tokens]
 * @param {string} [ctx.model_tier]
 * @param {boolean|number} [ctx.throttle_detected]
 * @param {boolean|number} [ctx.model_unavailable_detected]
 * @param {boolean|number} [ctx.latency_spike_detected]
 * @returns {number} [0, 1]
 */
export function computeSubscriptionPressure(ctx) {
  const ein = Math.max(0, Number(ctx.input_tokens ?? 0));
  const eout = Math.max(0, Number(ctx.output_tokens ?? 0));
  const total = ein + eout;
  let p = Math.min(1, total / BASE_TOKEN_SCALE);
  p += tierPressureBump(ctx.model_tier);
  const th = ctx.throttle_detected;
  const mu = ctx.model_unavailable_detected;
  const ls = ctx.latency_spike_detected;
  if (th === true || th === 1) p += 0.22;
  if (mu === true || mu === 1) p += 0.12;
  if (ls === true || ls === 1) p += 0.08;
  return Math.min(1, Math.max(0, p));
}

/**
 * @returns {{ estimate: Function; observe: Function }}
 */
export function createSubscriptionMeter() {
  /**
   * @param {object} ctx
   * @param {number} [ctx.estimated_input_tokens]
   * @param {number} [ctx.estimated_output_tokens]
   * @param {string} [ctx.model_tier]
   */
  function estimate(ctx) {
    const ein = Number(ctx.estimated_input_tokens ?? 0);
    const eout = Number(ctx.estimated_output_tokens ?? 0);
    const p = computeSubscriptionPressure({
      input_tokens: ein,
      output_tokens: eout,
      model_tier: ctx.model_tier,
      throttle_detected: false,
      model_unavailable_detected: false,
      latency_spike_detected: false,
    });
    return {
      estimated_input_tokens: ein,
      estimated_output_tokens: eout,
      pressure_score: p,
      model_tier_selected: ctx.model_tier,
    };
  }

  /**
   * @param {object} ctx
   * @param {number} [ctx.actual_input_tokens]
   * @param {number} [ctx.actual_output_tokens]
   * @param {string} [ctx.model_tier]
   * @param {unknown} [ctx.provider_signals]
   */
  function observe(ctx) {
    const ain = Number(ctx.actual_input_tokens ?? 0);
    const aout = Number(ctx.actual_output_tokens ?? 0);
    const sig = extractProviderSignals(ctx.provider_signals ?? {});
    const p = computeSubscriptionPressure({
      input_tokens: ain,
      output_tokens: aout,
      model_tier: ctx.model_tier,
      throttle_detected: sig.throttle_detected,
      model_unavailable_detected: sig.model_unavailable_detected,
      latency_spike_detected: sig.latency_spike_detected,
    });
    return {
      estimated_input_tokens: ain,
      estimated_output_tokens: aout,
      pressure_score: p,
      throttle_detected: sig.throttle_detected,
      model_unavailable_detected: sig.model_unavailable_detected,
      latency_spike_detected: sig.latency_spike_detected,
      model_tier_selected: ctx.model_tier,
    };
  }

  return { estimate, observe };
}
