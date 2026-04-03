/**
 * Validators for route-profile registry and model-path registry.
 *
 * Ensures that registries conform to contracts and contains no dynamic conditions.
 */

const VALID_ROUTE_KINDS = [
  "repository_local",
  "repository_remote",
  "artifact_bundle",
  "artifact_diff",
];

const VALID_ARTIFACT_COMPLETENESS = [
  "repo_complete",
  "repo_partial",
  "artifact_complete",
  "diff_only",
];

const VALID_HISTORY_AVAILABILITY = [
  "repo_history",
  "change_history",
  "artifact_limited_history",
  "no_history",
];

const VALID_LOCALITY_CONFIDENCE = [
  "repo_local",
  "repo_remote_bound",
  "artifact_scoped",
  "diff_scoped",
];

const VALID_VERIFICATION_CEILING = [
  "full_artifact_verification",
  "partial_artifact_verification",
  "diff_only_verification",
];

const VALID_TASK_CLASSES = [
  "repository_review",
  "patch_review",
  "artifact_review",
];

const VALID_MODEL_TIERS = ["budget", "standard", "premium"];

const VALID_COST_BASIS = ["cost_efficient", "cost_balanced", "cost_heavy"];

const VALID_RELIABILITY_MARGIN = ["meets_floor", "above_floor", "high_margin"];

const VALID_LATENCY_RISK = [
  "interactive_safe",
  "interactive_tolerable",
  "background_biased",
];

const VALID_EXECUTION_MODES = ["sync", "streaming", "batch"];

/**
 * Validates route-profile registry structure.
 * @param {Array} profiles
 * @throws {Error} if validation fails
 */
export function validateRouteProfiles(profiles) {
  if (!Array.isArray(profiles)) {
    throw new Error("routeProfiles must be an array");
  }

  profiles.forEach((profile, idx) => {
    const context = `routeProfiles[${idx}]`;

    // Validate identity
    if (!profile.identity) {
      throw new Error(`${context}: missing 'identity' field`);
    }
    if (
      !profile.identity.route_id ||
      typeof profile.identity.route_id !== "string"
    ) {
      throw new Error(
        `${context}.identity: 'route_id' must be a non-empty string`,
      );
    }
    if (!VALID_ROUTE_KINDS.includes(profile.identity.route_kind)) {
      throw new Error(
        `${context}.identity: 'route_kind' must be one of ${VALID_ROUTE_KINDS.join(", ")}, got '${profile.identity.route_kind}'`,
      );
    }

    // Validate default_capabilities
    if (!profile.default_capabilities) {
      throw new Error(`${context}: missing 'default_capabilities' field`);
    }
    const caps = profile.default_capabilities;
    if (!VALID_ARTIFACT_COMPLETENESS.includes(caps.artifact_completeness)) {
      throw new Error(
        `${context}.default_capabilities: 'artifact_completeness' must be one of ${VALID_ARTIFACT_COMPLETENESS.join(", ")}`,
      );
    }
    if (!VALID_HISTORY_AVAILABILITY.includes(caps.history_availability)) {
      throw new Error(
        `${context}.default_capabilities: 'history_availability' must be one of ${VALID_HISTORY_AVAILABILITY.join(", ")}`,
      );
    }
    if (!VALID_LOCALITY_CONFIDENCE.includes(caps.locality_confidence)) {
      throw new Error(
        `${context}.default_capabilities: 'locality_confidence' must be one of ${VALID_LOCALITY_CONFIDENCE.join(", ")}`,
      );
    }
    if (!VALID_VERIFICATION_CEILING.includes(caps.verification_ceiling)) {
      throw new Error(
        `${context}.default_capabilities: 'verification_ceiling' must be one of ${VALID_VERIFICATION_CEILING.join(", ")}`,
      );
    }
    if (
      !Array.isArray(caps.allowed_task_classes) ||
      caps.allowed_task_classes.length === 0
    ) {
      throw new Error(
        `${context}.default_capabilities: 'allowed_task_classes' must be a non-empty array`,
      );
    }
    caps.allowed_task_classes.forEach((tc) => {
      if (!VALID_TASK_CLASSES.includes(tc)) {
        throw new Error(
          `${context}.default_capabilities.allowed_task_classes: '${tc}' must be one of ${VALID_TASK_CLASSES.join(", ")}`,
        );
      }
    });

    // Validate static_limits
    if (!profile.static_limits || typeof profile.static_limits !== "object") {
      throw new Error(`${context}: 'static_limits' must be an object`);
    }
    const limits = profile.static_limits;
    if (
      limits.max_input_tokens !== undefined &&
      typeof limits.max_input_tokens !== "number"
    ) {
      throw new Error(
        `${context}.static_limits: 'max_input_tokens' must be a number`,
      );
    }
    if (
      limits.max_output_tokens !== undefined &&
      typeof limits.max_output_tokens !== "number"
    ) {
      throw new Error(
        `${context}.static_limits: 'max_output_tokens' must be a number`,
      );
    }
    if (
      limits.max_total_tokens !== undefined &&
      typeof limits.max_total_tokens !== "number"
    ) {
      throw new Error(
        `${context}.static_limits: 'max_total_tokens' must be a number`,
      );
    }
    if (
      limits.max_latency_ms !== undefined &&
      typeof limits.max_latency_ms !== "number"
    ) {
      throw new Error(
        `${context}.static_limits: 'max_latency_ms' must be a number`,
      );
    }
    if (limits.minimum_model_tier !== undefined) {
      if (!VALID_MODEL_TIERS.includes(limits.minimum_model_tier)) {
        throw new Error(
          `${context}.static_limits: 'minimum_model_tier' must be one of ${VALID_MODEL_TIERS.join(", ")}`,
        );
      }
    }

    // Validate static_preferences
    if (
      profile.static_preferences &&
      typeof profile.static_preferences === "object"
    ) {
      if (profile.static_preferences.preferred_model_tier) {
        if (
          !VALID_MODEL_TIERS.includes(
            profile.static_preferences.preferred_model_tier,
          )
        ) {
          throw new Error(
            `${context}.static_preferences: 'preferred_model_tier' must be one of ${VALID_MODEL_TIERS.join(", ")}`,
          );
        }
      }
    }

    // Check for forbidden dynamic fields
    const forbiddenFields = ["runtime_state", "availability", "live_condition"];
    Object.keys(profile).forEach((key) => {
      if (forbiddenFields.some((ff) => key.toLowerCase().includes(ff))) {
        throw new Error(
          `${context}: forbidden dynamic field detected: '${key}'`,
        );
      }
    });
  });
}

