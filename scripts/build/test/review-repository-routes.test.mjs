import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getReviewRepositoryRoutes,
  getRequiredInputsForReviewRepositoryRoute,
  validateReviewRepositoryRouteInputs,
  setReviewRepositoryRouteRuntimeLoaders,
  resetReviewRepositoryRouteRuntimeLoaders,
} from "../../../runtime/lib/review-repository-route-runtime.mjs";

test("review_repository exposes the four canonical routes", () => {
  const routes = getReviewRepositoryRoutes();
  assert.deepEqual(
    routes.map((route) => route.route_id),
    ["local_repo", "github_pr", "uploaded_bundle", "pasted_diff"],
  );
});

test("getRequiredInputsForReviewRepositoryRoute returns required inputs for github_pr", () => {
  assert.deepEqual(getRequiredInputsForReviewRepositoryRoute("github_pr"), [
    "repository_slug",
    "pull_request_number",
  ]);
});

test("validateReviewRepositoryRouteInputs rejects unknown route ids", () => {
  assert.throws(
    () =>
      validateReviewRepositoryRouteInputs({ routeId: "unknown", inputs: {} }),
    /Unknown review_repository route/,
  );
});

test("validateReviewRepositoryRouteInputs rejects missing required inputs with explicit context", () => {
  assert.throws(
    () =>
      validateReviewRepositoryRouteInputs({
        routeId: "local_repo",
        inputs: {},
      }),
    /missing required inputs: repository_path/,
  );
});

test("validateReviewRepositoryRouteInputs accepts valid pasted_diff route input payload", () => {
  assert.doesNotThrow(() =>
    validateReviewRepositoryRouteInputs({
      routeId: "pasted_diff",
      inputs: {
        diff_text: "diff --git a/file b/file",
      },
    }),
  );
});

test("runtime loader overrides are supported for deterministic tests and integration wiring", () => {
  setReviewRepositoryRouteRuntimeLoaders({
    routeDefinitionsLoader: () => ({
      taskTypes: {
        review_repository: {
          routes: [
            {
              route_id: "pasted_diff",
              required_capabilities: [],
              equivalence_level: "degraded",
            },
          ],
        },
      },
    }),
    routeInputDefinitionsLoader: () => ({
      taskTypes: {
        review_repository: {
          routes: {
            pasted_diff: {
              required_inputs: ["diff_text"],
            },
          },
        },
      },
    }),
  });

  try {
    assert.deepEqual(
      getReviewRepositoryRoutes().map((route) => route.route_id),
      ["pasted_diff"],
    );
    assert.deepEqual(getRequiredInputsForReviewRepositoryRoute("pasted_diff"), [
      "diff_text",
    ]);
  } finally {
    resetReviewRepositoryRouteRuntimeLoaders();
  }
});

test("getRequiredInputsForReviewRepositoryRoute rejects routes not declared in canonical route definitions", () => {
  setReviewRepositoryRouteRuntimeLoaders({
    routeDefinitionsLoader: () => ({
      taskTypes: {
        review_repository: {
          routes: [
            {
              route_id: "local_repo",
              required_capabilities: [],
              equivalence_level: "equal",
            },
          ],
        },
      },
    }),
    routeInputDefinitionsLoader: () => ({
      taskTypes: {
        review_repository: {
          routes: {
            local_repo: { required_inputs: ["repository_path"] },
            github_pr: {
              required_inputs: ["repository_slug", "pull_request_number"],
            },
          },
        },
      },
    }),
  });

  try {
    assert.throws(
      () => getRequiredInputsForReviewRepositoryRoute("github_pr"),
      /Unknown review_repository route/,
    );
  } finally {
    resetReviewRepositoryRouteRuntimeLoaders();
  }
});
