/**
 * Route instance facts derivation
 *
 * Transforms raw surface input into canonical, observational route instance facts.
 * Facts remain purely observational and never embody policy conclusions.
 */

/**
 * Derive route instance facts from raw surface input.
 *
 * This is a pure, deterministic function that extracts observable characteristics
 * from the input surface without making policy decisions.
 *
 * @param {Object} input Raw surface input
 * @param {string} input.route_id The route identifier
 * @param {string} input.route_kind One of repository_local, repository_remote, artifact_bundle, artifact_diff
 * @param {Object} input.artifact - Artifact surface information
 * @param {string} input.artifact.completeness One of repo_tree_full, repo_tree_partial, artifact_bundle, diff_only
 * @param {Object} input.history - History surface information
 * @param {string} input.history.visibility One of repo_history_visible, change_history_visible, artifact_history_visible, history_not_visible
 * @param {Object} input.repository - Repository binding information
 * @param {string} input.repository.binding One of local_repo_bound, remote_repo_bound, artifact_bound, diff_unbound
 * @param {Object} input.task - Task characteristics
 * @param {Array<string>} [input.task.observed_markers] Optional task shape evidence markers
 *
 * @returns {Object} Route instance facts
 * @throws {Error} if input is invalid
 */
export function deriveRouteInstanceFacts(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Input must be a non-null object");
  }

  const { route_id, route_kind, artifact, history, repository, task } = input;

  if (!route_id || typeof route_id !== "string") {
    throw new Error("route_id must be a non-empty string");
  }

  if (!route_kind || typeof route_kind !== "string") {
    throw new Error("route_kind must be a non-empty string");
  }

  if (!artifact || typeof artifact !== "object") {
    throw new Error("artifact object is required");
  }

  if (!artifact.completeness || typeof artifact.completeness !== "string") {
    throw new Error("artifact.completeness must be a non-empty string");
  }

  if (!history || typeof history !== "object") {
    throw new Error("history object is required");
  }

  if (!history.visibility || typeof history.visibility !== "string") {
    throw new Error("history.visibility must be a non-empty string");
  }

  if (!repository || typeof repository !== "object") {
    throw new Error("repository object is required");
  }

  if (!repository.binding || typeof repository.binding !== "string") {
    throw new Error("repository.binding must be a non-empty string");
  }

  // Task shape evidence is optional but if provided must be an array
  let task_shape_evidence = [];
  if (task && task.observed_markers) {
    if (!Array.isArray(task.observed_markers)) {
      throw new Error("task.observed_markers must be an array if provided");
    }
    task_shape_evidence = validateAndSortMarkers(task.observed_markers);
  }

  return {
    route_id,
    route_kind,
    artifact_surface: artifact.completeness,
    history_surface: history.visibility,
    repository_binding: repository.binding,
    task_shape_evidence,
  };
}

/**
 * Validate task shape evidence markers and sort them canonically.
 * @param {Array<string>} markers
 * @returns {Array<string>} Sorted, validated markers
 * @throws {Error} if markers are invalid
 */
function validateAndSortMarkers(markers) {
  const validMarkers = [
    "multi_file_change_observed",
    "directory_context_observed",
    "build_manifest_observed",
    "test_artifacts_observed",
    "patch_shape_observed",
  ];

  const canonical = [
    "multi_file_change_observed",
    "directory_context_observed",
    "build_manifest_observed",
    "test_artifacts_observed",
    "patch_shape_observed",
  ];

  if (!Array.isArray(markers)) {
    throw new Error("markers must be an array");
  }

  if (markers.length > 5) {
    throw new Error("task_shape_evidence must have max 5 markers");
  }

  // Check for duplicates
  const seen = new Set();
  markers.forEach((m) => {
    if (!validMarkers.includes(m)) {
      throw new Error(`Invalid marker: '${m}'`);
    }
    if (seen.has(m)) {
      throw new Error(`Duplicate marker: '${m}'`);
    }
    seen.add(m);
  });

  // Sort according to canonical order
  return markers.sort((a, b) => canonical.indexOf(a) - canonical.indexOf(b));
}
