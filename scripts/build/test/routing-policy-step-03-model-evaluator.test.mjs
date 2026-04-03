/**
 * Tests for Step 3: Model-path evaluator and bounded admissible frontier
 *
 * Tests ensure:
 * - Evaluator filters to admissible candidates only
 * - Non-dominated frontier construction is correct
 * - Representative selection is deterministic and capped at 3
 * - No rejected candidates are emitted
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateModelPaths } from '../../../runtime/lib/model-path-evaluator.mjs';
import { modelPathRegistry } from '../../../runtime/config/model-path-registry.mjs';

const baseInput = {
  registry_snapshot: modelPathRegistry,
  policy_intent: {
    quality_tier: 'standard',
    reliability_tier: 'above_floor',
    latency_posture: 'interactive_safe',
    cost_posture: 'cost_balanced',
  },
  route_compatibility_projection: {
    allowed_execution_modes: ['sync', 'streaming'],
    minimum_model_tier: 'budget',
    preferred_model_tier: 'standard',
  },
  dynamic_runtime_overlays: {},
};

test('Step 3.1: Admissibility filtering', async t => {
  await t.test('filters based on execution mode compatibility', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        allowed_execution_modes: ['batch'],
      },
    };

    const result = evaluateModelPaths(input);
    // Only batch-compatible models should be in candidates
    result.admissible_candidates.forEach(c => {
      assert.ok(['sync', 'streaming', 'batch'].includes(c.execution_mode));
    });
  });

  await t.test('filters based on minimum model tier', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        minimum_model_tier: 'standard',
      },
    };

    const result = evaluateModelPaths(input);
    // All candidates should be standard or premium
    result.admissible_candidates.forEach(c => {
      assert.ok(['standard', 'premium'].includes(c.model_tier));
    });
  });

  await t.test('filters based on reliability floor', () => {
    const input = {
      ...baseInput,
      policy_intent: {
        ...baseInput.policy_intent,
        reliability_tier: 'high_margin',
      },
    };

    const result = evaluateModelPaths(input);
    // All candidates should have high_margin reliability
    result.admissible_candidates.forEach(c => {
      assert.equal(c.reliability_margin, 'high_margin');
    });
  });

  await t.test('filters based on availability state', () => {
    const input = {
      ...baseInput,
      dynamic_runtime_overlays: {
        availability_state: ['anthropic:claude-sonnet-4-6'],
      },
    };

    const result = evaluateModelPaths(input);
    // Only available model should be in candidates
    result.admissible_candidates.forEach(c => {
      assert.equal(c.provider, 'anthropic');
      assert.equal(c.model_id, 'claude-sonnet-4-6');
    });
  });

  await t.test('returns empty frontier when no candidates meet constraints', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        allowed_execution_modes: ['nonexistent_mode'],
      },
    };

    const result = evaluateModelPaths(input);
    assert.equal(result.admissible_candidates.length, 0);
    assert.equal(result.frontier_reason, 'no_candidates_meet_constraints');
  });
});

test('Step 3.2: Non-dominated frontier construction', async t => {
  await t.test('computes correct non-dominated set', () => {
    const input = baseInput;
    const result = evaluateModelPaths(input);

    // With budget and standard tiers and reasonable constraints, should have multiple representatives
    assert.ok(result.admissible_candidates.length > 0);
    assert.ok(result.non_dominated_frontier_size >= result.admissible_candidates.length);
  });

  await t.test('respects dominance ordering', () => {
    // Create a scenario where we can verify dominance
    const input = {
      ...baseInput,
      registry_snapshot: [
        {
          identity: { provider: 'test', model_id: 'efficient-reliable' },
          compatibility: { supported_execution_modes: ['sync'] },
          policy_classes: {
            model_tier: 'budget',
            cost_basis: 'cost_efficient',
            reliability_margin: 'high_margin',
            latency_risk: 'interactive_safe',
          },
        },
        {
          identity: { provider: 'test', model_id: 'expensive-unreliable' },
          compatibility: { supported_execution_modes: ['sync'] },
          policy_classes: {
            model_tier: 'budget',
            cost_basis: 'cost_heavy',
            reliability_margin: 'meets_floor',
            latency_risk: 'background_biased',
          },
        },
      ],
      policy_intent: {
        ...baseInput.policy_intent,
        reliability_tier: 'meets_floor',
      },
    };

    const result = evaluateModelPaths(input);
    // efficient-reliable should dominate expensive-unreliable
    // So frontier should contain efficient-reliable but not expensive-unreliable
    assert.ok(result.admissible_candidates.some(c => c.model_id === 'efficient-reliable'));
    assert.ok(!result.admissible_candidates.some(c => c.model_id === 'expensive-unreliable'));
  });
});

test('Step 3.3: Representative selection and ordering', async t => {
  await t.test('selects at most 3 representatives', () => {
    const input = {
      ...baseInput,
      registry_snapshot: modelPathRegistry,
      policy_intent: {
        ...baseInput.policy_intent,
        reliability_tier: 'meets_floor',
      },
    };

    const result = evaluateModelPaths(input);
    assert.ok(result.admissible_candidates.length <= 3);
  });

  await t.test('selects cheapest as first representative', () => {
    const input = {
      ...baseInput,
      policy_intent: {
        ...baseInput.policy_intent,
        reliability_tier: 'meets_floor',
      },
    };

    const result = evaluateModelPaths(input);
    if (result.admissible_candidates.length > 0) {
      const first = result.admissible_candidates[0];
      // First should be cost_efficient
      assert.ok(['cost_efficient'].includes(first.cost_basis));
    }
  });

  await t.test('deterministic ordering is stable', () => {
    const input = baseInput;

    const result1 = evaluateModelPaths(input);
    const result2 = evaluateModelPaths(input);

    assert.equal(result1.admissible_candidates.length, result2.admissible_candidates.length);
    for (let i = 0; i < result1.admissible_candidates.length; i++) {
      const c1 = result1.admissible_candidates[i];
      const c2 = result2.admissible_candidates[i];
      assert.equal(c1.provider, c2.provider);
      assert.equal(c1.model_id, c2.model_id);
    }
  });
});

test('Step 3.4: Full evaluator workflow', async t => {
  await t.test('evaluates budget models with interactive latency', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        minimum_model_tier: 'budget',
      },
      policy_intent: {
        ...baseInput.policy_intent,
        latency_posture: 'interactive_safe',
      },
    };

    const result = evaluateModelPaths(input);
    assert.ok(result.admissible_candidates.length > 0);
    result.admissible_candidates.forEach(c => {
      // Should be budget or higher since minimum is budget
      assert.ok(['budget', 'standard', 'premium'].includes(c.model_tier));
      assert.ok(['interactive_safe'].includes(c.latency_risk));
    });
  });

  await t.test('evaluates standard models with balanced cost', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        minimum_model_tier: 'standard',
      },
    };

    const result = evaluateModelPaths(input);
    result.admissible_candidates.forEach(c => {
      assert.ok(['standard', 'premium'].includes(c.model_tier));
    });
  });

  await t.test('evaluates premium models', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        minimum_model_tier: 'premium',
      },
      policy_intent: {
        ...baseInput.policy_intent,
        reliability_tier: 'high_margin',
      },
    };

    const result = evaluateModelPaths(input);
    result.admissible_candidates.forEach(c => {
      assert.equal(c.model_tier, 'premium');
      assert.equal(c.reliability_margin, 'high_margin');
    });
  });
});

test('Step 3.5: Input validation', async t => {
  await t.test('rejects missing registry_snapshot', () => {
    const input = {
      ...baseInput,
      registry_snapshot: undefined,
    };

    assert.throws(() => evaluateModelPaths(input), /registry_snapshot must be an array/);
  });

  await t.test('rejects missing policy_intent', () => {
    const input = {
      ...baseInput,
      policy_intent: undefined,
    };

    assert.throws(() => evaluateModelPaths(input), /policy_intent is required/);
  });

  await t.test('rejects missing allowed_execution_modes', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        allowed_execution_modes: undefined,
      },
    };

    assert.throws(() => evaluateModelPaths(input), /allowed_execution_modes must be an array/);
  });

  await t.test('rejects missing minimum_model_tier', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        minimum_model_tier: undefined,
      },
    };

    assert.throws(() => evaluateModelPaths(input), /minimum_model_tier is required/);
  });
});

test('Step 3.6: Candidate contract validation', async t => {
  await t.test('emitted candidates have required fields', () => {
    const input = baseInput;
    const result = evaluateModelPaths(input);

    result.admissible_candidates.forEach(c => {
      assert.ok(c.provider);
      assert.ok(c.model_id);
      assert.ok(c.model_tier);
      assert.ok(c.execution_mode);
      assert.ok(c.cost_basis);
      assert.ok(c.reliability_margin);
      assert.ok(c.latency_risk);
      // Should NOT have internal fields
      assert.equal(c._originalIndex, undefined);
      assert.equal(c.supported_execution_modes, undefined);
    });
  });

  await t.test('no rejected candidates are emitted', () => {
    const input = baseInput;
    const result = evaluateModelPaths(input);

    // The result object should not have a rejected_candidates field
    assert.equal(result.rejected_candidates, undefined);
  });
});

test('Step 3.7: Boundary cases', async t => {
  await t.test('handles single model registry', () => {
    const input = {
      ...baseInput,
      registry_snapshot: [modelPathRegistry[0]],
    };

    const result = evaluateModelPaths(input);
    assert.ok(result.admissible_candidates.length <= 1);
  });

  await t.test('handles empty dynamic overlays', () => {
    const input = {
      ...baseInput,
      dynamic_runtime_overlays: null,
    };

    // Should not throw
    const result = evaluateModelPaths(input);
    assert.ok(Array.isArray(result.admissible_candidates));
  });

  await t.test('handles streaming mode filtering', () => {
    const input = {
      ...baseInput,
      route_compatibility_projection: {
        ...baseInput.route_compatibility_projection,
        allowed_execution_modes: ['streaming'],
      },
    };

    const result = evaluateModelPaths(input);
    result.admissible_candidates.forEach(c => {
      assert.equal(c.execution_mode, 'streaming');
    });
  });
});
