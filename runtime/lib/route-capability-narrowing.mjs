/**
 * Route capability narrowing
 *
 * Derives effective route capabilities by monotonically narrowing default capabilities
 * based on route instance facts.
 *
 * Rules:
 * - Only artifact_completeness, history_availability, locality_confidence, verification_ceiling,
 *   and allowed_task_classes may be narrowed.
 * - static_limits and static_preferences must never be narrowed.
 * - Narrowing is always monotonic (can only narrow, never widen).
 */

/**
 * Derive effective route capabilities by narrowing default capabilities based on facts.
 *
 * @param {Object} route_profile The route profile from the registry
 * @param {Object} route_instance_facts The derived route instance facts
 * @returns {Object} Effective capabilities (same structure as default_capabilities)
 * @throws {Error} if narrowing violates monotonicity or allowed fields
 */
export function deriveEffectiveRouteCapabilities(
  route_profile,
  route_instance_facts,
) {
  if (!route_profile || typeof route_profile !== "object") {
    throw new Error("route_profile must be a non-null object");
  }

  if (!route_profile.default_capabilities) {
    throw new Error("route_profile must have default_capabilities");
  }

  if (!route_instance_facts || typeof route_instance_facts !== "object") {
    throw new Error("route_instance_facts must be a non-null object");
  }

  // Start with default capabilities
  const defaults = route_profile.default_capabilities;
  const effective = {
    artifact_completeness: defaults.artifact_completeness,
    history_availability: defaults.history_availability,
    locality_confidence: defaults.locality_confidence,
    verification_ceiling: defaults.verification_ceiling,
    allowed_task_classes: [...defaults.allowed_task_classes],
  };

  // Apply narrowing based on facts
  effective.artifact_completeness = narrowArtifactCompleteness(
    defaults.artifact_completeness,
    route_instance_facts.artifact_surface,
  );

  effective.history_availability = narrowHistoryAvailability(
    defaults.history_availability,
    route_instance_facts.history_surface,
  );

  effective.locality_confidence = narrowLocalityConfidence(
    defaults.locality_confidence,
    route_instance_facts.repository_binding,
  );

  effective.verification_ceiling = narrowVerificationCeiling(
    defaults.verification_ceiling,
    route_instance_facts.artifact_surface,
  );

  effective.allowed_task_classes = narrowAllowedTaskClasses(
    defaults.allowed_task_classes,
    route_instance_facts.artifact_surface,
  );

  return effective;
}

/**
 * Narrow artifact_completeness based on actual artifact surface.
 * Monotonic: narrower actual surfaces can only maintain or narrow the capability.
 *
 * @param {string} default_completeness
 * @param {string} actual_surface One of repo_tree_full, repo_tree_partial, artifact_bundle, diff_only
 * @returns {string} Effective completeness
 */
function narrowArtifactCompleteness(default_completeness, actual_surface) {
  // Canonical ordering from broadest to narrowest
  const completenessOrder = {
    repo_complete: 0,
    repo_partial: 1,
    artifact_complete: 2,
    diff_only: 3,
  };

  // Mapping of actual surfaces to effective completeness
  const surfaceMap = {
    repo_tree_full: "repo_complete",
    repo_tree_partial: "repo_partial",
    artifact_bundle: "artifact_complete",
    diff_only: "diff_only",
  };

  const effective = surfaceMap[actual_surface];
  if (!effective) {
    throw new Error(`Invalid artifact_surface: ${actual_surface}`);
  }

  const defaultRank = completenessOrder[default_completeness];
  const effectiveRank = completenessOrder[effective];

  if (effectiveRank < defaultRank) {
    // Actual surface is broader than default, which violates the facts observation
    throw new Error(
      `Artifact surface '${actual_surface}' contradicts default capability '${default_completeness}'`,
    );
  }

  // Return the narrower (higher rank) of the two
  return defaultRank <= effectiveRank ? default_completeness : effective;
}

