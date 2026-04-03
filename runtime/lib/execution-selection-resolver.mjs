/**
 * Execution selection resolver
 *
 * Final join algorithm that selects the cheapest valid route-plus-model pair,
 * derives ExecutionSelection, and shapes fallback chain.
 *
 * Rules:
 * - Forms compatible route-plus-model pairs
 * - Drops pairs failing hard constraints or floors
 * - Derives pair_cost deterministically
 * - Chooses cheapest valid pair with deterministic tie-breaks
 * - Fallback is derived after primary selection
 */

/**
 * Resolve execution selection from route candidates and model candidates.
 *
 * @param {Object} input
 * @param {Array} input.route_candidates Array of route candidates with effective capabilities
 * @param {Array} input.model_candidates Array of model candidates from evaluator
 * @param {Object} input.policy_constraints Policy constraints and floors
 * @param {string} input.policy_constraints.minimum_quality_floor One of budget, standard, premium
 * @param {string} input.policy_constraints.minimum_reliability_floor One of meets_floor, above_floor, high_margin
 * @param {string} [input.fallback_policy] Cross-route fallback policy (optional)
 * @param {string} input.resolver_version Version identifier
 * @param {string} input.policy_version Overall policy version
 *
 * @returns {Object} ExecutionSelection or {error}
 */
export function resolveExecutionSelection(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Input must be a non-null object');
  }

  const { route_candidates, model_candidates, policy_constraints, resolver_version, policy_version } = input;

  if (!Array.isArray(route_candidates) || route_candidates.length === 0) {
    throw new Error('route_candidates must be a non-empty array');
  }

  if (!Array.isArray(model_candidates) || model_candidates.length === 0) {
    throw new Error('model_candidates must be a non-empty array');
  }

  if (!policy_constraints || typeof policy_constraints !== 'object') {
    throw new Error('policy_constraints is required');
  }

  if (!resolver_version) {
    throw new Error('resolver_version is required');
  }

  if (!policy_version) {
    throw new Error('policy_version is required');
  }

  // Step 1: Form valid route-plus-model pairs
  const validPairs = [];

  for (const route of route_candidates) {
    for (const model of model_candidates) {
      const pair = {
        route,
        model,
        pair_cost: derivePairCost(route, model),
        evidence_depth: deriveEvidenceDepth(route),
      };

      // Check if pair passes quality and reliability floors
      if (meetsQualityFloor(pair, policy_constraints.minimum_quality_floor) &&
          meetsReliabilityFloor(pair, policy_constraints.minimum_reliability_floor)) {
        validPairs.push(pair);
      }
    }
  }

  if (validPairs.length === 0) {
    return {
      error: 'no_valid_pairs',
      reason: 'No route-model pairs meet constraints and minimum floors',
    };
  }

  // Step 2: Select cheapest valid pair with deterministic tie-breaks
  const selectedPair = selectCheapestPair(validPairs);

  // Step 3: Generate fallback chain
  const fallback_chain = generateFallbackChain(
    selectedPair,
    validPairs,
    route_candidates,
    input.fallback_policy
  );

  // Step 4: Construct selection basis
  const selection_basis = {
    constraints_passed: true,
    route_admissible: true,
    quality_floor_met: true,
    reliability_floor_met: true,
    quality_posture: policy_constraints.minimum_quality_floor,
    reliability_posture: policy_constraints.minimum_reliability_floor,
    latency_posture: selectedPair.model.latency_risk,
    cost_posture: selectedPair.model.cost_basis,
    fallback_used: false,
  };

  // Step 5: Build ExecutionSelection
  const execution_selection = {
    selected_route: {
      route_id: selectedPair.route.route_id,
      route_kind: selectedPair.route.route_kind,
      effective_capabilities: {
        artifact_completeness: selectedPair.route.effective_capabilities.artifact_completeness,
        history_availability: selectedPair.route.effective_capabilities.history_availability,
        locality_confidence: selectedPair.route.effective_capabilities.locality_confidence,
        verification_ceiling: selectedPair.route.effective_capabilities.verification_ceiling,
        allowed_task_classes: selectedPair.route.effective_capabilities.allowed_task_classes,
      },
    },
    resolved_model_path: {
      provider: selectedPair.model.provider,
      model_id: selectedPair.model.model_id,
      model_tier: selectedPair.model.model_tier,
      execution_mode: selectedPair.model.execution_mode,
    },
    fallback_chain,
    policy_version,
    selection_basis,
    selection_reason: generateSelectionReason(selectedPair, selection_basis),
  };

  return {
    execution_selection,
    resolver_version,
    selection_success: true,
  };
}

/**
 * Derive pair cost deterministically from route and model characteristics.
 * @private
 */