/**
 * Validates model-path registry structure.
 * @param {Array} models
 * @throws {Error} if validation fails
 */
export function validateModelPathRegistry(models) {
  if (!Array.isArray(models)) {
    throw new Error("modelPathRegistry must be an array");
  }

  models.forEach((model, idx) => {
    const context = `modelPathRegistry[${idx}]`;

    // Validate identity
    if (!model.identity) {
      throw new Error(`${context}: missing 'identity' field`);
    }
    if (
      !model.identity.provider ||
      typeof model.identity.provider !== "string"
    ) {
      throw new Error(
        `${context}.identity: 'provider' must be a non-empty string`,
      );
    }
    if (
      !model.identity.model_id ||
      typeof model.identity.model_id !== "string"
    ) {
      throw new Error(
        `${context}.identity: 'model_id' must be a non-empty string`,
      );
    }

    // Validate compatibility
    if (!model.compatibility) {
      throw new Error(`${context}: missing 'compatibility' field`);
    }
    if (!Array.isArray(model.compatibility.supported_execution_modes)) {
      throw new Error(
        `${context}.compatibility: 'supported_execution_modes' must be an array`,
      );
    }
    if (model.compatibility.supported_execution_modes.length === 0) {
      throw new Error(
        `${context}.compatibility: 'supported_execution_modes' must not be empty`,
      );
    }
    model.compatibility.supported_execution_modes.forEach((mode) => {
      if (!VALID_EXECUTION_MODES.includes(mode)) {
        throw new Error(
          `${context}.compatibility.supported_execution_modes: '${mode}' must be one of ${VALID_EXECUTION_MODES.join(", ")}`,
        );
      }
    });

    // Validate policy_classes
    if (!model.policy_classes) {
      throw new Error(`${context}: missing 'policy_classes' field`);
    }
    const pc = model.policy_classes;
    if (!VALID_MODEL_TIERS.includes(pc.model_tier)) {
      throw new Error(
        `${context}.policy_classes: 'model_tier' must be one of ${VALID_MODEL_TIERS.join(", ")}`,
      );
    }
    if (!VALID_COST_BASIS.includes(pc.cost_basis)) {
      throw new Error(
        `${context}.policy_classes: 'cost_basis' must be one of ${VALID_COST_BASIS.join(", ")}`,
      );
    }
    if (!VALID_RELIABILITY_MARGIN.includes(pc.reliability_margin)) {
      throw new Error(
        `${context}.policy_classes: 'reliability_margin' must be one of ${VALID_RELIABILITY_MARGIN.join(", ")}`,
      );
    }
    if (!VALID_LATENCY_RISK.includes(pc.latency_risk)) {
      throw new Error(
        `${context}.policy_classes: 'latency_risk' must be one of ${VALID_LATENCY_RISK.join(", ")}`,
      );
    }

    // Check for forbidden dynamic fields
    const forbiddenFields = [
      "runtime_state",
      "availability",
      "live_condition",
      "pricing",
    ];
    Object.keys(model).forEach((key) => {
      if (forbiddenFields.some((ff) => key.toLowerCase().includes(ff))) {
        throw new Error(
          `${context}: forbidden dynamic field detected: '${key}'`,
        );
      }
    });
  });
}

/**
 * Validates that no duplicate route_ids exist.
 * @param {Array} profiles
 * @throws {Error} if duplicates found
 */
export function validateRouteProfileUniqueness(profiles) {
  const ids = new Set();
  profiles.forEach((p, idx) => {
    if (ids.has(p.identity.route_id)) {
      throw new Error(
        `Duplicate route_id '${p.identity.route_id}' at index ${idx}`,
      );
    }
    ids.add(p.identity.route_id);
  });
}

/**
 * Validates that no duplicate model paths exist.
 * @param {Array} models
 * @throws {Error} if duplicates found
 */
export function validateModelPathUniqueness(models) {
  const keys = new Set();
  models.forEach((m, idx) => {
    const key = `${m.identity.provider}:${m.identity.model_id}`;
    if (keys.has(key)) {
      throw new Error(`Duplicate model path '${key}' at index ${idx}`);
    }
    keys.add(key);
  });
}
