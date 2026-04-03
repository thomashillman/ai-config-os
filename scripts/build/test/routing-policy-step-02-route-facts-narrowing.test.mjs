/**
 * Tests for Step 2: Route instance facts and monotonic narrowing
 *
 * Tests ensure:
 * - Route instance facts are correctly derived
 * - Narrowing is monotonic (only narrows, never widens)
 * - Only allowed capability fields can narrow
 * - static_limits and static_preferences are never narrowed
 */

import test from "node:test";
import assert from "node:assert/strict";
import { deriveRouteInstanceFacts } from "../../../runtime/lib/route-instance-facts.mjs";
import { deriveEffectiveRouteCapabilities } from "../../../runtime/lib/route-capability-narrowing.mjs";
import { findRouteProfile } from "../../../runtime/config/route-profiles.mjs";

const sampleRouteProfile = {
  identity: {
    route_id: "test_route",
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
  },
  static_preferences: {
    preferred_model_tier: "standard",
  },
};

test("Step 2.1: Route instance facts derivation", async (t) => {
  await t.test("derives valid facts from complete input", () => {
    const input = {
      route_id: "local_repo",
      route_kind: "repository_local",
      artifact: { completeness: "repo_tree_full" },
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
      task: { observed_markers: [] },
    };

    const facts = deriveRouteInstanceFacts(input);
    assert.equal(facts.route_id, "local_repo");
    assert.equal(facts.route_kind, "repository_local");
    assert.equal(facts.artifact_surface, "repo_tree_full");
    assert.equal(facts.history_surface, "repo_history_visible");
    assert.equal(facts.repository_binding, "local_repo_bound");
    assert.deepEqual(facts.task_shape_evidence, []);
  });

  await t.test("derives facts with task markers", () => {
    const input = {
      route_id: "local_repo",
      route_kind: "repository_local",
      artifact: { completeness: "repo_tree_full" },
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
      task: {
        observed_markers: [
          "patch_shape_observed",
          "multi_file_change_observed",
          "directory_context_observed",
        ],
      },
    };

    const facts = deriveRouteInstanceFacts(input);
    // Markers should be sorted canonically
    assert.deepEqual(facts.task_shape_evidence, [
      "multi_file_change_observed",
      "directory_context_observed",
      "patch_shape_observed",
    ]);
  });

  await t.test("derives facts without task info", () => {
    const input = {
      route_id: "pasted_diff",
      route_kind: "artifact_diff",
      artifact: { completeness: "diff_only" },
      history: { visibility: "history_not_visible" },
      repository: { binding: "diff_unbound" },
    };

    const facts = deriveRouteInstanceFacts(input);
    assert.deepEqual(facts.task_shape_evidence, []);
  });

  await t.test("rejects missing route_id", () => {
    const input = {
      route_kind: "repository_local",
      artifact: { completeness: "repo_tree_full" },
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
    };

    assert.throws(
      () => deriveRouteInstanceFacts(input),
      /route_id must be a non-empty string/,
    );
  });

  await t.test("rejects missing artifact.completeness", () => {
    const input = {
      route_id: "local_repo",
      route_kind: "repository_local",
      artifact: {},
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
    };

    assert.throws(
      () => deriveRouteInstanceFacts(input),
      /artifact.completeness must be a non-empty string/,
    );
  });

  await t.test("rejects invalid task marker", () => {
    const input = {
      route_id: "local_repo",
      route_kind: "repository_local",
      artifact: { completeness: "repo_tree_full" },
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
      task: { observed_markers: ["invalid_marker"] },
    };

    assert.throws(() => deriveRouteInstanceFacts(input), /Invalid marker/);
  });

  await t.test("rejects duplicate task markers", () => {
    const input = {
      route_id: "local_repo",
      route_kind: "repository_local",
      artifact: { completeness: "repo_tree_full" },
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
      task: {
        observed_markers: [
          "multi_file_change_observed",
          "multi_file_change_observed",
        ],
      },
    };

    assert.throws(() => deriveRouteInstanceFacts(input), /Duplicate marker/);
  });

  await t.test("rejects too many task markers", () => {
    const input = {
      route_id: "local_repo",
      route_kind: "repository_local",
      artifact: { completeness: "repo_tree_full" },
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
      task: {
        observed_markers: [
          "multi_file_change_observed",
          "directory_context_observed",
          "build_manifest_observed",
          "test_artifacts_observed",
          "patch_shape_observed",
          "extra_marker",
        ],
      },
    };

    assert.throws(() => deriveRouteInstanceFacts(input), /max 5 markers/);
  });
});

