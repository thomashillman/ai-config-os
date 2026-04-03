/**
 * Canonical route-profile registry (v1)
 *
 * Static, declarative definition of all supported execution routes.
 * Each route profile includes identity, default capabilities, static limits, and preferences.
 *
 * Contract version: route_contract_version = v1
 */

export const route_contract_version = "v1";

/**
 * @type {Array<{
 *   identity: {route_id: string, route_kind: 'repository_local' | 'repository_remote' | 'artifact_bundle' | 'artifact_diff'},
 *   default_capabilities: {
 *     artifact_completeness: 'repo_complete' | 'repo_partial' | 'artifact_complete' | 'diff_only',
 *     history_availability: 'repo_history' | 'change_history' | 'artifact_limited_history' | 'no_history',
 *     locality_confidence: 'repo_local' | 'repo_remote_bound' | 'artifact_scoped' | 'diff_scoped',
 *     verification_ceiling: 'full_artifact_verification' | 'partial_artifact_verification' | 'diff_only_verification',
 *     allowed_task_classes: Array<'repository_review' | 'patch_review' | 'artifact_review'>
 *   },
 *   static_limits: {
 *     max_input_tokens?: number,
 *     max_output_tokens?: number,
 *     max_total_tokens?: number,
 *     max_latency_ms?: number,
 *     minimum_model_tier?: 'budget' | 'standard' | 'premium'
 *   },
 *   static_preferences: {
 *     preferred_model_tier?: 'budget' | 'standard' | 'premium'
 *   }
 * }>}
 */
export const routeProfiles = [
  {
    identity: {
      route_id: "local_repo",
      route_kind: "repository_local",
    },
    default_capabilities: {
      artifact_completeness: "repo_complete",
      history_availability: "repo_history",
      locality_confidence: "repo_local",
      verification_ceiling: "full_artifact_verification",
      allowed_task_classes: [
        "repository_review",
        "patch_review",
        "artifact_review",
      ],
    },
    static_limits: {
      max_input_tokens: 200000,
      max_output_tokens: 8000,
      max_total_tokens: 200000,
      max_latency_ms: 120000,
      minimum_model_tier: "standard",
    },
    static_preferences: {
      preferred_model_tier: "standard",
    },
  },
  {
    identity: {
      route_id: "github_pr",
      route_kind: "repository_remote",
    },
    default_capabilities: {
      artifact_completeness: "repo_partial",
      history_availability: "change_history",
      locality_confidence: "repo_remote_bound",
      verification_ceiling: "partial_artifact_verification",
      allowed_task_classes: ["patch_review", "artifact_review"],
    },
    static_limits: {
      max_input_tokens: 150000,
      max_output_tokens: 8000,
      max_total_tokens: 150000,
      max_latency_ms: 180000,
      minimum_model_tier: "standard",
    },
    static_preferences: {
      preferred_model_tier: "standard",
    },
  },
  {
    identity: {
      route_id: "uploaded_bundle",
      route_kind: "artifact_bundle",
    },
    default_capabilities: {
      artifact_completeness: "artifact_complete",
      history_availability: "artifact_limited_history",
      locality_confidence: "artifact_scoped",
      verification_ceiling: "partial_artifact_verification",
      allowed_task_classes: ["artifact_review"],
    },
    static_limits: {
      max_input_tokens: 100000,
      max_output_tokens: 4000,
      max_total_tokens: 100000,
      max_latency_ms: 120000,
      minimum_model_tier: "budget",
    },
    static_preferences: {
      preferred_model_tier: "budget",
    },
  },
  {
    identity: {
      route_id: "pasted_diff",
      route_kind: "artifact_diff",
    },
    default_capabilities: {
      artifact_completeness: "diff_only",
      history_availability: "no_history",
      locality_confidence: "diff_scoped",
      verification_ceiling: "diff_only_verification",
      allowed_task_classes: ["patch_review"],
    },
    static_limits: {
      max_input_tokens: 50000,
      max_output_tokens: 2000,
      max_total_tokens: 50000,
      max_latency_ms: 60000,
      minimum_model_tier: "budget",
    },
    static_preferences: {
      preferred_model_tier: "budget",
    },
  },
];

/**
 * Look up a route profile by route_id.
 * @param {string} routeId
 * @returns {typeof routeProfiles[0] | null}
 */
export function findRouteProfile(routeId) {
  return routeProfiles.find((p) => p.identity.route_id === routeId) || null;
}
