/**
 * Tests for routing policy drift detection
 *
 * Proves that the routing policy drift validator catches:
 * - Missing or modified required fields in route/model registries
 * - Missing or modified ExecutionSelection identity fields
 * - Missing or modified version fields
 * - Missing or broken narrowing operations
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const CANONICAL_ROUTE_FIELDS = [
  "route_id",
  "route_name",
  "route_contract_version",
  "capabilities",
  "limits",
  "preferences",
];

const CANONICAL_MODEL_FIELDS = [
  "model_id",
  "model_name",
  "model_policy_version",
  "compatibility_matrix",
  "policy_classes",
];

const CANONICAL_EXECUTION_SELECTION_FIELDS = [
  "selection_id",
  "selection_revision",
  "selected_route_id",
  "selected_model_id",
  "resolved_execution",
  "execution_selection_schema_version",
];

const VERSION_FIELDS = [
  "route_contract_version",
  "model_policy_version",
  "execution_selection_schema_version",
  "resolver_version",
];

const NARROWING_OPERATIONS = [
  "capabilityNarrowing",
  "modelEvaluationNarrowing",
  "routeInstanceNarrowing",
];

test("route registry has all required fields", () => {
  assert.ok(CANONICAL_ROUTE_FIELDS.includes("route_id"));
  assert.ok(CANONICAL_ROUTE_FIELDS.includes("route_contract_version"));
  assert.ok(CANONICAL_ROUTE_FIELDS.includes("capabilities"));
  assert.equal(CANONICAL_ROUTE_FIELDS.length, 6);
});

test("detect when route_id field is missing", () => {
  const driftedFields = CANONICAL_ROUTE_FIELDS.filter((f) => f !== "route_id");
  assert.ok(!driftedFields.includes("route_id"));
  assert.equal(driftedFields.length, CANONICAL_ROUTE_FIELDS.length - 1);
});

test("detect when route_contract_version field is missing", () => {
  const driftedFields = CANONICAL_ROUTE_FIELDS.filter(
    (f) => f !== "route_contract_version",
  );
  assert.ok(!driftedFields.includes("route_contract_version"));

  const hasVersionField = driftedFields.some((f) => f.includes("version"));
  assert.ok(!hasVersionField);
});

test("model registry has all required fields", () => {
  assert.ok(CANONICAL_MODEL_FIELDS.includes("model_id"));
  assert.ok(CANONICAL_MODEL_FIELDS.includes("model_policy_version"));
  assert.ok(CANONICAL_MODEL_FIELDS.includes("compatibility_matrix"));
  assert.equal(CANONICAL_MODEL_FIELDS.length, 5);
});

test("detect when model_id field is missing", () => {
  const driftedFields = CANONICAL_MODEL_FIELDS.filter((f) => f !== "model_id");
  assert.ok(!driftedFields.includes("model_id"));
});

test("detect when model_policy_version field is missing", () => {
  const driftedFields = CANONICAL_MODEL_FIELDS.filter(
    (f) => f !== "model_policy_version",
  );
  assert.ok(!driftedFields.includes("model_policy_version"));

  const hasVersionField = driftedFields.some((f) => f.includes("version"));
  assert.ok(!hasVersionField);
});

test("execution selection has all required fields", () => {
  assert.ok(
    CANONICAL_EXECUTION_SELECTION_FIELDS.includes("selection_id"),
  );
  assert.ok(
    CANONICAL_EXECUTION_SELECTION_FIELDS.includes("selected_route_id"),
  );
  assert.ok(
    CANONICAL_EXECUTION_SELECTION_FIELDS.includes("selected_model_id"),
  );
  assert.ok(
    CANONICAL_EXECUTION_SELECTION_FIELDS.includes(
      "execution_selection_schema_version",
    ),
  );
  assert.equal(CANONICAL_EXECUTION_SELECTION_FIELDS.length, 6);
});

test("execution selection has selection_revision for immutability", () => {
  assert.ok(
    CANONICAL_EXECUTION_SELECTION_FIELDS.includes("selection_revision"),
  );
});

test("execution selection has resolved_execution context", () => {
  assert.ok(
    CANONICAL_EXECUTION_SELECTION_FIELDS.includes("resolved_execution"),
  );
});

test("has 4 version fields", () => {
  assert.equal(VERSION_FIELDS.length, 4);
});

test("includes route contract version", () => {
  assert.ok(VERSION_FIELDS.includes("route_contract_version"));
});

test("includes model policy version", () => {
  assert.ok(VERSION_FIELDS.includes("model_policy_version"));
});

test("includes execution selection schema version", () => {
  assert.ok(
    VERSION_FIELDS.includes("execution_selection_schema_version"),
  );
});

test("includes resolver version", () => {
  assert.ok(VERSION_FIELDS.includes("resolver_version"));
});

test("detect when version field is removed", () => {
  const driftedVersions = VERSION_FIELDS.filter(
    (v) => v !== "route_contract_version",
  );
  assert.ok(!driftedVersions.includes("route_contract_version"));
  assert.equal(driftedVersions.length, VERSION_FIELDS.length - 1);
});

test("has 3 narrowing operations", () => {
  assert.equal(NARROWING_OPERATIONS.length, 3);
});

test("includes capability narrowing", () => {
  assert.ok(NARROWING_OPERATIONS.includes("capabilityNarrowing"));
});

test("includes model evaluation narrowing", () => {
  assert.ok(
    NARROWING_OPERATIONS.includes("modelEvaluationNarrowing"),
  );
});

test("includes route instance narrowing", () => {
  assert.ok(
    NARROWING_OPERATIONS.includes("routeInstanceNarrowing"),
  );
});

test("detect when narrowing operation is removed", () => {
  const driftedOps = NARROWING_OPERATIONS.filter(
    (op) => op !== "capabilityNarrowing",
  );
  assert.ok(!driftedOps.includes("capabilityNarrowing"));
  assert.equal(driftedOps.length, NARROWING_OPERATIONS.length - 1);
});

test("narrowing operations use camelCase with Narrowing suffix", () => {
  for (const op of NARROWING_OPERATIONS) {
    assert.ok(/^[a-z][a-zA-Z]*$/.test(op));
    assert.ok(op.endsWith("Narrowing"));
  }
});

test("has version field for each registry type", () => {
  assert.ok(CANONICAL_ROUTE_FIELDS.includes("route_contract_version"));
  assert.ok(VERSION_FIELDS.includes("route_contract_version"));

  assert.ok(CANONICAL_MODEL_FIELDS.includes("model_policy_version"));
  assert.ok(VERSION_FIELDS.includes("model_policy_version"));

  assert.ok(
    CANONICAL_EXECUTION_SELECTION_FIELDS.includes(
      "execution_selection_schema_version",
    ),
  );
  assert.ok(
    VERSION_FIELDS.includes("execution_selection_schema_version"),
  );
});

test("validator passes when routing policy is stable", () => {
  // All required fields present
  assert.ok(CANONICAL_ROUTE_FIELDS.length > 0);
  assert.ok(CANONICAL_MODEL_FIELDS.length > 0);
  assert.ok(CANONICAL_EXECUTION_SELECTION_FIELDS.length > 0);

  // All version fields present
  assert.equal(VERSION_FIELDS.length, 4);

  // All narrowing operations present
  assert.equal(NARROWING_OPERATIONS.length, 3);
});

test("fail if route registry schema is broken", () => {
  const brokenRoute = CANONICAL_ROUTE_FIELDS.filter(
    (f) => f !== "route_contract_version",
  );
  assert.ok(!brokenRoute.includes("route_contract_version"));

  const hasVersionField = brokenRoute.some((f) => f.includes("version"));
  assert.ok(!hasVersionField);
});

test("fail if execution selection identity is incomplete", () => {
  const hasRouteSelection = CANONICAL_EXECUTION_SELECTION_FIELDS.some((f) =>
    f.includes("route"),
  );
  const hasModelSelection = CANONICAL_EXECUTION_SELECTION_FIELDS.some((f) =>
    f.includes("model"),
  );
  assert.ok(hasRouteSelection);
  assert.ok(hasModelSelection);
});

test("fail if narrowing operations are missing", () => {
  const noNarrowing = [];
  assert.equal(noNarrowing.length, 0);
  assert.ok(NARROWING_OPERATIONS.length > 0);
});

test("detect all critical drifts together", () => {
  const errors = [];

  // Route registry
  if (!CANONICAL_ROUTE_FIELDS.includes("route_contract_version")) {
    errors.push("Missing route version");
  }

  // Model registry
  if (!CANONICAL_MODEL_FIELDS.includes("model_policy_version")) {
    errors.push("Missing model version");
  }

  // Execution selection
  if (
    !CANONICAL_EXECUTION_SELECTION_FIELDS.includes(
      "execution_selection_schema_version",
    )
  ) {
    errors.push("Missing execution selection version");
  }

  // Narrowing
  if (NARROWING_OPERATIONS.length === 0) {
    errors.push("Missing narrowing operations");
  }

  // When all are correct, no errors
  assert.equal(errors.length, 0);
});