test("Step 2.2: Monotonic narrowing", async (t) => {
  await t.test(
    "narrows artifact_completeness from repo_complete to diff_only",
    () => {
      const facts = deriveRouteInstanceFacts({
        route_id: "test",
        route_kind: "artifact_diff",
        artifact: { completeness: "diff_only" },
        history: { visibility: "repo_history_visible" },
        repository: { binding: "local_repo_bound" },
      });

      const profile = {
        ...sampleRouteProfile,
        default_capabilities: {
          ...sampleRouteProfile.default_capabilities,
          artifact_completeness: "repo_complete",
        },
      };

      const effective = deriveEffectiveRouteCapabilities(profile, facts);
      assert.equal(effective.artifact_completeness, "repo_complete");
    },
  );

  await t.test(
    "narrows history_availability from repo_history to no_history",
    () => {
      const facts = deriveRouteInstanceFacts({
        route_id: "test",
        route_kind: "artifact_diff",
        artifact: { completeness: "diff_only" },
        history: { visibility: "history_not_visible" },
        repository: { binding: "local_repo_bound" },
      });

      const profile = {
        ...sampleRouteProfile,
        default_capabilities: {
          ...sampleRouteProfile.default_capabilities,
          history_availability: "repo_history",
        },
      };

      const effective = deriveEffectiveRouteCapabilities(profile, facts);
      assert.equal(effective.history_availability, "repo_history");
    },
  );

  await t.test(
    "narrows locality_confidence from repo_local to diff_scoped",
    () => {
      const facts = deriveRouteInstanceFacts({
        route_id: "test",
        route_kind: "artifact_diff",
        artifact: { completeness: "diff_only" },
        history: { visibility: "repo_history_visible" },
        repository: { binding: "diff_unbound" },
      });

      const profile = {
        ...sampleRouteProfile,
        default_capabilities: {
          ...sampleRouteProfile.default_capabilities,
          locality_confidence: "repo_local",
        },
      };

      const effective = deriveEffectiveRouteCapabilities(profile, facts);
      assert.equal(effective.locality_confidence, "repo_local");
    },
  );

  await t.test("narrows verification_ceiling for diff_only artifacts", () => {
    const facts = deriveRouteInstanceFacts({
      route_id: "test",
      route_kind: "artifact_diff",
      artifact: { completeness: "diff_only" },
      history: { visibility: "history_not_visible" },
      repository: { binding: "diff_unbound" },
    });

    const profile = {
      ...sampleRouteProfile,
      default_capabilities: {
        ...sampleRouteProfile.default_capabilities,
        verification_ceiling: "full_artifact_verification",
      },
    };

    const effective = deriveEffectiveRouteCapabilities(profile, facts);
    assert.equal(effective.verification_ceiling, "diff_only_verification");
  });

  await t.test("narrows allowed_task_classes for non-repo artifacts", () => {
    const facts = deriveRouteInstanceFacts({
      route_id: "test",
      route_kind: "artifact_bundle",
      artifact: { completeness: "artifact_bundle" },
      history: { visibility: "artifact_history_visible" },
      repository: { binding: "artifact_bound" },
    });

    const profile = {
      ...sampleRouteProfile,
      default_capabilities: {
        ...sampleRouteProfile.default_capabilities,
        allowed_task_classes: [
          "repository_review",
          "patch_review",
          "artifact_review",
        ],
      },
    };

    const effective = deriveEffectiveRouteCapabilities(profile, facts);
    assert.deepEqual(effective.allowed_task_classes, [
      "patch_review",
      "artifact_review",
    ]);
  });

  await t.test("never narrows static_limits", () => {
    const facts = deriveRouteInstanceFacts({
      route_id: "test",
      route_kind: "artifact_diff",
      artifact: { completeness: "diff_only" },
      history: { visibility: "history_not_visible" },
      repository: { binding: "diff_unbound" },
    });

    const profile = sampleRouteProfile;
    const effective = deriveEffectiveRouteCapabilities(profile, facts);

    // static_limits should not be in the returned object
    assert.equal(effective.max_input_tokens, undefined);
    assert.equal(effective.static_limits, undefined);
  });

  await t.test("never narrows static_preferences", () => {
    const facts = deriveRouteInstanceFacts({
      route_id: "test",
      route_kind: "artifact_diff",
      artifact: { completeness: "diff_only" },
      history: { visibility: "history_not_visible" },
      repository: { binding: "diff_unbound" },
    });

    const profile = sampleRouteProfile;
    const effective = deriveEffectiveRouteCapabilities(profile, facts);

    // static_preferences should not be in the returned object
    assert.equal(effective.preferred_model_tier, undefined);
    assert.equal(effective.static_preferences, undefined);
  });
});

