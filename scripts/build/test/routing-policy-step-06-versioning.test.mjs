/**
 * Tests for Step 6: Versioning, compatibility, and validation
 *
 * Tests ensure:
 * - Semantic versions are properly formatted
 * - Compatibility checks work correctly
 * - Version extraction and validation works
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_VERSIONS,
  POLICY_RELEASE_LABEL,
  COMPATIBILITY_NOTES,
  validateVersionFormat,
  isVersionCompatible,
  createPolicyContext,
  extractVersionsFromSelection,
  validateVersionCompatibility,
} from "../../../runtime/lib/routing-policy-versioning.mjs";

test("Step 6.1: Semantic version format validation", async (t) => {
  await t.test("validates current versions are in v<major> format", () => {
    // Should not throw
    validateVersionFormat(CURRENT_VERSIONS);
  });

  await t.test("rejects invalid version format", () => {
    const invalid = { test_version: "1.0.0" };
    assert.throws(() => validateVersionFormat(invalid), /v<major> format/);
  });

  await t.test("accepts valid major-only versions", () => {
    const valid = { v1: "v1", v2: "v2", v10: "v10" };
    // Should not throw
    validateVersionFormat(valid);
  });
});

test("Step 6.2: Compatibility checks", async (t) => {
  await t.test("indicates compatible when versions match", () => {
    assert.ok(isVersionCompatible("v1", "v1"));
  });

  await t.test("indicates incompatible when versions differ", () => {
    assert.ok(!isVersionCompatible("v1", "v2"));
    assert.ok(!isVersionCompatible("v2", "v1"));
  });

  await t.test("validates compatibility across all version tracks", () => {
    const dataVersions = {
      route_contract_version: "v1",
      model_policy_version: "v1",
      resolver_version: "v1",
      execution_selection_schema_version: "v1",
    };

    const result = validateVersionCompatibility(dataVersions, CURRENT_VERSIONS);
    assert.ok(result.compatible);
    assert.equal(result.mismatches.length, 0);
  });

  await t.test("detects version mismatches", () => {
    const dataVersions = {
      route_contract_version: "v2",
      model_policy_version: "v1",
      resolver_version: "v1",
      execution_selection_schema_version: "v1",
    };

    const result = validateVersionCompatibility(dataVersions, CURRENT_VERSIONS);
    assert.ok(!result.compatible);
    assert.ok(
      result.mismatches.some((m) => m.field === "route_contract_version"),
    );
  });
});

test("Step 6.3: Policy context creation", async (t) => {
  await t.test("creates context with all current versions", () => {
    const context = createPolicyContext();

    assert.equal(
      context.route_contract_version,
      CURRENT_VERSIONS.route_contract_version,
    );
    assert.equal(
      context.model_policy_version,
      CURRENT_VERSIONS.model_policy_version,
    );
    assert.equal(context.resolver_version, CURRENT_VERSIONS.resolver_version);
    assert.equal(
      context.execution_selection_schema_version,
      CURRENT_VERSIONS.execution_selection_schema_version,
    );
  });

  await t.test("includes policy release label", () => {
    const context = createPolicyContext();
    assert.equal(context.policy_release_label, POLICY_RELEASE_LABEL);
  });

  await t.test("includes timestamp", () => {
    const context = createPolicyContext();
    assert.ok(context.timestamp_generated);
    // Should be valid ISO timestamp
    assert.ok(new Date(context.timestamp_generated).getTime() > 0);
  });
});

test("Step 6.4: Version extraction from ExecutionSelection", async (t) => {
  const sampleSelection = {
    selected_route: { route_id: "test" },
    resolved_model_path: { provider: "test", model_id: "test" },
    policy_version: {
      route_contract_version: "v1",
      model_policy_version: "v1",
      resolver_version: "v1",
    },
    execution_selection_schema_version: "v1",
  };

  await t.test("extracts versions from selection", () => {
    const versions = extractVersionsFromSelection(sampleSelection);
    assert.equal(versions.route_contract_version, "v1");
    assert.equal(versions.model_policy_version, "v1");
  });

  await t.test("raises error for missing versions", () => {
    const invalid = {
      ...sampleSelection,
      policy_version: {
        ...sampleSelection.policy_version,
        resolver_version: undefined,
      },
    };
    assert.throws(
      () => extractVersionsFromSelection(invalid),
      /Missing versions/,
    );
  });

  await t.test("validates format of extracted versions", () => {
    const selection = {
      ...sampleSelection,
      policy_version: {
        ...sampleSelection.policy_version,
        resolver_version: "invalid",
      },
    };
    assert.throws(
      () => extractVersionsFromSelection(selection),
      /v<major> format/,
    );
  });
});

test("Step 6.5: Compatibility notes", async (t) => {
  await t.test("includes notes for all version fields", () => {
    Object.keys(CURRENT_VERSIONS).forEach((versionField) => {
      assert.ok(COMPATIBILITY_NOTES[versionField]);
    });
  });

  await t.test("includes notes for v1 of each version track", () => {
    Object.entries(COMPATIBILITY_NOTES).forEach(([field, notes]) => {
      assert.ok(notes.v1);
    });
  });
});

test("Step 6.6: Contract drift detection", async (t) => {
  await t.test("detects drift in route contract", () => {
    const oldVersions = {
      route_contract_version: "v1",
      model_policy_version: "v1",
    };
    const newVersions = {
      route_contract_version: "v2",
      model_policy_version: "v1",
    };

    const oldCheck = validateVersionCompatibility(oldVersions);
    const newCheck = validateVersionCompatibility(newVersions);

    assert.ok(
      !oldCheck.compatible ||
        !newCheck.compatible ||
        oldCheck.mismatches.length !== newCheck.mismatches.length,
    );
  });

  await t.test("tracks multiple simultaneous drifts", () => {
    const driftedVersions = {
      route_contract_version: "v2",
      model_policy_version: "v2",
      resolver_version: "v1",
      execution_selection_schema_version: "v1",
    };

    const result = validateVersionCompatibility(driftedVersions);
    assert.ok(!result.compatible);
    assert.equal(result.mismatches.length, 2);
  });
});

test("Step 6.7: Version independence", async (t) => {
  await t.test("route version changes independently", () => {
    const v1 = { route_contract_version: "v1", model_policy_version: "v1" };
    const v2 = { route_contract_version: "v2", model_policy_version: "v1" };

    const result1 = validateVersionCompatibility(v1);
    const result2 = validateVersionCompatibility(v2);

    // One matches, one doesn't (in v1 regime)
    assert.notEqual(result1.compatible, result2.compatible);
  });
});
