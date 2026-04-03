/**
 * Model-path evaluator
 *
 * Consumes canonical model registry, policy intent, route compatibility projection,
 * and dynamic runtime overlays. Emits a bounded (max-3) admissible frontier of
 * model-path candidates.
 *
 * Rules:
 * - Only admissible candidates (meeting hard constraints and minimum floors) are emitted.
 * - Max 3 representatives from non-dominated frontier.
 * - Deterministic representative ordering.
 * - No rejected candidates emitted.
 * - No prose rationale.
 */

/**
 * Evaluate admissible model paths given policy intent and route constraints.
 *
 * @param {Object} input - Evaluator input envelope
 * @param {Array} input.registry_snapshot - Expanded concrete model-path registry
 * @param {Object} input.policy_intent
 * @param {string} input.policy_intent.quality_tier One of budget, standard, premium
 * @param {string} input.policy_intent.reliability_tier One of meets_floor, above_floor, high_margin
 * @param {string} input.policy_intent.latency_posture One of interactive_safe, interactive_tolerable, background_biased
 * @param {string} input.policy_intent.cost_posture One of cost_efficient, cost_balanced, cost_heavy
 * @param {Object} input.route_compatibility_projection
 * @param {Array<string>} input.route_compatibility_projection.allowed_execution_modes Array of allowed execution modes
 * @param {string} input.route_compatibility_projection.minimum_model_tier One of budget, standard, premium
 * @param {string} [input.route_compatibility_projection.preferred_model_tier] Preferred tier
 * @param {Object} input.dynamic_runtime_overlays
 * @param {Array<string>} [input.dynamic_runtime_overlays.availability_state] Models currently available
 * @param {string} [input.dynamic_runtime_overlays.live_cost_pressure_class] Cost pressure context
 * @param {string} [input.dynamic_runtime_overlays.overflow_posture] How to handle token overflow
 * @param {Object} [input.dynamic_runtime_overlays.temporary_policy_suppressions] Temporary overrides
 *
 * @returns {Object} Admissible frontier
 * @throws {Error} if input is invalid
 */
export function evaluateModelPaths(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Input must be a non-null object");
  }

  const {
    registry_snapshot,
    policy_intent,
    route_compatibility_projection,
    dynamic_runtime_overlays,
  } = input;

  if (!Array.isArray(registry_snapshot)) {
    throw new Error("registry_snapshot must be an array");
  }

  if (!policy_intent || typeof policy_intent !== "object") {
    throw new Error("policy_intent is required");
  }

  if (
    !route_compatibility_projection ||
    typeof route_compatibility_projection !== "object"
  ) {
    throw new Error("route_compatibility_projection is required");
  }

  if (!Array.isArray(route_compatibility_projection.allowed_execution_modes)) {
    throw new Error(
      "route_compatibility_projection.allowed_execution_modes must be an array",
    );
  }

  if (!route_compatibility_projection.minimum_model_tier) {
    throw new Error(
      "route_compatibility_projection.minimum_model_tier is required",
    );
  }

  const overlays = dynamic_runtime_overlays || {};

  // Step 1: Filter to admissible candidates based on hard constraints and minimum floors
  const admissible = registry_snapshot
    .map((modelPath, originalIndex) => {
      const candidate = fromRegistryEntry(
        modelPath,
        originalIndex,
        route_compatibility_projection.allowed_execution_modes,
      );
      return candidate;
    })
    .filter(
      (candidate) =>
        isExecutionModeCompatible(
          candidate,
          route_compatibility_projection.allowed_execution_modes,
        ) &&
        isTierMinimumMet(
          candidate,
          route_compatibility_projection.minimum_model_tier,
        ) &&
        isReliabilityFloorMet(candidate, policy_intent.reliability_tier) &&
        isAvailable(candidate, overlays.availability_state),
    );

  if (admissible.length === 0) {
    return {
      admissible_candidates: [],
      frontier_reason: "no_candidates_meet_constraints",
    };
  }

  // Step 2: Build non-dominated frontier over cost_basis, reliability_margin, latency_risk
  const nonDominated = computeNonDominatedFrontier(admissible);

  // Step 3: Select up to 3 representatives with deterministic ordering
  const representatives = selectRepresentatives(nonDominated);

  return {
    admissible_candidates: representatives,
    frontier_size: admissible.length,
    non_dominated_frontier_size: nonDominated.length,
  };
}

/**
 * Convert registry entry to internal candidate representation.
 * @private
 */
