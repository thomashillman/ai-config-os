/**
 * Resource meter factory (Atom 2): mode-specific accounting adapters.
 */

export { loadPricingProfileFromFile } from "./load-pricing-profile.mjs";
export {
  createApiKeyMeter,
  computeCostMinorFromTokens,
} from "./api-key-adapter.mjs";
export {
  createSubscriptionMeter,
  computeSubscriptionPressure,
} from "./subscription-adapter.mjs";
export { createHybridMeter } from "./hybrid-adapter.mjs";

import { createApiKeyMeter } from "./api-key-adapter.mjs";
import { createSubscriptionMeter } from "./subscription-adapter.mjs";
import { createHybridMeter } from "./hybrid-adapter.mjs";

/**
 * @param {object} options
 * @param {'subscription'|'api_key'|'hybrid'} options.mode
 * @param {Record<string, unknown>} [options.pricingProfile] required for api_key and hybrid
 * @param {string} [options.defaultTier]
 * @returns {{ estimate: (ctx: object) => object; observe: (ctx: object) => object }}
 */
export function createResourceMeter(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("createResourceMeter: options object required");
  }
  const mode = options.mode;
  const tier =
    typeof options.defaultTier === "string" ? options.defaultTier : "haiku";
  if (mode === "api_key") {
    if (!options.pricingProfile || typeof options.pricingProfile !== "object") {
      throw new TypeError(
        "createResourceMeter: pricingProfile required for api_key",
      );
    }
    return createApiKeyMeter(
      /** @type {Record<string, unknown>} */ (options.pricingProfile),
      tier,
    );
  }
  if (mode === "subscription") {
    return createSubscriptionMeter();
  }
  if (mode === "hybrid") {
    if (!options.pricingProfile || typeof options.pricingProfile !== "object") {
      throw new TypeError(
        "createResourceMeter: pricingProfile required for hybrid",
      );
    }
    return createHybridMeter(
      /** @type {Record<string, unknown>} */ (options.pricingProfile),
      tier,
    );
  }
  throw new TypeError(`createResourceMeter: unknown mode ${String(mode)}`);
}
