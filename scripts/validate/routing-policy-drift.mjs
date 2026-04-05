import {
  routeProfiles,
  route_contract_version,
} from "../../runtime/config/route-profiles.mjs";
import {
  modelPathRegistry,
  model_policy_version,
} from "../../runtime/config/model-path-registry.mjs";
import { CURRENT_VERSIONS } from "../../runtime/lib/routing-policy-versioning.mjs";
import {
  canonicalIdentityProjection,
  computeSelectionDigest,
} from "../../runtime/lib/execution-selection-identity.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateRouteProfiles() {
  assert(
    Array.isArray(routeProfiles) && routeProfiles.length > 0,
    "routeProfiles must be non-empty",
  );
  for (const route of routeProfiles) {
    assert(
      typeof route.identity?.route_id === "string",
      "route.identity.route_id missing",
    );
    assert(
      typeof route.identity?.route_kind === "string",
      "route.identity.route_kind missing",
    );
    assert(
      typeof route.default_capabilities === "object",
      "route.default_capabilities missing",
    );
  }
  assert(
    route_contract_version === CURRENT_VERSIONS.route_contract_version,
    "route contract version drift detected",
  );
}

function validateModelRegistry() {
  assert(
    Array.isArray(modelPathRegistry) && modelPathRegistry.length > 0,
    "modelPathRegistry must be non-empty",
  );
  for (const model of modelPathRegistry) {
    assert(
      typeof model.identity?.provider === "string",
      "model.identity.provider missing",
    );
    assert(
      typeof model.identity?.model_id === "string",
      "model.identity.model_id missing",
    );
    assert(
      typeof model.policy_classes === "object",
      "model.policy_classes missing",
    );
  }
  assert(
    model_policy_version === CURRENT_VERSIONS.model_policy_version,
    "model policy version drift detected",
  );
}

function validateExecutionSelectionIdentity() {
  const sample = {
    execution_selection_schema_version:
      CURRENT_VERSIONS.execution_selection_schema_version,
    selected_route: {
      route_id: "local_repo",
      route_kind: "repository_local",
      effective_capabilities: {
        artifact_completeness: "repo_complete",
        history_availability: "repo_history",
        locality_confidence: "repo_local",
        verification_ceiling: "full_artifact_verification",
        allowed_task_classes: ["repository_review"],
      },
    },
    resolved_model_path: {
      provider: "openai",
      model_id: "gpt-5",
      model_tier: "premium",
      execution_mode: "default",
    },
    fallback_chain: [],
    policy_version: {
      route_contract_version: CURRENT_VERSIONS.route_contract_version,
      model_policy_version: CURRENT_VERSIONS.model_policy_version,
      resolver_version: CURRENT_VERSIONS.resolver_version,
    },
  };

  const projection = canonicalIdentityProjection(sample);
  const digest = computeSelectionDigest(sample);
  assert(
    typeof projection.selected_route.route_id === "string",
    "identity projection missing selected route",
  );
  assert(
    typeof digest === "string" && digest.length === 64,
    "selection digest must be sha256 hex",
  );
}

function runValidation() {
  console.log("[routing-policy-drift] Starting routing policy validation...");
  validateRouteProfiles();
  validateModelRegistry();
  validateExecutionSelectionIdentity();
  console.log(
    "[routing-policy-drift] ✓ Live routing policy contracts validated",
  );
}

try {
  runValidation();
  process.exit(0);
} catch (error) {
  console.error("[routing-policy-drift] ✗ Validation failed:");
  console.error(
    `  - ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
