import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEffectiveExecutionContract,
  buildEffectiveExecutionContractFromRuntime,
} from "../../../runtime/lib/effective-execution-contract.mjs";
import { loadTaskRouteInputDefinitions } from "../../../runtime/lib/task-route-input-loader.mjs";

function profileFromCaps(caps) {
  return { capabilities: caps };
}

test("task route input definitions load and validate canonical runtime file", () => {
  const definitions = loadTaskRouteInputDefinitions();
  assert.ok(
    definitions.taskTypes.review_repository.routes.local_repo.required_inputs.includes(
      "repository_path",
    ),
  );
});

test("buildEffectiveExecutionContract returns equal local_repo contract for strong profile", () => {
  const contract = buildEffectiveExecutionContract({
    taskId: "task_review_repository_001",
    taskType: "review_repository",
    capabilityProfile: profileFromCaps({
      local_fs: true,
      local_shell: true,
      local_repo: true,
      network_http: true,
    }),
    computedAt: "2026-03-13T00:00:00.000Z",
  });

  assert.equal(contract.selected_route.route_id, "local_repo");
  assert.equal(contract.equivalence_level, "equal");
  assert.deepEqual(contract.required_inputs, ["repository_path"]);
  assert.equal(contract.stronger_host_guidance, undefined);
});

test("buildEffectiveExecutionContract includes stronger host guidance for weak profile", () => {
  const contract = buildEffectiveExecutionContract({
    taskId: "task_review_repository_002",
    taskType: "review_repository",
    capabilityProfile: profileFromCaps({
      local_fs: false,
      local_shell: false,
      local_repo: false,
      network_http: true,
    }),
    computedAt: "2026-03-13T00:00:00.000Z",
  });

  assert.equal(contract.selected_route.route_id, "github_pr");
  assert.equal(contract.equivalence_level, "degraded");
  assert.deepEqual(contract.missing_capabilities, []);
  assert.deepEqual(contract.required_inputs, [
    "repository_slug",
    "pull_request_number",
  ]);
  assert.match(contract.stronger_host_guidance || "", /local_repo/);
  assert.match(contract.stronger_host_guidance || "", /local_fs/);
});

test("buildEffectiveExecutionContract throws when required inputs are missing for selected route", () => {
  assert.throws(
    () =>
      buildEffectiveExecutionContract({
        taskId: "task_review_repository_003",
        taskType: "review_repository",
        capabilityProfile: profileFromCaps({
          local_fs: false,
          local_shell: false,
          local_repo: false,
          network_http: false,
        }),
        computedAt: "2026-03-13T00:00:00.000Z",
        routeInputDefinitionsLoader: () => ({
          taskTypes: {
            review_repository: {
              routes: {
                github_pr: {
                  required_inputs: ["repository_slug", "pull_request_number"],
                },
              },
            },
          },
        }),
      }),
    /No required input definition/,
  );
});

test("buildEffectiveExecutionContractFromRuntime uses runtime capability resolver path", async () => {
  const contract = await buildEffectiveExecutionContractFromRuntime({
    taskId: "task_review_repository_004",
    taskType: "review_repository",
    computedAt: "2026-03-13T00:00:00.000Z",
    resolveTaskRouteFromRuntime: async () => ({
      selected_route: {
        schema_version: "1.0.0",
        route_id: "uploaded_bundle",
        equivalence_level: "degraded",
        required_capabilities: ["local_fs"],
        missing_capabilities: ["local_fs"],
      },
      candidates: [],
    }),
  });

  assert.equal(contract.selected_route.route_id, "uploaded_bundle");
  assert.deepEqual(contract.required_inputs, ["bundle_path"]);
  assert.deepEqual(contract.missing_capabilities, ["local_fs"]);
});

// ── Slice D: Structured Upgrade Explanation ───────────────────────────────────

test("weak profile produces upgrade_explanation with before/now/unlocks", () => {
  const contract = buildEffectiveExecutionContract({
    taskId: "task_review_repository_006",
    taskType: "review_repository",
    capabilityProfile: profileFromCaps({
      local_fs: false,
      local_shell: false,
      local_repo: false,
      network_http: true,
    }),
    computedAt: "2026-03-13T00:00:00.000Z",
  });

  assert.ok(
    contract.upgrade_explanation,
    "upgrade_explanation should be present for degraded route",
  );
  assert.ok(
    contract.upgrade_explanation.before.length > 0,
    "before must be non-empty",
  );
  assert.ok(
    contract.upgrade_explanation.now.length > 0,
    "now must be non-empty",
  );
  assert.ok(
    contract.upgrade_explanation.unlocks.length > 0,
    "unlocks must be non-empty",
  );
});

test("strongest route (local_repo) has no upgrade_explanation", () => {
  const contract = buildEffectiveExecutionContract({
    taskId: "task_review_repository_007",
    taskType: "review_repository",
    capabilityProfile: profileFromCaps({
      local_fs: true,
      local_shell: true,
      local_repo: true,
      network_http: true,
    }),
    computedAt: "2026-03-13T00:00:00.000Z",
  });

  assert.equal(contract.selected_route.route_id, "local_repo");
  assert.equal(contract.upgrade_explanation, undefined);
});

test("upgrade_explanation.unlocks mentions full repository access for github_pr → local_repo", () => {
  const contract = buildEffectiveExecutionContract({
    taskId: "task_review_repository_008",
    taskType: "review_repository",
    capabilityProfile: profileFromCaps({
      local_fs: false,
      local_shell: false,
      local_repo: false,
      network_http: true,
    }),
    computedAt: "2026-03-13T00:00:00.000Z",
  });

  // github_pr is degraded; stronger is local_repo
  assert.match(
    contract.upgrade_explanation?.unlocks || "",
    /[Ff]ull repository/,
  );
});

test("getUpgradeExplanation returns null for unknown route pair", async () => {
  const { getUpgradeExplanation } =
    await import("../../../runtime/lib/upgrade-explanations.mjs");
  const result = getUpgradeExplanation("unknown_a", "unknown_b");
  assert.equal(result, null);
});

test("getUpgradeExplanation returns structured object for valid pair", async () => {
  const { getUpgradeExplanation } =
    await import("../../../runtime/lib/upgrade-explanations.mjs");
  const result = getUpgradeExplanation("pasted_diff", "local_repo");
  assert.ok(result);
  assert.ok(result.before.length > 0);
  assert.ok(result.now.length > 0);
  assert.ok(result.unlocks.length > 0);
});

test("buildEffectiveExecutionContractFromRuntime fails fast on malformed runtime resolution", async () => {
  await assert.rejects(
    () =>
      buildEffectiveExecutionContractFromRuntime({
        taskId: "task_review_repository_005",
        taskType: "review_repository",
        computedAt: "2026-03-13T00:00:00.000Z",
        resolveTaskRouteFromRuntime: async () => ({ candidates: [] }),
      }),
    /resolution without selected_route/,
  );
});
