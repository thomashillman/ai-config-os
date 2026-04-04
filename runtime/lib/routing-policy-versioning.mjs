/**
 * Routing policy versioning and compatibility
 *
 * Manages semantic versioning for four independent version tracks:
 * - route_contract_version: when route registry/facts contract changes
 * - model_policy_version: when model registry/policy-class contract changes
 * - resolver_version: when join/tie-break/fallback semantics change
 * - execution_selection_schema_version: when stamped ExecutionSelection structure changes
 */

/**
 * Current versions for all policy contracts.
 * Bump rules in comments describe when to increment.
 */
export const CURRENT_VERSIONS = {
  // Bump when: route registry entries change, route facts contract changes, route identity changes
  route_contract_version: "v1",

  // Bump when: model registry entries change, model policy-class contract changes
  model_policy_version: "v1",

  // Bump when: join algorithm changes, tie-break order changes, cross-route fallback logic changes,
  //           pair-cost derivation changes
  resolver_version: "v1",

  // Bump when: ExecutionSelection structure changes, canonical identity projection changes
  execution_selection_schema_version: "v1",
};

/**
 * Optional non-canonical policy release label for operational tracing.
 * Not part of canonical identity, safe to change without affecting selection semantics.
 */
export const POLICY_RELEASE_LABEL = "2026-04-04-routing-policy-initial";

/**
 * Validate that versions are in major-only semantic version format.
 * @param {Object} versions Object with version fields
 * @throws {Error} if any version is invalid
 */
export function validateVersionFormat(versions) {
  const validPattern = /^v\d+$/;

  Object.entries(versions).forEach(([key, value]) => {
    if (!validPattern.test(value)) {
      throw new Error(
        `Version ${key}='${value}' must be in v<major> format (e.g., v1, v2)`,
      );
    }
  });
}

/**
 * Compatibility notes for major versions.
 * Documents what changed between versions and migration path if needed.
 */
export const COMPATIBILITY_NOTES = {
  route_contract_version: {
    v1: "Initial route contract with repository_local, repository_remote, artifact_bundle, artifact_diff routes.",
  },
  model_policy_version: {
    v1: "Initial model policy with cost_basis, reliability_margin, latency_risk dimensions.",
  },
  resolver_version: {
    v1: "Initial resolver: cheapest valid pair with evidence depth > reliability > latency tie-breaks.",
  },
  execution_selection_schema_version: {
    v1: "Initial ExecutionSelection schema with selected_route, resolved_model_path, fallback_chain, selection_basis.",
  },
};

/**
 * Check if a received version is compatible with current version.
 * For major-only versioning, must match exactly or be historical.
 *
 * @param {string} receivedVersion Received version from data
 * @param {string} currentVersion Current system version
 * @returns {boolean} True if compatible
 */
export function isVersionCompatible(receivedVersion, currentVersion) {
  // Currently: must match exactly in v1 phase
  // Future: major version matching logic if different majors need support
  return receivedVersion === currentVersion;
}

/**
 * Create a complete policy context object with all current versions.
 * @returns {Object} Policy context with versions and metadata
 */
export function createPolicyContext() {
  return {
    ...CURRENT_VERSIONS,
    policy_release_label: POLICY_RELEASE_LABEL,
    timestamp_generated: new Date().toISOString(),
  };
}

/**
 * Extract and validate versions from ExecutionSelection.
 * @param {Object} executionSelection
 * @returns {Object} Extracted versions
 * @throws {Error} if versions are missing or invalid
 */
export function extractVersionsFromSelection(executionSelection) {
  if (!executionSelection.policy_version) {
    throw new Error("Missing policy_version in ExecutionSelection");
  }

  const versions = {
    route_contract_version: executionSelection.policy_version.route_contract_version,
    model_policy_version: executionSelection.policy_version.model_policy_version,
    resolver_version: executionSelection.policy_version.resolver_version,
    execution_selection_schema_version:
      executionSelection.execution_selection_schema_version,
  };

  const missing = Object.entries(versions)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Missing versions in ExecutionSelection: ${missing.join(", ")}`,
    );
  }

  validateVersionFormat(versions);
  return versions;
}

/**
 * Validate that data was created with compatible versions.
 * @param {Object} dataVersions Versions from the data
 * @param {Object} systemVersions Current system versions
 * @returns {Object} {compatible: boolean, mismatches: Array}
 */
export function validateVersionCompatibility(
  dataVersions,
  systemVersions = CURRENT_VERSIONS,
) {
  const mismatches = [];

  Object.keys(systemVersions).forEach((key) => {
    if (
      dataVersions[key] &&
      !isVersionCompatible(dataVersions[key], systemVersions[key])
    ) {
      mismatches.push({
        field: key,
        expected: systemVersions[key],
        received: dataVersions[key],
      });
    }
  });

  return {
    compatible: mismatches.length === 0,
    mismatches,
  };
}