function fromRegistryEntry(modelPath, originalIndex, allowedModes) {
  const pc = modelPath.policy_classes;
  const supportedModes = modelPath.compatibility.supported_execution_modes;

  // Select the first allowed mode from supported modes
  let executionMode = supportedModes[0];
  if (allowedModes) {
    for (const mode of supportedModes) {
      if (allowedModes.includes(mode)) {
        executionMode = mode;
        break;
      }
    }
  }

  return {
    provider: modelPath.identity.provider,
    model_id: modelPath.identity.model_id,
    model_tier: pc.model_tier,
    execution_mode: executionMode,
    supported_execution_modes: supportedModes,
    cost_basis: pc.cost_basis,
    reliability_margin: pc.reliability_margin,
    latency_risk: pc.latency_risk,
    _originalIndex: originalIndex,
  };
}

/**
 * Check if candidate's execution modes overlap with allowed modes.
 * @private
 */
function isExecutionModeCompatible(candidate, allowedModes) {
  return candidate.supported_execution_modes.some((mode) =>
    allowedModes.includes(mode),
  );
}

/**
 * Check if candidate meets minimum tier requirement.
 * @private
 */
function isTierMinimumMet(candidate, minimumTier) {
  const tierOrder = { budget: 0, standard: 1, premium: 2 };
  return tierOrder[candidate.model_tier] >= tierOrder[minimumTier];
}

/**
 * Check if candidate meets reliability floor.
 * @private
 */
function isReliabilityFloorMet(candidate, reliabilityTier) {
  const reliabilityOrder = { meets_floor: 0, above_floor: 1, high_margin: 2 };
  return (
    reliabilityOrder[candidate.reliability_margin] >=
    reliabilityOrder[reliabilityTier]
  );
}

/**
 * Check if candidate is available given runtime state.
 * @private
 */
function isAvailable(candidate, availabilityState) {
  // If no availability state specified, assume all are available
  if (!availabilityState || !Array.isArray(availabilityState)) {
    return true;
  }

  const key = `${candidate.provider}:${candidate.model_id}`;
  return availabilityState.includes(key);
}

/**
 * Compute non-dominated frontier over three dimensions.
 * A candidate A dominates candidate B if A is better or equal on all three dimensions
 * and strictly better on at least one.
 *
 * Dimensions (better values):
 * - cost_basis: cost_efficient (0) > cost_balanced (1) > cost_heavy (2)
 * - reliability_margin: high_margin (2) > above_floor (1) > meets_floor (0)
 * - latency_risk: interactive_safe (0) > interactive_tolerable (1) > background_biased (2)
 *
 * For dominance: lower order values are better for cost and latency; higher for reliability.
 *
 * @private
 */
function computeNonDominatedFrontier(candidates) {
  const costOrder = { cost_efficient: 0, cost_balanced: 1, cost_heavy: 2 };
  const reliabilityOrder = { meets_floor: 0, above_floor: 1, high_margin: 2 };
  const latencyOrder = {
    interactive_safe: 0,
    interactive_tolerable: 1,
    background_biased: 2,
  };

  const nonDominated = [];

  for (const candidate of candidates) {
    let isDominated = false;

    for (const other of nonDominated) {
      // Check if 'other' dominates 'candidate'
      // For cost and latency: lower rank is better, so subtract candidate from other
      // For reliability: higher rank is better, so subtract other from candidate
      const costOtherBetter =
        costOrder[other.cost_basis] <= costOrder[candidate.cost_basis];
      const reliabilityOtherBetter =
        reliabilityOrder[other.reliability_margin] >=
        reliabilityOrder[candidate.reliability_margin];
      const latencyOtherBetter =
        latencyOrder[other.latency_risk] <=
        latencyOrder[candidate.latency_risk];

      const costStrictlyBetter =
        costOrder[other.cost_basis] < costOrder[candidate.cost_basis];
      const reliabilityStrictlyBetter =
        reliabilityOrder[other.reliability_margin] >
        reliabilityOrder[candidate.reliability_margin];
      const latencyStrictlyBetter =
        latencyOrder[other.latency_risk] < latencyOrder[candidate.latency_risk];

      const otherBetter =
        costOtherBetter && reliabilityOtherBetter && latencyOtherBetter;
      const otherStrictlyBetter =
        costStrictlyBetter ||
        reliabilityStrictlyBetter ||
        latencyStrictlyBetter;

      if (otherBetter && otherStrictlyBetter) {
        // 'other' dominates 'candidate'
        isDominated = true;
        break;
      }
    }

    if (!isDominated) {
      // Remove any candidates that 'candidate' dominates
      const filtered = [];
      for (const other of nonDominated) {
        const costCandidateBetter =
          costOrder[candidate.cost_basis] <= costOrder[other.cost_basis];
        const reliabilityCandidateBetter =
          reliabilityOrder[candidate.reliability_margin] >=
          reliabilityOrder[other.reliability_margin];
        const latencyCandidateBetter =
          latencyOrder[candidate.latency_risk] <=
          latencyOrder[other.latency_risk];

        const costStrictlyBetter =
          costOrder[candidate.cost_basis] < costOrder[other.cost_basis];
        const reliabilityStrictlyBetter =
          reliabilityOrder[candidate.reliability_margin] >
          reliabilityOrder[other.reliability_margin];
        const latencyStrictlyBetter =
          latencyOrder[candidate.latency_risk] <
          latencyOrder[other.latency_risk];

        const candidateBetter =
          costCandidateBetter &&
          reliabilityCandidateBetter &&
          latencyCandidateBetter;
        const candidateStrictlyBetter =
          costStrictlyBetter ||
          reliabilityStrictlyBetter ||
          latencyStrictlyBetter;

        if (!(candidateBetter && candidateStrictlyBetter)) {
          filtered.push(other);
        }
      }

      filtered.push(candidate);
      nonDominated.length = 0;
      nonDominated.push(...filtered);
    }
  }

  return nonDominated;
}