function derivePairCost(route, model) {
  const costOrder = { cost_efficient: 0, cost_balanced: 1, cost_heavy: 2 };
  const completenessOrder = { repo_complete: 0, repo_partial: 1, artifact_complete: 2, diff_only: 3 };
  const historyOrder = { repo_history: 0, change_history: 1, artifact_limited_history: 2, no_history: 3 };

  const modelCostRank = costOrder[model.cost_basis];
  const routeCompletenessRank = completenessOrder[route.effective_capabilities.artifact_completeness];
  const routeHistoryRank = historyOrder[route.effective_capabilities.history_availability];
  const isDiffOnly = route.effective_capabilities.artifact_completeness === 'diff_only';

  // Pair cost increases with narrower scope (higher ranks) and higher model cost
  // Formula: model_cost * 1000 + completeness_rank * 100 + history_rank * 10 + (diff_only ? 0 : 1)
  return modelCostRank * 1000 + routeCompletenessRank * 100 + routeHistoryRank * 10 + (isDiffOnly ? 0 : 1);
}

/**
 * Derive evidence depth from route characteristics.
 * @private
 */
function deriveEvidenceDepth(route) {
  const completenessMap = {
    repo_complete: 4,
    repo_partial: 3,
    artifact_complete: 2,
    diff_only: 1,
  };
  return completenessMap[route.effective_capabilities.artifact_completeness] || 0;
}

/**
 * Check if pair meets quality floor.
 * @private
 */
function meetsQualityFloor(pair, minimumQuality) {
  const tierOrder = { budget: 0, standard: 1, premium: 2 };
  return tierOrder[pair.model.model_tier] >= tierOrder[minimumQuality];
}

/**
 * Check if pair meets reliability floor.
 * @private
 */
function meetsReliabilityFloor(pair, minimumReliability) {
  const reliabilityOrder = { meets_floor: 0, above_floor: 1, high_margin: 2 };
  return reliabilityOrder[pair.model.reliability_margin] >= reliabilityOrder[minimumReliability];
}

/**
 * Select the cheapest valid pair with deterministic tie-breaks.
 * @private
 */
function selectCheapestPair(pairs) {
  const latencyOrder = { interactive_safe: 0, interactive_tolerable: 1, background_biased: 2 };
  const reliabilityOrder = { meets_floor: 0, above_floor: 1, high_margin: 2 };

  let selected = pairs[0];

  for (let i = 1; i < pairs.length; i++) {
    const pair = pairs[i];

    // Compare by cost first
    if (pair.pair_cost < selected.pair_cost) {
      selected = pair;
    } else if (pair.pair_cost === selected.pair_cost) {
      // Tie-break 1: Higher evidence depth
      if (pair.evidence_depth > selected.evidence_depth) {
        selected = pair;
      } else if (pair.evidence_depth === selected.evidence_depth) {
        // Tie-break 2: Stronger reliability margin
        if (reliabilityOrder[pair.model.reliability_margin] > reliabilityOrder[selected.model.reliability_margin]) {
          selected = pair;
        } else if (reliabilityOrder[pair.model.reliability_margin] === reliabilityOrder[selected.model.reliability_margin]) {
          // Tie-break 3: Lower latency risk
          if (latencyOrder[pair.model.latency_risk] < latencyOrder[selected.model.latency_risk]) {
            selected = pair;
          }
          // Tie-break 4: Config order (already handled by iteration order)
        }
      }
    }
  }

  return selected;
}

/**
 * Generate fallback chain after primary selection.
 * @private
 */
function generateFallbackChain(selectedPair, validPairs, routeCandidates, fallbackPolicy) {
  const fallback_chain = [];

  // Route-preserving fallback: other models with same route
  const sameRouteFallbacks = validPairs.filter(
    p => p.route.route_id === selectedPair.route.route_id && p !== selectedPair
  );

  sameRouteFallbacks.forEach(pair => {
    fallback_chain.push({
      route_id: pair.route.route_id,
      route_kind: pair.route.route_kind,
      resolved_model_path: {
        provider: pair.model.provider,
        model_id: pair.model.model_id,
        model_tier: pair.model.model_tier,
        execution_mode: pair.model.execution_mode,
      },
      fallback_reason_class: 'model_unavailable',
    });
  });

  // Cross-route fallback: if policy allows and other routes are compatible
  if (fallbackPolicy === 'allow_cross_route') {
    const otherRouteFallbacks = validPairs.filter(p => p.route.route_id !== selectedPair.route.route_id);

    otherRouteFallbacks.forEach(pair => {
      fallback_chain.push({
        route_id: pair.route.route_id,
        route_kind: pair.route.route_kind,
        resolved_model_path: {
          provider: pair.model.provider,
          model_id: pair.model.model_id,
          model_tier: pair.model.model_tier,
          execution_mode: pair.model.execution_mode,
        },
        fallback_reason_class: 'route_unavailable',
      });
    });
  }

  return fallback_chain;
}

/**
 * Generate a short selection reason from structured fields.
 * @private
 */
function generateSelectionReason(selectedPair, selectionBasis) {
  const parts = [
    `route: ${selectedPair.route.route_id}`,
    `model: ${selectedPair.model.provider}/${selectedPair.model.model_id}`,
    `cost: ${selectedPair.model.cost_basis}`,
    `reliability: ${selectedPair.model.reliability_margin}`,
  ];
  return parts.join('; ');
}
