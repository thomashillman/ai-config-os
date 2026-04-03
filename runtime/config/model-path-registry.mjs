/**
 * Canonical model-path registry (v1)
 *
 * Static, declarative definition of all available model paths.
 * Each entry includes identity, compatibility, and policy-class metadata.
 *
 * Contract version: model_policy_version = v1
 */

export const model_policy_version = "v1";

/**
 * @type {Array<{
 *   identity: {provider: string, model_id: string},
 *   compatibility: {supported_execution_modes: Array<'sync' | 'streaming' | 'batch'>},
 *   policy_classes: {
 *     model_tier: 'budget' | 'standard' | 'premium',
 *     cost_basis: 'cost_efficient' | 'cost_balanced' | 'cost_heavy',
 *     reliability_margin: 'meets_floor' | 'above_floor' | 'high_margin',
 *     latency_risk: 'interactive_safe' | 'interactive_tolerable' | 'background_biased'
 *   }
 * }>}
 */
export const modelPathRegistry = [
  {
    identity: {
      provider: "anthropic",
      model_id: "claude-haiku-4-5-20251001",
    },
    compatibility: {
      supported_execution_modes: ["sync", "streaming"],
    },
    policy_classes: {
      model_tier: "budget",
      cost_basis: "cost_efficient",
      reliability_margin: "above_floor",
      latency_risk: "interactive_safe",
    },
  },
  {
    identity: {
      provider: "anthropic",
      model_id: "claude-sonnet-4-6",
    },
    compatibility: {
      supported_execution_modes: ["sync", "streaming"],
    },
    policy_classes: {
      model_tier: "standard",
      cost_basis: "cost_balanced",
      reliability_margin: "high_margin",
      latency_risk: "interactive_safe",
    },
  },
  {
    identity: {
      provider: "anthropic",
      model_id: "claude-opus-4-6",
    },
    compatibility: {
      supported_execution_modes: ["sync", "streaming"],
    },
    policy_classes: {
      model_tier: "premium",
      cost_basis: "cost_heavy",
      reliability_margin: "high_margin",
      latency_risk: "interactive_tolerable",
    },
  },
  {
    identity: {
      provider: "anthropic",
      model_id: "claude-batch-1",
    },
    compatibility: {
      supported_execution_modes: ["batch"],
    },
    policy_classes: {
      model_tier: "budget",
      cost_basis: "cost_efficient",
      reliability_margin: "meets_floor",
      latency_risk: "background_biased",
    },
  },
];

/**
 * Look up a model path by provider and model_id.
 * @param {string} provider
 * @param {string} modelId
 * @returns {typeof modelPathRegistry[0] | null}
 */
export function findModelPath(provider, modelId) {
  return (
    modelPathRegistry.find(
      (m) =>
        m.identity.provider === provider && m.identity.model_id === modelId,
    ) || null
  );
}
