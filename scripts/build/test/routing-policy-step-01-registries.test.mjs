/**
 * Tests for Step 1: Route and model registries and validators
 *
 * Tests ensure:
 * - Route-profile registry conforms to schema
 * - Model-path registry conforms to schema
 * - Validators reject invalid entries
 * - No forbidden dynamic fields present
 * - All enum values are valid
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routeProfiles,
  route_contract_version,
  findRouteProfile,
} from '../../../runtime/config/route-profiles.mjs';
import {
  modelPathRegistry,
  model_policy_version,
  findModelPath,
} from '../../../runtime/config/model-path-registry.mjs';
import {
  validateRouteProfiles,
  validateModelPathRegistry,
  validateRouteProfileUniqueness,
  validateModelPathUniqueness,
} from '../../../runtime/lib/routing-policy-validators.mjs';

test('Step 1.1: Route registry schema validation', async t => {
  await t.test('validates valid route profiles', () => {
    // Should not throw
    validateRouteProfiles(routeProfiles);
    validateRouteProfileUniqueness(routeProfiles);
  });

  await t.test('rejects missing identity field', () => {
    const invalid = [
      {
        default_capabilities: { artifact_completeness: 'repo_complete' },
        static_limits: {},
      },
    ];
    assert.throws(
      () => validateRouteProfiles(invalid),
      /missing 'identity' field/
    );
  });

  await t.test('rejects invalid route_kind', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'invalid_kind' },
        default_capabilities: { artifact_completeness: 'repo_complete' },
        static_limits: {},
      },
    ];
    assert.throws(() => validateRouteProfiles(invalid), /route_kind/);
  });

  await t.test('rejects missing default_capabilities', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'repository_local' },
        static_limits: {},
      },
    ];
    assert.throws(
      () => validateRouteProfiles(invalid),
      /missing 'default_capabilities'/
    );
  });

  await t.test('rejects invalid artifact_completeness', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'repository_local' },
        default_capabilities: {
          artifact_completeness: 'invalid',
          history_availability: 'repo_history',
          locality_confidence: 'repo_local',
          verification_ceiling: 'full_artifact_verification',
          allowed_task_classes: ['repository_review'],
        },
        static_limits: {},
      },
    ];
    assert.throws(() => validateRouteProfiles(invalid), /artifact_completeness/);
  });

  await t.test('rejects invalid history_availability', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'repository_local' },
        default_capabilities: {
          artifact_completeness: 'repo_complete',
          history_availability: 'invalid',
          locality_confidence: 'repo_local',
          verification_ceiling: 'full_artifact_verification',
          allowed_task_classes: ['repository_review'],
        },
        static_limits: {},
      },
    ];
    assert.throws(() => validateRouteProfiles(invalid), /history_availability/);
  });

  await t.test('rejects invalid locality_confidence', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'repository_local' },
        default_capabilities: {
          artifact_completeness: 'repo_complete',
          history_availability: 'repo_history',
          locality_confidence: 'invalid',
          verification_ceiling: 'full_artifact_verification',
          allowed_task_classes: ['repository_review'],
        },
        static_limits: {},
      },
    ];
    assert.throws(() => validateRouteProfiles(invalid), /locality_confidence/);
  });

  await t.test('rejects invalid verification_ceiling', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'repository_local' },
        default_capabilities: {
          artifact_completeness: 'repo_complete',
          history_availability: 'repo_history',
          locality_confidence: 'repo_local',
          verification_ceiling: 'invalid',
          allowed_task_classes: ['repository_review'],
        },
        static_limits: {},
      },
    ];
    assert.throws(() => validateRouteProfiles(invalid), /verification_ceiling/);
  });

  await t.test('rejects invalid task class', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'repository_local' },
        default_capabilities: {
          artifact_completeness: 'repo_complete',
          history_availability: 'repo_history',
          locality_confidence: 'repo_local',
          verification_ceiling: 'full_artifact_verification',
          allowed_task_classes: ['invalid_class'],
        },
        static_limits: {},
      },
    ];
    assert.throws(() => validateRouteProfiles(invalid), /allowed_task_classes/);
  });

  await t.test('rejects invalid model_tier in static_limits', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'repository_local' },
        default_capabilities: {
          artifact_completeness: 'repo_complete',
          history_availability: 'repo_history',
          locality_confidence: 'repo_local',
          verification_ceiling: 'full_artifact_verification',
          allowed_task_classes: ['repository_review'],
        },
        static_limits: { minimum_model_tier: 'invalid' },
        static_preferences: {},
      },
    ];
    assert.throws(() => validateRouteProfiles(invalid), /minimum_model_tier/);
  });

  await t.test('rejects dynamic fields in route profile', () => {
    const invalid = [
      {
        identity: { route_id: 'test', route_kind: 'repository_local' },
        default_capabilities: {
          artifact_completeness: 'repo_complete',
          history_availability: 'repo_history',
          locality_confidence: 'repo_local',
          verification_ceiling: 'full_artifact_verification',
          allowed_task_classes: ['repository_review'],
        },
        static_limits: {},
        runtime_state: 'available',
      },
    ];
    assert.throws(() => validateRouteProfiles(invalid), /forbidden dynamic field/);
  });

  await t.test('detects duplicate route_ids', () => {
    const invalid = [
      {
        identity: { route_id: 'duplicate', route_kind: 'repository_local' },
        default_capabilities: {
          artifact_completeness: 'repo_complete',
          history_availability: 'repo_history',
          locality_confidence: 'repo_local',
          verification_ceiling: 'full_artifact_verification',
          allowed_task_classes: ['repository_review'],
        },
        static_limits: {},
      },
      {
        identity: { route_id: 'duplicate', route_kind: 'repository_remote' },
        default_capabilities: {
          artifact_completeness: 'repo_partial',
          history_availability: 'change_history',
          locality_confidence: 'repo_remote_bound',
          verification_ceiling: 'partial_artifact_verification',
          allowed_task_classes: ['patch_review'],
        },
        static_limits: {},
      },
    ];
    assert.throws(() => validateRouteProfileUniqueness(invalid), /Duplicate route_id/);
  });
});

test('Step 1.2: Model registry schema validation', async t => {
  await t.test('validates valid model paths', () => {
    // Should not throw
    validateModelPathRegistry(modelPathRegistry);
    validateModelPathUniqueness(modelPathRegistry);
  });

  await t.test('rejects missing identity field', () => {
    const invalid = [
      {
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: { model_tier: 'budget' },
      },
    ];
    assert.throws(
      () => validateModelPathRegistry(invalid),
      /missing 'identity' field/
    );
  });

  await t.test('rejects missing provider', () => {
    const invalid = [
      {
        identity: { model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: { model_tier: 'budget' },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /provider/);
  });

  await t.test('rejects missing model_id', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: { model_tier: 'budget' },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /model_id/);
  });

  await t.test('rejects missing compatibility', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        policy_classes: { model_tier: 'budget' },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /compatibility/);
  });

  await t.test('rejects empty supported_execution_modes', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: [] },
        policy_classes: { model_tier: 'budget' },
      },
    ];
    assert.throws(
      () => validateModelPathRegistry(invalid),
      /supported_execution_modes.*not be empty/
    );
  });

  await t.test('rejects invalid execution mode', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['invalid_mode'] },
        policy_classes: { model_tier: 'budget' },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /execution_modes/);
  });

  await t.test('rejects missing policy_classes', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /policy_classes/);
  });

  await t.test('rejects invalid model_tier', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: { model_tier: 'invalid' },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /model_tier/);
  });

  await t.test('rejects invalid cost_basis', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: {
          model_tier: 'budget',
          cost_basis: 'invalid',
        },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /cost_basis/);
  });

  await t.test('rejects invalid reliability_margin', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: {
          model_tier: 'budget',
          cost_basis: 'cost_efficient',
          reliability_margin: 'invalid',
        },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /reliability_margin/);
  });

  await t.test('rejects invalid latency_risk', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: {
          model_tier: 'budget',
          cost_basis: 'cost_efficient',
          reliability_margin: 'meets_floor',
          latency_risk: 'invalid',
        },
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /latency_risk/);
  });

  await t.test('rejects dynamic fields in model path', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: {
          model_tier: 'budget',
          cost_basis: 'cost_efficient',
          reliability_margin: 'meets_floor',
          latency_risk: 'interactive_safe',
        },
        pricing_profile: 'live',
      },
    ];
    assert.throws(() => validateModelPathRegistry(invalid), /forbidden dynamic field/);
  });

  await t.test('detects duplicate model paths', () => {
    const invalid = [
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: {
          model_tier: 'budget',
          cost_basis: 'cost_efficient',
          reliability_margin: 'meets_floor',
          latency_risk: 'interactive_safe',
        },
      },
      {
        identity: { provider: 'anthropic', model_id: 'test-model' },
        compatibility: { supported_execution_modes: ['sync'] },
        policy_classes: {
          model_tier: 'standard',
          cost_basis: 'cost_balanced',
          reliability_margin: 'high_margin',
          latency_risk: 'interactive_safe',
        },
      },
    ];
    assert.throws(() => validateModelPathUniqueness(invalid), /Duplicate model path/);
  });
});

test('Step 1.3: Registry lookup functions', async t => {
  await t.test('findRouteProfile returns route by ID', () => {
    const route = findRouteProfile('local_repo');
    assert.ok(route);
    assert.equal(route.identity.route_kind, 'repository_local');
  });

  await t.test('findRouteProfile returns null for missing route', () => {
    const route = findRouteProfile('nonexistent');
    assert.equal(route, null);
  });

  await t.test('findModelPath returns model by provider and ID', () => {
    const model = findModelPath('anthropic', 'claude-sonnet-4-6');
    assert.ok(model);
    assert.equal(model.policy_classes.model_tier, 'standard');
  });

  await t.test('findModelPath returns null for missing model', () => {
    const model = findModelPath('nonexistent', 'nonexistent');
    assert.equal(model, null);
  });
});

test('Step 1.4: Contract versions', async t => {
  await t.test('route_contract_version is v1', () => {
    assert.equal(route_contract_version, 'v1');
  });

  await t.test('model_policy_version is v1', () => {
    assert.equal(model_policy_version, 'v1');
  });
});

test('Step 1.5: Registry content completeness', async t => {
  await t.test('route registry contains all v1 routes', () => {
    const routeIds = routeProfiles.map(r => r.identity.route_id);
    assert.ok(routeIds.includes('local_repo'));
    assert.ok(routeIds.includes('github_pr'));
    assert.ok(routeIds.includes('uploaded_bundle'));
    assert.ok(routeIds.includes('pasted_diff'));
  });

  await t.test('model registry contains anthropic models', () => {
    const models = modelPathRegistry.filter(m => m.identity.provider === 'anthropic');
    assert.ok(models.length > 0);
    const modelIds = models.map(m => m.identity.model_id);
    assert.ok(modelIds.includes('claude-haiku-4-5-20251001'));
    assert.ok(modelIds.includes('claude-sonnet-4-6'));
    assert.ok(modelIds.includes('claude-opus-4-6'));
  });
});

test('Step 1.6: Enum coverage', async t => {
  await t.test('all route artifact_completeness values are represented', () => {
    const values = new Set(routeProfiles.map(r => r.default_capabilities.artifact_completeness));
    assert.ok(values.has('repo_complete'));
    assert.ok(values.has('repo_partial'));
    assert.ok(values.has('artifact_complete'));
    assert.ok(values.has('diff_only'));
  });

  await t.test('all model cost_basis values are represented', () => {
    const values = new Set(modelPathRegistry.map(m => m.policy_classes.cost_basis));
    assert.ok(values.has('cost_efficient'));
    assert.ok(values.has('cost_balanced'));
    assert.ok(values.has('cost_heavy'));
  });

  await t.test('all model reliability_margin values are represented', () => {
    const values = new Set(modelPathRegistry.map(m => m.policy_classes.reliability_margin));
    assert.ok(values.has('meets_floor'));
    assert.ok(values.has('above_floor'));
    assert.ok(values.has('high_margin'));
  });

  await t.test('all model latency_risk values are represented', () => {
    const values = new Set(modelPathRegistry.map(m => m.policy_classes.latency_risk));
    assert.ok(values.has('interactive_safe'));
    assert.ok(values.has('interactive_tolerable'));
    assert.ok(values.has('background_biased'));
  });
});
