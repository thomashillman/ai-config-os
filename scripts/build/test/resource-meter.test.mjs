/**
 * Resource meter (Atom 2): pricing, adapters, provider signals.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeImport } from "../lib/windows-safe-import.mjs";

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const PRICING_YAML = join(REPO_ROOT, "runtime/config/pricing-profile.yaml");

const {
  loadPricingProfileFromFile,
  createResourceMeter,
  computeCostMinorFromTokens,
  computeSubscriptionPressure,
  createApiKeyMeter,
} = await safeImport(
  "../../../runtime/lib/resource-meter/index.mjs",
  import.meta.url,
);

const { extractProviderSignals } = await safeImport(
  "../../../runtime/lib/adapters/provider-signals.mjs",
  import.meta.url,
);

const { validateNormalizedAccountingResult } = await safeImport(
  "../../../shared/contracts/resource-policy-types.mjs",
  import.meta.url,
);

test("loadPricingProfileFromFile reads versioned YAML", () => {
  const p = loadPricingProfileFromFile(PRICING_YAML);
  assert.equal(p.version, 1);
  assert.equal(p.currency, "USD");
  assert.ok(p.tiers && typeof p.tiers === "object");
});

test("computeCostMinorFromTokens: known haiku 1k in + 0.5k out", () => {
  const p = loadPricingProfileFromFile(PRICING_YAML);
  const minor = computeCostMinorFromTokens(p, "haiku", 1000, 500);
  assert.equal(minor, 62);
});

test("api_key meter estimate matches pricing table (sonnet)", () => {
  const p = loadPricingProfileFromFile(PRICING_YAML);
  const meter = createApiKeyMeter(p, "sonnet");
  const r = meter.estimate({
    estimated_input_tokens: 2000,
    estimated_output_tokens: 1000,
    model_tier: "sonnet",
  });
  assert.equal(r.estimated_cost_minor, 2100);
  assert.equal(r.currency, "USD");
  assert.equal(validateNormalizedAccountingResult(r, "api_key").ok, true);
});

test("subscription: pressure increases with premium tier at same token volume", () => {
  const p1 = computeSubscriptionPressure({
    input_tokens: 10_000,
    output_tokens: 5_000,
    model_tier: "haiku",
  });
  const p2 = computeSubscriptionPressure({
    input_tokens: 10_000,
    output_tokens: 5_000,
    model_tier: "opus",
  });
  assert.ok(p2 > p1);
});

test("subscription observe: throttle bumps pressure vs same tokens without signal", () => {
  const meter = createResourceMeter({ mode: "subscription" });
  const base = meter.observe({
    actual_input_tokens: 50_000,
    actual_output_tokens: 10_000,
    model_tier: "sonnet",
    provider_signals: {},
  });
  const throttled = meter.observe({
    actual_input_tokens: 50_000,
    actual_output_tokens: 10_000,
    model_tier: "sonnet",
    provider_signals: { http_status: 429 },
  });
  assert.ok(throttled.pressure_score > base.pressure_score);
  assert.equal(
    validateNormalizedAccountingResult(base, "subscription").ok,
    true,
  );
});

test("extractProviderSignals: 429 and rate limit body", () => {
  const a = extractProviderSignals({ http_status: 429 });
  assert.equal(a.throttle_detected, 1);
  const b = extractProviderSignals({ body_snippet: "Rate limit exceeded" });
  assert.equal(b.throttle_detected, 1);
});

test("createResourceMeter api_key requires pricingProfile", () => {
  assert.throws(
    () => createResourceMeter({ mode: "api_key" }),
    /pricingProfile/,
  );
});

test("hybrid estimate includes cost and pressure", () => {
  const p = loadPricingProfileFromFile(PRICING_YAML);
  const meter = createResourceMeter({
    mode: "hybrid",
    pricingProfile: p,
    defaultTier: "haiku",
  });
  const r = meter.estimate({
    estimated_input_tokens: 1000,
    estimated_output_tokens: 500,
    model_tier: "haiku",
  });
  assert.equal(typeof r.estimated_cost_minor, "number");
  assert.equal(typeof r.pressure_score, "number");
  assert.equal(validateNormalizedAccountingResult(r, "hybrid").ok, true);
});

test("computeCostMinorFromTokens throws when tier rates missing", () => {
  assert.throws(
    () =>
      computeCostMinorFromTokens(
        { currency: "USD", tiers: { haiku: {} } },
        "haiku",
        100,
        100,
      ),
    /rate fields/,
  );
});
