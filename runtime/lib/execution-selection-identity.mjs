/**
 * ExecutionSelection identity and digest
 *
 * Computes canonical identity projection and digest for ExecutionSelection.
 * Identity changes only when canonical core fields change, not derived fields.
 */

import { createHash } from 'crypto';

const EXECUTION_SELECTION_SCHEMA_VERSION = 'v1';

/**
 * Compute canonical identity projection from ExecutionSelection.
 * Returns only the fields that participate in identity.
 *
 * @param {Object} executionSelection
 * @returns {Object} Canonical identity projection
 */
export function canonicalIdentityProjection(executionSelection) {
  if (!executionSelection || typeof executionSelection !== 'object') {
    throw new Error('executionSelection must be a non-null object');
  }

  return {
    execution_selection_schema_version: EXECUTION_SELECTION_SCHEMA_VERSION,
    selected_route: {
      route_id: executionSelection.selected_route.route_id,
      route_kind: executionSelection.selected_route.route_kind,
      effective_capabilities: {
        artifact_completeness: executionSelection.selected_route.effective_capabilities.artifact_completeness,
        history_availability: executionSelection.selected_route.effective_capabilities.history_availability,
        locality_confidence: executionSelection.selected_route.effective_capabilities.locality_confidence,
        verification_ceiling: executionSelection.selected_route.effective_capabilities.verification_ceiling,
        allowed_task_classes: [...executionSelection.selected_route.effective_capabilities.allowed_task_classes].sort(),
      },
    },
    resolved_model_path: {
      provider: executionSelection.resolved_model_path.provider,
      model_id: executionSelection.resolved_model_path.model_id,
      model_tier: executionSelection.resolved_model_path.model_tier,
      execution_mode: executionSelection.resolved_model_path.execution_mode,
    },
    fallback_chain: (executionSelection.fallback_chain || []).map(fb => ({
      route_id: fb.route_id,
      route_kind: fb.route_kind,
      resolved_model_path: {
        provider: fb.resolved_model_path.provider,
        model_id: fb.resolved_model_path.model_id,
        model_tier: fb.resolved_model_path.model_tier,
        execution_mode: fb.resolved_model_path.execution_mode,
      },
      fallback_reason_class: fb.fallback_reason_class,
    })),
    policy_version: executionSelection.policy_version,
  };
}

/**
 * Compute selection digest from canonical identity projection.
 * @param {Object} executionSelection
 * @returns {string} Hex digest
 */
export function computeSelectionDigest(executionSelection) {
  const projection = canonicalIdentityProjection(executionSelection);
  const canonical = JSON.stringify(deepSortKeys(projection));
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Deep sort object keys for canonical JSON representation.
 * @private
 */
function deepSortKeys(obj) {
  if (Array.isArray(obj)) {
    return obj.map(deepSortKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = deepSortKeys(obj[key]);
    });
    return sorted;
  }
  return obj;
}

/**
 * Compute selection revision from canonical projection.
 * Returns a deterministic identifier that changes when canonical fields change.
 *
 * @param {Object} executionSelection
 * @returns {string} Revision identifier
 */
export function computeSelectionRevision(executionSelection) {
  const projection = canonicalIdentityProjection(executionSelection);
  // Revision format: schema_version + hash of identity
  const digest = computeSelectionDigest(executionSelection);
  return `${EXECUTION_SELECTION_SCHEMA_VERSION}:${digest.substring(0, 16)}`;
}

/**
 * Check if a change in ExecutionSelection affects canonical identity.
 * Returns true if identity should be recomputed.
 *
 * @param {Object} oldSelection Previous ExecutionSelection
 * @param {Object} newSelection New ExecutionSelection
 * @returns {boolean} True if identity has changed
 */
export function hasIdentityChanged(oldSelection, newSelection) {
  if (!oldSelection || !newSelection) {
    return true;
  }

  const oldProjection = canonicalIdentityProjection(oldSelection);
  const newProjection = canonicalIdentityProjection(newSelection);

  return JSON.stringify(oldProjection) !== JSON.stringify(newProjection);
}

/**
 * Enrich ExecutionSelection with identity fields.
 * @param {Object} executionSelection
 * @returns {Object} ExecutionSelection with identity fields added
 */
export function enrichWithIdentity(executionSelection) {
  return {
    ...executionSelection,
    execution_selection_schema_version: EXECUTION_SELECTION_SCHEMA_VERSION,
    selection_digest: computeSelectionDigest(executionSelection),
    selection_revision: computeSelectionRevision(executionSelection),
  };
}

/**
 * Extract lightweight reference from ExecutionSelection.
 * Used only on explicitly allowed actions.
 *
 * @param {Object} executionSelection
 * @returns {Object} Lightweight reference with only digest and revision
 */
export function extractLightweightReference(executionSelection) {
  return {
    selection_revision: computeSelectionRevision(executionSelection),
    selection_digest: computeSelectionDigest(executionSelection),
  };
}

/**
 * Allowed actions that may carry lightweight references only.
 * All other actions should carry full ExecutionSelection if they reference it.
 */
export const ALLOWED_LIGHTWEIGHT_REFERENCE_ACTIONS = [
  'action_started',
  'context_updated',
  'tool_invoked',
  'result_received',
];

/**
 * Check if action is allowed to carry lightweight reference.
 * @param {string} actionType
 * @returns {boolean}
 */
export function isActionAllowedLightweightReference(actionType) {
  return ALLOWED_LIGHTWEIGHT_REFERENCE_ACTIONS.includes(actionType);
}