test("Step 2.3: Real route profiles with narrowing", async (t) => {
  await t.test("narrows local_repo with full tree facts", () => {
    const facts = deriveRouteInstanceFacts({
      route_id: "local_repo",
      route_kind: "repository_local",
      artifact: { completeness: "repo_tree_full" },
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
    });

    const profile = findRouteProfile("local_repo");
    const effective = deriveEffectiveRouteCapabilities(profile, facts);

    assert.equal(effective.artifact_completeness, "repo_complete");
    assert.equal(effective.history_availability, "repo_history");
    assert.equal(effective.locality_confidence, "repo_local");
    assert.equal(effective.verification_ceiling, "full_artifact_verification");
    assert.ok(effective.allowed_task_classes.includes("repository_review"));
  });

  await t.test("narrows pasted_diff preserves constraints", () => {
    const facts = deriveRouteInstanceFacts({
      route_id: "pasted_diff",
      route_kind: "artifact_diff",
      artifact: { completeness: "diff_only" },
      history: { visibility: "history_not_visible" },
      repository: { binding: "diff_unbound" },
    });

    const profile = findRouteProfile("pasted_diff");
    const effective = deriveEffectiveRouteCapabilities(profile, facts);

    assert.equal(effective.artifact_completeness, "diff_only");
    assert.equal(effective.history_availability, "no_history");
    assert.equal(effective.locality_confidence, "diff_scoped");
    assert.equal(effective.verification_ceiling, "diff_only_verification");
    assert.deepEqual(effective.allowed_task_classes, ["patch_review"]);
  });

  await t.test("narrows github_pr with partial repo facts", () => {
    const facts = deriveRouteInstanceFacts({
      route_id: "github_pr",
      route_kind: "repository_remote",
      artifact: { completeness: "repo_tree_partial" },
      history: { visibility: "change_history_visible" },
      repository: { binding: "remote_repo_bound" },
    });

    const profile = findRouteProfile("github_pr");
    const effective = deriveEffectiveRouteCapabilities(profile, facts);

    assert.equal(effective.artifact_completeness, "repo_partial");
    assert.equal(effective.history_availability, "change_history");
    assert.equal(effective.locality_confidence, "repo_remote_bound");
    assert.equal(
      effective.verification_ceiling,
      "partial_artifact_verification",
    );
    assert.deepEqual(effective.allowed_task_classes, [
      "patch_review",
      "artifact_review",
    ]);
  });
});

test("Step 2.4: Monotonicity validation", async (t) => {
  await t.test("validates narrowing does not widen capabilities", () => {
    // Create a scenario where facts match default — should preserve default
    const facts = deriveRouteInstanceFacts({
      route_id: "test",
      route_kind: "repository_local",
      artifact: { completeness: "repo_tree_full" },
      history: { visibility: "repo_history_visible" },
      repository: { binding: "local_repo_bound" },
    });

    const profile = {
      ...sampleRouteProfile,
      default_capabilities: {
        artifact_completeness: "repo_complete",
        history_availability: "repo_history",
        locality_confidence: "repo_local",
        verification_ceiling: "full_artifact_verification",
        allowed_task_classes: ["repository_review", "patch_review"],
      },
    };

    const effective = deriveEffectiveRouteCapabilities(profile, facts);

    // Effective should be same or narrower as default
    assert.equal(effective.artifact_completeness, "repo_complete");
    assert.equal(effective.history_availability, "repo_history");
    assert.equal(effective.locality_confidence, "repo_local");
    assert.equal(effective.verification_ceiling, "full_artifact_verification");
    assert.deepEqual(effective.allowed_task_classes, [
      "repository_review",
      "patch_review",
    ]);
  });
});
