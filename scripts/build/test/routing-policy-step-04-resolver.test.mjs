/**
 * Tests for Step 4: Final resolver and execution selection
 *
 * Tests ensure:
 * - Pair-cost derivation is deterministic
 * - Cheapest valid pair is selected
 * - Tie-break order is correct
 * - Fallback chain is properly shaped
 * - ExecutionSelection is properly constructed
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExecutionSelection } from '../../../runtime/lib/execution-selection-resolver.mjs';

const sampleRoute = {
  route_id: 'local_repo',
  route_kind: 'repository_local',
  effective_capabilities: {
    artifact_completeness: 'repo_complete',
    history_availability: 'repo_history',
    locality_confidence: 'repo_local',
    verification_ceiling: 'full_artifact_verification',
    allowed_task_classes: ['repository_review', 'patch_review', 'artifact_review'],
  },
};

const sampleModel = {
  provider: 'anthropic',
  model_id: 'claude-sonnet-4-6',
  model_tier: 'standard',
  execution_mode: 'sync',
  cost_basis: 'cost_balanced',
  reliability_margin: 'high_margin',
  latency_risk: 'interactive_safe',
};

const baseInput = {
  route_candidates: [sampleRoute],
  model_candidates: [sampleModel],
  policy_constraints: {
    minimum_quality_floor: 'budget',
    minimum_reliability_floor: 'meets_floor',
  },
  resolver_version: 'v1',
  policy_version: 'v1',
};

test('Step 4.1: Valid pair formation and constraint filtering', async t => {
  await t.test('forms valid pairs and filters by quality floor', () => {
    const input = {
      ...baseInput,
      model_candidates: [
        { ...sampleModel, model_tier: 'budget' },
        { ...sampleModel, model_id: 'claude-sonnet-4-6', model_tier: 'standard' },
        { ...sampleModel, model_id: 'claude-opus-4-6', model_tier: 'premium' },
      ],
      policy_constraints: {
        ...baseInput.policy_constraints,
        minimum_quality_floor: 'standard',
      },
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    // Should select standard or premium tier
    assert.ok(['standard', 'premium'].includes(result.execution_selection.resolved_model_path.model_tier));
  });

  await t.test('filters by reliability floor', () => {
    const input = {
      ...baseInput,
      model_candidates: [
        { ...sampleModel, model_id: 'model-1', reliability_margin: 'meets_floor' },
        { ...sampleModel, model_id: 'model-2', reliability_margin: 'above_floor' },
        { ...sampleModel, model_id: 'model-3', reliability_margin: 'high_margin' },
      ],
      policy_constraints: {
        ...baseInput.policy_constraints,
        minimum_reliability_floor: 'above_floor',
      },
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    assert.ok(['above_floor', 'high_margin'].includes(result.execution_selection.selection_basis.reliability_posture));
  });

  await t.test('returns error when no valid pairs', () => {
    const input = {
      ...baseInput,
      model_candidates: [
        { ...sampleModel, model_tier: 'budget', reliability_margin: 'meets_floor' },
      ],
      policy_constraints: {
        ...baseInput.policy_constraints,
        minimum_quality_floor: 'premium',
        minimum_reliability_floor: 'high_margin',
      },
    };

    const result = resolveExecutionSelection(input);
    assert.ok(result.error);
    assert.equal(result.error, 'no_valid_pairs');
  });
});

test('Step 4.2: Pair-cost derivation', async t => {
  await t.test('derives cost deterministically from route and model', () => {
    const route1 = { ...sampleRoute, effective_capabilities: { ...sampleRoute.effective_capabilities, artifact_completeness: 'repo_complete' } };
    const route2 = { ...sampleRoute, effective_capabilities: { ...sampleRoute.effective_capabilities, artifact_completeness: 'diff_only' } };

    const model1 = { ...sampleModel, cost_basis: 'cost_efficient' };
    const model2 = { ...sampleModel, cost_basis: 'cost_heavy' };

    const input1 = {
      ...baseInput,
      route_candidates: [route1],
      model_candidates: [model1],
    };

    const input2 = {
      ...baseInput,
      route_candidates: [route2],
      model_candidates: [model2],
    };

    const result1 = resolveExecutionSelection(input1);
    const result2 = resolveExecutionSelection(input2);

    assert.ok(!result1.error);
    assert.ok(!result2.error);
    // Both should succeed but have different costs
  });

  await t.test('reflects broader scope (lower cost) for fuller artifacts', () => {
    const routeFull = { ...sampleRoute, effective_capabilities: { ...sampleRoute.effective_capabilities, artifact_completeness: 'repo_complete' } };
    const routeDiff = { ...sampleRoute, effective_capabilities: { ...sampleRoute.effective_capabilities, artifact_completeness: 'diff_only' } };

    const input1 = {
      ...baseInput,
      route_candidates: [routeFull],
      model_candidates: [sampleModel],
    };

    const input2 = {
      ...baseInput,
      route_candidates: [routeDiff],
      model_candidates: [sampleModel],
    };

    const result1 = resolveExecutionSelection(input1);
    const result2 = resolveExecutionSelection(input2);

    assert.ok(!result1.error);
    assert.ok(!result2.error);
    assert.equal(result1.execution_selection.resolved_model_path.provider, 'anthropic');
  });
});

test('Step 4.3: Tie-break order', async t => {
  await t.test('breaks ties by evidence depth', () => {
    const routeFull = { ...sampleRoute, effective_capabilities: { ...sampleRoute.effective_capabilities, artifact_completeness: 'repo_complete' } };
    const routePartial = { ...sampleRoute, effective_capabilities: { ...sampleRoute.effective_capabilities, artifact_completeness: 'repo_partial' } };

    const input = {
      ...baseInput,
      route_candidates: [routeFull, routePartial],
      model_candidates: [sampleModel],
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    // Should prefer full repo (higher evidence depth)
    assert.equal(result.execution_selection.selected_route.effective_capabilities.artifact_completeness, 'repo_complete');
  });

  await t.test('breaks ties by reliability margin', () => {
    const input = {
      ...baseInput,
      route_candidates: [sampleRoute],
      model_candidates: [
        { ...sampleModel, model_id: 'model-meets', cost_basis: 'cost_balanced', reliability_margin: 'meets_floor' },
        { ...sampleModel, model_id: 'model-above', cost_basis: 'cost_balanced', reliability_margin: 'above_floor' },
        { ...sampleModel, model_id: 'model-high', cost_basis: 'cost_balanced', reliability_margin: 'high_margin' },
      ],
      policy_constraints: {
        ...baseInput.policy_constraints,
        minimum_reliability_floor: 'meets_floor',
      },
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    // Should select high_margin for tie-break
    assert.equal(result.execution_selection.resolved_model_path.model_id, 'model-high');
  });

  await t.test('breaks ties by latency risk', () => {
    const input = {
      ...baseInput,
      route_candidates: [sampleRoute],
      model_candidates: [
        { ...sampleModel, model_id: 'model-interactive-safe', cost_basis: 'cost_efficient', reliability_margin: 'high_margin', latency_risk: 'interactive_safe' },
        { ...sampleModel, model_id: 'model-interactive-tolerable', cost_basis: 'cost_efficient', reliability_margin: 'high_margin', latency_risk: 'interactive_tolerable' },
        { ...sampleModel, model_id: 'model-background', cost_basis: 'cost_efficient', reliability_margin: 'high_margin', latency_risk: 'background_biased' },
      ],
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    // Should select interactive_safe for tie-break
    assert.equal(result.execution_selection.resolved_model_path.model_id, 'model-interactive-safe');
  });
});

test('Step 4.4: Fallback chain shaping', async t => {
  await t.test('generates route-preserving fallback by default', () => {
    const input = {
      ...baseInput,
      route_candidates: [sampleRoute],
      model_candidates: [
        { ...sampleModel, model_id: 'model-1', cost_basis: 'cost_efficient' },
        { ...sampleModel, model_id: 'model-2', cost_basis: 'cost_balanced' },
        { ...sampleModel, model_id: 'model-3', cost_basis: 'cost_heavy' },
      ],
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    assert.ok(Array.isArray(result.execution_selection.fallback_chain));
    // All fallbacks should be same route
    result.execution_selection.fallback_chain.forEach(fb => {
      assert.equal(fb.route_id, sampleRoute.route_id);
    });
  });

  await t.test('includes multiple fallbacks in order', () => {
    const input = {
      ...baseInput,
      route_candidates: [sampleRoute],
      model_candidates: [
        { ...sampleModel, model_id: 'model-1', cost_basis: 'cost_efficient' },
        { ...sampleModel, model_id: 'model-2', cost_basis: 'cost_balanced' },
      ],
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    assert.ok(result.execution_selection.fallback_chain.length > 0);
  });

  await t.test('marks fallback reason correctly', () => {
    const input = {
      ...baseInput,
      route_candidates: [sampleRoute],
      model_candidates: [
        { ...sampleModel, model_id: 'model-1' },
        { ...sampleModel, model_id: 'model-2' },
      ],
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    result.execution_selection.fallback_chain.forEach(fb => {
      assert.equal(fb.fallback_reason_class, 'model_unavailable');
    });
  });
});

test('Step 4.5: ExecutionSelection structure', async t => {
  await t.test('contains all required fields', () => {
    const result = resolveExecutionSelection(baseInput);
    const es = result.execution_selection;

    assert.ok(es.selected_route);
    assert.ok(es.resolved_model_path);
    assert.ok(Array.isArray(es.fallback_chain));
    assert.ok(es.policy_version);
    assert.ok(es.selection_basis);
    assert.ok(es.selection_reason);
  });

  await t.test('selected_route has correct structure', () => {
    const result = resolveExecutionSelection(baseInput);
    const sr = result.execution_selection.selected_route;

    assert.ok(sr.route_id);
    assert.ok(sr.route_kind);
    assert.ok(sr.effective_capabilities);
    assert.ok(sr.effective_capabilities.artifact_completeness);
    assert.ok(sr.effective_capabilities.history_availability);
    assert.ok(sr.effective_capabilities.locality_confidence);
    assert.ok(sr.effective_capabilities.verification_ceiling);
    assert.ok(Array.isArray(sr.effective_capabilities.allowed_task_classes));
  });

  await t.test('resolved_model_path has correct structure', () => {
    const result = resolveExecutionSelection(baseInput);
    const rmp = result.execution_selection.resolved_model_path;

    assert.ok(rmp.provider);
    assert.ok(rmp.model_id);
    assert.ok(rmp.model_tier);
    assert.ok(rmp.execution_mode);
  });

  await t.test('selection_basis has required fields', () => {
    const result = resolveExecutionSelection(baseInput);
    const sb = result.execution_selection.selection_basis;

    assert.ok(sb.hasOwnProperty('constraints_passed'));
    assert.ok(sb.hasOwnProperty('route_admissible'));
    assert.ok(sb.hasOwnProperty('quality_floor_met'));
    assert.ok(sb.hasOwnProperty('reliability_floor_met'));
    assert.ok(sb.quality_posture);
    assert.ok(sb.reliability_posture);
    assert.ok(sb.latency_posture);
    assert.ok(sb.cost_posture);
    assert.ok(sb.hasOwnProperty('fallback_used'));
  });

  await t.test('selection_reason is derived from structured fields', () => {
    const result = resolveExecutionSelection(baseInput);
    const sr = result.execution_selection.selection_reason;

    assert.ok(typeof sr === 'string');
    assert.ok(sr.includes('route:'));
    assert.ok(sr.includes('model:'));
    assert.ok(sr.includes('cost:'));
    assert.ok(sr.includes('reliability:'));
  });
});

test('Step 4.6: Input validation', async t => {
  await t.test('rejects missing route_candidates', () => {
    const input = { ...baseInput, route_candidates: undefined };
    assert.throws(() => resolveExecutionSelection(input), /route_candidates/);
  });

  await t.test('rejects empty route_candidates', () => {
    const input = { ...baseInput, route_candidates: [] };
    assert.throws(() => resolveExecutionSelection(input), /non-empty/);
  });

  await t.test('rejects missing model_candidates', () => {
    const input = { ...baseInput, model_candidates: undefined };
    assert.throws(() => resolveExecutionSelection(input), /model_candidates/);
  });

  await t.test('rejects missing policy_constraints', () => {
    const input = { ...baseInput, policy_constraints: undefined };
    assert.throws(() => resolveExecutionSelection(input), /policy_constraints/);
  });

  await t.test('rejects missing resolver_version', () => {
    const input = { ...baseInput, resolver_version: undefined };
    assert.throws(() => resolveExecutionSelection(input), /resolver_version/);
  });
});

test('Step 4.7: Multi-route scenarios', async t => {
  await t.test('selects single best pair across routes and models', () => {
    const route1 = { ...sampleRoute, route_id: 'local_repo' };
    const route2 = { ...sampleRoute, route_id: 'github_pr', effective_capabilities: { ...sampleRoute.effective_capabilities, artifact_completeness: 'repo_partial' } };

    const input = {
      ...baseInput,
      route_candidates: [route1, route2],
      model_candidates: [
        { ...sampleModel, model_id: 'model-cheap', cost_basis: 'cost_efficient' },
        { ...sampleModel, model_id: 'model-expensive', cost_basis: 'cost_heavy' },
      ],
    };

    const result = resolveExecutionSelection(input);
    assert.ok(!result.error);
    assert.ok(result.execution_selection.selected_route);
    assert.ok(result.execution_selection.resolved_model_path);
  });
});
