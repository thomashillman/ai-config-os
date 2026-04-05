import test from "node:test";
import assert from "node:assert/strict";
import { canonicalIdentityProjection } from "../../../runtime/lib/execution-selection-identity.mjs";

function createSelection() {
  return {
    execution_selection_schema_version: "v1",
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
      execution_mode: "sync",
    },
    fallback_chain: [],
    policy_version: {
      route_contract_version: "v1",
      model_policy_version: "v1",
      resolver_version: "v1",
    },
  };
}

test("execution selection canonical identity projection contains required persisted shape", () => {
  const projection = canonicalIdentityProjection(createSelection());
  assert.equal(projection.execution_selection_schema_version, "v1");
  assert.equal(projection.selected_route.route_id, "local_repo");
  assert.equal(projection.resolved_model_path.provider, "openai");
  assert.ok(Array.isArray(projection.fallback_chain));
});