/**
 * Narrow history_availability based on actual history surface.
 * Monotonic: sparser actual history can only maintain or narrow the capability.
 *
 * @param {string} default_availability
 * @param {string} actual_surface One of repo_history_visible, change_history_visible, artifact_history_visible, history_not_visible
 * @returns {string} Effective availability
 */
function narrowHistoryAvailability(default_availability, actual_surface) {
  // Canonical ordering from richest to sparsest
  const availabilityOrder = {
    repo_history: 0,
    change_history: 1,
    artifact_limited_history: 2,
    no_history: 3,
  };

  const surfaceMap = {
    repo_history_visible: "repo_history",
    change_history_visible: "change_history",
    artifact_history_visible: "artifact_limited_history",
    history_not_visible: "no_history",
  };

  const effective = surfaceMap[actual_surface];
  if (!effective) {
    throw new Error(`Invalid history_surface: ${actual_surface}`);
  }

  const defaultRank = availabilityOrder[default_availability];
  const effectiveRank = availabilityOrder[effective];

  if (effectiveRank < defaultRank) {
    throw new Error(
      `History surface '${actual_surface}' contradicts default capability '${default_availability}'`,
    );
  }

  return defaultRank <= effectiveRank ? default_availability : effective;
}

/**
 * Narrow locality_confidence based on repository binding.
 * Monotonic: narrower bindings can only maintain or narrow the confidence.
 *
 * @param {string} default_confidence
 * @param {string} repository_binding One of local_repo_bound, remote_repo_bound, artifact_bound, diff_unbound
 * @returns {string} Effective confidence
 */
function narrowLocalityConfidence(default_confidence, repository_binding) {
  // Canonical ordering from strongest to weakest
  const confidenceOrder = {
    repo_local: 0,
    repo_remote_bound: 1,
    artifact_scoped: 2,
    diff_scoped: 3,
  };

  const bindingMap = {
    local_repo_bound: "repo_local",
    remote_repo_bound: "repo_remote_bound",
    artifact_bound: "artifact_scoped",
    diff_unbound: "diff_scoped",
  };

  const effective = bindingMap[repository_binding];
  if (!effective) {
    throw new Error(`Invalid repository_binding: ${repository_binding}`);
  }

  const defaultRank = confidenceOrder[default_confidence];
  const effectiveRank = confidenceOrder[effective];

  if (effectiveRank < defaultRank) {
    throw new Error(
      `Repository binding '${repository_binding}' contradicts default capability '${default_confidence}'`,
    );
  }

  return defaultRank <= effectiveRank ? default_confidence : effective;
}

/**
 * Narrow verification_ceiling based on artifact surface.
 * Diff-only surfaces cannot verify full artifacts.
 *
 * @param {string} default_ceiling
 * @param {string} artifact_surface One of repo_tree_full, repo_tree_partial, artifact_bundle, diff_only
 * @returns {string} Effective ceiling
 */
function narrowVerificationCeiling(default_ceiling, artifact_surface) {
  // Narrow if the artifact is diff-only
  if (artifact_surface === "diff_only") {
    return "diff_only_verification";
  }

  // Narrow if the artifact is partial
  if (
    artifact_surface === "repo_tree_partial" ||
    artifact_surface === "artifact_bundle"
  ) {
    if (default_ceiling === "full_artifact_verification") {
      return "partial_artifact_verification";
    }
  }

  return default_ceiling;
}

/**
 * Narrow allowed_task_classes based on artifact surface.
 * Diff-only and artifact-only surfaces cannot perform repository reviews.
 *
 * @param {Array<string>} default_classes
 * @param {string} artifact_surface One of repo_tree_full, repo_tree_partial, artifact_bundle, diff_only
 * @returns {Array<string>} Effective allowed classes
 */
function narrowAllowedTaskClasses(default_classes, artifact_surface) {
  // If not a full repo, cannot do repository_review
  if (artifact_surface !== "repo_tree_full") {
    return default_classes.filter((c) => c !== "repository_review");
  }

  return default_classes;
}
