/**
 * Tests for Step 5: ExecutionSelection identity and diagnostics
 *
 * Tests ensure:
 * - Canonical identity projection is correct
 * - Digest stability and revision triggers
 * - Lightweight references are properly scoped
 * - Derived fields don't affect identity
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalIdentityProjection,
  computeSelectionDigest,
  computeSelectionRevision,
  hasIdentityChanged,
  enrichWithIdentity,
  extractLightweightReference,
  isActionAllowedLightweightReference,
  ALLOWED_LIGHTWEIGHT_REFERENCE_ACTIONS,
} from "../../../runtime/lib/execution-selection-identity.mjs";

const sampleExecutionSelection = {
  selected_route: {
    route_id: "local_repo",
    route_kind: "repository_local",
    effective_capabilities: {
      artifact_completeness: "repo_complete",
      history_availability: "repo_history",
      locality_confidence: "repo_local",
      verification_ceiling: "full_artifact_verification",
      allowed_task_classes: ["repository_review", "patch_review"],
    },
  },
  resolved_model_path: {
    provider: "anthropic",
    model_id: "claude-sonnet-4-6",
    model_tier: "standard",
    execution_mode: "sync",
  },
  fallback_chain: [
    {
      route_id: "local_repo",
      route_kind: "repository_local",
      resolved_model_path: {
        provider: "anthropic",
        model_id: "claude-haiku-4-5-20251001",
        model_tier: "budget",
        execution_mode: "sync",
      },
      fallback_reason_class: "model_unavailable",
    },
  ],
  policy_version: {
    route_contract_version: "v1",
    model_policy_version: "v1",
    resolver_version: "v1",
  },
  execution_selection_schema_version: "v1",
  selection_basis: {
    constraints_passed: true,
    route_admissible: true,
    quality_floor_met: true,
    reliability_floor_met: true,
    quality_posture: "budget",
    reliability_posture: "meets_floor",
    latency_posture: "interactive_safe",
    cost_posture: "cost_balanced",
    fallback_used: false,
  },
  selection_reason:
    "route: local_repo; model: anthropic/claude-sonnet-4-6; cost: cost_balanced; reliability: high_margin",
};

test("Step 5.1: Canonical identity projection", async (t) => {
  await t.test("produces deterministic projection", () => {
    const proj1 = canonicalIdentityProjection(sampleExecutionSelection);
    const proj2 = canonicalIdentityProjection(sampleExecutionSelection);

    assert.deepEqual(proj1, proj2);
  });

  await t.test("includes canonical identity fields", () => {
    const projection = canonicalIdentityProjection(sampleExecutionSelection);

    assert.ok(projection.execution_selection_schema_version);
    assert.ok(projection.selected_route);
    assert.ok(projection.resolved_model_path);
    assert.ok(Array.isArray(projection.fallback_chain));
    assert.ok(projection.policy_version);
  });

  await t.test("excludes derived fields", () => {
    const projection = canonicalIdentityProjection(sampleExecutionSelection);

    assert.equal(projection.selection_basis, undefined);
    assert.equal(projection.selection_reason, undefined);
  });

  await t.test("sorts allowed_task_classes for consistency", () => {
    const sel1 = {
      ...sampleExecutionSelection,
      selected_route: {
        ...sampleExecutionSelection.selected_route,
        effective_capabilities: {
          ...sampleExecutionSelection.selected_route.effective_capabilities,
          allowed_task_classes: [
            "patch_review",
            "repository_review",
            "artifact_review",
          ],
        },
      },
    };

    const sel2 = {
      ...sampleExecutionSelection,
      selected_route: {
        ...sampleExecutionSelection.selected_route,
        effective_capabilities: {
          ...sampleExecutionSelection.selected_route.effective_capabilities,
          allowed_task_classes: [
            "artifact_review",
            "patch_review",
            "repository_review",
          ],
        },
      },
    };

    const proj1 = canonicalIdentityProjection(sel1);
    const proj2 = canonicalIdentityProjection(sel2);

    assert.deepEqual(
      proj1.selected_route.effective_capabilities.allowed_task_classes,
      proj2.selected_route.effective_capabilities.allowed_task_classes,
    );
  });
});

test("Step 5.2: Digest stability and revision triggers", async (t) => {
  await t.test("produces stable digest for same selection", () => {
    const digest1 = computeSelectionDigest(sampleExecutionSelection);
    const digest2 = computeSelectionDigest(sampleExecutionSelection);

    assert.equal(digest1, digest2);
  });

  await t.test("produces different digest when selected_route changes", () => {
    const modified = {
      ...sampleExecutionSelection,
      selected_route: {
        ...sampleExecutionSelection.selected_route,
        route_id: "github_pr",
      },
    };

    const digest1 = computeSelectionDigest(sampleExecutionSelection);
    const digest2 = computeSelectionDigest(modified);

    assert.notEqual(digest1, digest2);
  });

  await t.test(
    "produces different digest when resolved_model_path changes",
    () => {
      const modified = {
        ...sampleExecutionSelection,
        resolved_model_path: {
          ...sampleExecutionSelection.resolved_model_path,
          model_id: "claude-opus-4-6",
        },
      };

      const digest1 = computeSelectionDigest(sampleExecutionSelection);
      const digest2 = computeSelectionDigest(modified);

      assert.notEqual(digest1, digest2);
    },
  );

  await t.test("produces different digest when fallback_chain changes", () => {
    const modified = {
      ...sampleExecutionSelection,
      fallback_chain: [
        {
          ...sampleExecutionSelection.fallback_chain[0],
          fallback_reason_class: "constraint_narrowing",
        },
      ],
    };

    const digest1 = computeSelectionDigest(sampleExecutionSelection);
    const digest2 = computeSelectionDigest(modified);

    assert.notEqual(digest1, digest2);
  });

  await t.test("produces same digest when derived fields change", () => {
    const modified = {
      ...sampleExecutionSelection,
      selection_basis: {
        ...sampleExecutionSelection.selection_basis,
        fallback_used: true,
      },
      selection_reason: "different reason",
    };

    const digest1 = computeSelectionDigest(sampleExecutionSelection);
    const digest2 = computeSelectionDigest(modified);

    assert.equal(digest1, digest2);
  });

  await t.test("produces stable revision", () => {
    const rev1 = computeSelectionRevision(sampleExecutionSelection);
    const rev2 = computeSelectionRevision(sampleExecutionSelection);

    assert.equal(rev1, rev2);
  });

  await t.test("revision includes schema version", () => {
    const revision = computeSelectionRevision(sampleExecutionSelection);

    assert.ok(revision.startsWith("v1:"));
  });
});

test("Step 5.3: Identity change detection", async (t) => {
  await t.test("detects when selected_route changes", () => {
    const modified = {
      ...sampleExecutionSelection,
      selected_route: {
        ...sampleExecutionSelection.selected_route,
        route_kind: "repository_remote",
      },
    };

    assert.ok(hasIdentityChanged(sampleExecutionSelection, modified));
  });

  await t.test("detects when resolved_model_path changes", () => {
    const modified = {
      ...sampleExecutionSelection,
      resolved_model_path: {
        ...sampleExecutionSelection.resolved_model_path,
        model_tier: "premium",
      },
    };

    assert.ok(hasIdentityChanged(sampleExecutionSelection, modified));
  });

  await t.test("does not trigger change for derived field updates", () => {
    const modified = {
      ...sampleExecutionSelection,
      selection_basis: {
        ...sampleExecutionSelection.selection_basis,
        fallback_used: true,
      },
    };

    assert.ok(!hasIdentityChanged(sampleExecutionSelection, modified));
  });

  await t.test("returns false for identical selections", () => {
    assert.ok(
      !hasIdentityChanged(sampleExecutionSelection, sampleExecutionSelection),
    );
  });
});

test("Step 5.4: Identity enrichment", async (t) => {
  await t.test("adds identity fields to selection", () => {
    const enriched = enrichWithIdentity(sampleExecutionSelection);

    assert.ok(enriched.execution_selection_schema_version);
    assert.ok(enriched.selection_digest);
    assert.ok(enriched.selection_revision);
  });

  await t.test("preserves original fields", () => {
    const enriched = enrichWithIdentity(sampleExecutionSelection);

    assert.equal(
      enriched.selected_route.route_id,
      sampleExecutionSelection.selected_route.route_id,
    );
    assert.equal(
      enriched.resolved_model_path.provider,
      sampleExecutionSelection.resolved_model_path.provider,
    );
  });
});

test("Step 5.5: Lightweight references", async (t) => {
  await t.test("extracts only revision and digest", () => {
    const ref = extractLightweightReference(sampleExecutionSelection);

    assert.ok(ref.selection_revision);
    assert.ok(ref.selection_digest);
    assert.equal(ref.selected_route, undefined);
    assert.equal(ref.resolved_model_path, undefined);
    assert.equal(ref.fallback_chain, undefined);
  });

  await t.test("lightweight reference is consistent", () => {
    const ref1 = extractLightweightReference(sampleExecutionSelection);
    const ref2 = extractLightweightReference(sampleExecutionSelection);

    assert.deepEqual(ref1, ref2);
  });
});

test("Step 5.6: Action allowlist for lightweight references", async (t) => {
  await t.test("has defined allowed actions", () => {
    assert.ok(Array.isArray(ALLOWED_LIGHTWEIGHT_REFERENCE_ACTIONS));
    assert.ok(ALLOWED_LIGHTWEIGHT_REFERENCE_ACTIONS.length > 0);
  });

  await t.test("validates allowed actions", () => {
    ALLOWED_LIGHTWEIGHT_REFERENCE_ACTIONS.forEach((action) => {
      assert.ok(isActionAllowedLightweightReference(action));
    });
  });

  await t.test("rejects disallowed actions", () => {
    assert.ok(
      !isActionAllowedLightweightReference("execution_selection_created"),
    );
    assert.ok(
      !isActionAllowedLightweightReference("execution_selection_replaced"),
    );
  });
});

test("Step 5.7: Boundary cases", async (t) => {
  await t.test("handles selection with empty fallback chain", () => {
    const sel = {
      ...sampleExecutionSelection,
      fallback_chain: [],
    };

    const digest = computeSelectionDigest(sel);
    assert.ok(digest);
  });

  await t.test("handles selection with null policy values", () => {
    const sel = {
      ...sampleExecutionSelection,
      fallback_chain: null,
    };

    const digest = computeSelectionDigest(sel);
    assert.ok(digest);
  });
});