/**
 * Select up to 3 representatives from non-dominated frontier with deterministic ordering.
 * @private
 */
function selectRepresentatives(nonDominated) {
  if (nonDominated.length === 0) {
    return [];
  }

  const costOrder = { cost_efficient: 0, cost_balanced: 1, cost_heavy: 2 };
  const reliabilityOrder = { meets_floor: 0, above_floor: 1, high_margin: 2 };
  const latencyOrder = {
    interactive_safe: 0,
    interactive_tolerable: 1,
    background_biased: 2,
  };

  const representatives = [];
  const used = new Set();

  // 1. Cheapest admissible candidate (lowest cost_basis order)
  let cheapest = nonDominated[0];
  let cheapestIdx = 0;
  for (let i = 0; i < nonDominated.length; i++) {
    const c = nonDominated[i];
    if (
      costOrder[c.cost_basis] < costOrder[cheapest.cost_basis] ||
      (costOrder[c.cost_basis] === costOrder[cheapest.cost_basis] &&
        c._originalIndex < cheapest._originalIndex)
    ) {
      cheapest = c;
      cheapestIdx = i;
    }
  }
  representatives.push(cheapest);
  used.add(cheapestIdx);

  // 2. Strongest reliability-margin candidate from remaining (highest reliability order)
  if (nonDominated.length > 1) {
    let strongest = null;
    let strongestIdx = -1;
    for (let i = 0; i < nonDominated.length; i++) {
      if (!used.has(i)) {
        const c = nonDominated[i];
        if (
          !strongest ||
          reliabilityOrder[c.reliability_margin] >
            reliabilityOrder[strongest.reliability_margin] ||
          (reliabilityOrder[c.reliability_margin] ===
            reliabilityOrder[strongest.reliability_margin] &&
            c._originalIndex < strongest._originalIndex)
        ) {
          strongest = c;
          strongestIdx = i;
        }
      }
    }
    if (strongest) {
      representatives.push(strongest);
      used.add(strongestIdx);
    }
  }

  // 3. Lowest latency-risk candidate from remaining (lowest latency order)
  if (nonDominated.length > 2) {
    let lowestLatency = null;
    let lowestIdx = -1;
    for (let i = 0; i < nonDominated.length; i++) {
      if (!used.has(i)) {
        const c = nonDominated[i];
        if (
          !lowestLatency ||
          latencyOrder[c.latency_risk] <
            latencyOrder[lowestLatency.latency_risk] ||
          (latencyOrder[c.latency_risk] ===
            latencyOrder[lowestLatency.latency_risk] &&
            c._originalIndex < lowestLatency._originalIndex)
        ) {
          lowestLatency = c;
          lowestIdx = i;
        }
      }
    }
    if (lowestLatency) {
      representatives.push(lowestLatency);
      used.add(lowestIdx);
    }
  }

  // Return max 3
  return representatives.slice(0, 3).map((c) => ({
    provider: c.provider,
    model_id: c.model_id,
    model_tier: c.model_tier,
    execution_mode: c.execution_mode,
    cost_basis: c.cost_basis,
    reliability_margin: c.reliability_margin,
    latency_risk: c.latency_risk,
  }));
}
