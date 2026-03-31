import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContract } from "../../../shared/contracts/validate.mjs";

function baseTaskRoute() {
  return {
    schema_version: "1.0.0",
    route_id: "github_pr",
    equivalence_level: "equal",
    required_capabilities: ["browser.fetch"],
    missing_capabilities: [],
  };
}

function baseTask() {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_repository_001",
    task_type: "review_repository",
    goal: "Review repository changes for correctness and risk.",
    current_route: "github_pr",
    state: "active",
    progress: { completed_steps: 1, total_steps: 3 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [
      { route: "github_pr", selected_at: "2026-03-12T12:00:00.000Z" },
    ],
    next_action: "collect_more_context",
    version: 1,
    updated_at: "2026-03-12T12:00:00.000Z",
  };
}

test("validateContract accepts all new T002 kinds with canonical payloads", () => {
  const task = baseTask();
  const route = baseTaskRoute();
  const effectiveExecutionContract = {
    schema_version: "1.0.0",
    task_id: task.task_id,
    task_type: task.task_type,
    selected_route: route,
    equivalence_level: "equal",
    missing_capabilities: [],
    required_inputs: ["repository_ref"],
    stronger_host_guidance: "Use local_repo for full verification.",
    computed_at: "2026-03-12T12:00:00.000Z",
  };
  const provenance = {
    schema_version: "1.0.0",
    status: "verified",
    recorded_at: "2026-03-12T12:00:00.000Z",
    recorded_by_route: "github_pr",
  };
  const findingsEntry = {
    schema_version: "1.0.0",
    finding_id: "finding_001",
    summary: "No critical regressions observed.",
    evidence: ["ci logs"],
    provenance,
  };
  const snapshot = {
    schema_version: "1.0.0",
    task_id: task.task_id,
    snapshot_version: 1,
    created_at: "2026-03-12T12:00:00.000Z",
    task,
  };
  const progressEvent = {
    schema_version: "1.0.0",
    task_id: task.task_id,
    event_id: "evt_001",
    type: "route_selected",
    message: "Selected github_pr route.",
    created_at: "2026-03-12T12:00:00.000Z",
  };
  const handoffToken = {
    schema_version: "1.0.0",
    token_id: "handoff_001",
    task_id: task.task_id,
    issued_at: "2026-03-12T12:00:00.000Z",
    expires_at: "2026-03-12T12:10:00.000Z",
    signature: "deadbeef",
    replay_nonce: "nonce_1",
  };
  const continuationPackage = {
    schema_version: "1.0.0",
    task,
    effective_execution_contract: effectiveExecutionContract,
    handoff_token_id: handoffToken.token_id,
    created_at: "2026-03-12T12:00:00.000Z",
  };

  assert.equal(validateContract("portableTaskObject", task), task);
  assert.equal(validateContract("taskStateSnapshot", snapshot), snapshot);
  assert.equal(validateContract("taskRouteDefinition", route), route);
  assert.equal(
    validateContract("effectiveExecutionContract", effectiveExecutionContract),
    effectiveExecutionContract,
  );
  assert.equal(validateContract("progressEvent", progressEvent), progressEvent);
  assert.equal(validateContract("provenanceMarker", provenance), provenance);
  assert.equal(
    validateContract("findingsLedgerEntry", findingsEntry),
    findingsEntry,
  );
  assert.equal(validateContract("handoffToken", handoffToken), handoffToken);
  assert.equal(
    validateContract("continuationPackage", continuationPackage),
    continuationPackage,
  );
});

test("validateContract rejects adversarial shape drift for new T002 kinds", () => {
  assert.throws(
    () =>
      validateContract("portableTaskObject", {
        ...baseTask(),
        schema_version: "2.0.0",
      }),
    /Invalid portableTaskObject/,
  );
  assert.throws(
    () =>
      validateContract("taskRouteDefinition", {
        ...baseTaskRoute(),
        unknown_field: true,
      }),
    /Invalid taskRouteDefinition/,
  );
  assert.throws(
    () =>
      validateContract("effectiveExecutionContract", {
        schema_version: "1.0.0",
        task_id: "task_review_repository_001",
        task_type: "review_repository",
        selected_route: { route_id: "github_pr" },
        equivalence_level: "equal",
        required_inputs: ["repository_ref"],
        computed_at: "not-a-date",
      }),
    /Invalid effectiveExecutionContract/,
  );
  assert.throws(
    () =>
      validateContract("handoffToken", {
        schema_version: "1.0.0",
        token_id: "handoff_001",
        task_id: "task_review_repository_001",
        issued_at: "2026-03-12T12:00:00.000Z",
        expires_at: "2026-03-12T12:10:00.000Z",
        signature: "ZZ-not-hex",
        replay_nonce: "nonce_1",
      }),
    /Invalid handoffToken/,
  );
});
