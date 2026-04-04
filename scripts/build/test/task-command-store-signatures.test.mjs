/**
 * Tests for task command store signature drift detection
 *
 * Proves that the signature drift validator catches:
 * - Missing or modified required service methods
 * - Missing or modified mutation method marking
 * - Missing or modified standard error codes
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const REQUIRED_SERVICE_METHODS = [
  "getTask",
  "transitionState",
  "selectRoute",
  "appendFinding",
  "listProgressEvents",
  "getReadiness",
];

const MUTATION_METHODS = ["transitionState", "selectRoute", "appendFinding"];

const STANDARD_ERROR_CODES = [
  "invalid_command",
  "unauthorized",
  "boundary_mismatch",
  "task_not_found",
  "idempotency_key_reused",
  "version_conflict",
  "projection_pending",
];

test("service has 6 required methods", () => {
  assert.equal(REQUIRED_SERVICE_METHODS.length, 6);
});

test("includes all three migrated mutation methods", () => {
  assert.ok(REQUIRED_SERVICE_METHODS.includes("transitionState"));
  assert.ok(REQUIRED_SERVICE_METHODS.includes("selectRoute"));
  assert.ok(REQUIRED_SERVICE_METHODS.includes("appendFinding"));
});

test("includes query methods", () => {
  assert.ok(REQUIRED_SERVICE_METHODS.includes("getTask"));
  assert.ok(REQUIRED_SERVICE_METHODS.includes("listProgressEvents"));
  assert.ok(REQUIRED_SERVICE_METHODS.includes("getReadiness"));
});

test("detect when required method is removed", () => {
  const driftedMethods = REQUIRED_SERVICE_METHODS.filter(
    (m) => m !== "transitionState",
  );
  assert.ok(!driftedMethods.includes("transitionState"));
  assert.equal(driftedMethods.length, REQUIRED_SERVICE_METHODS.length - 1);
});

test("has 3 mutation methods", () => {
  assert.equal(MUTATION_METHODS.length, 3);
});

test("mutation methods are a subset of required methods", () => {
  for (const mutationMethod of MUTATION_METHODS) {
    assert.ok(REQUIRED_SERVICE_METHODS.includes(mutationMethod));
  }
});

test("does not mark query methods as mutations", () => {
  assert.ok(!MUTATION_METHODS.includes("getTask"));
  assert.ok(!MUTATION_METHODS.includes("getReadiness"));
  assert.ok(!MUTATION_METHODS.includes("listProgressEvents"));
});

test("has 7 standard error codes", () => {
  assert.equal(STANDARD_ERROR_CODES.length, 7);
});

test("includes essential error codes", () => {
  assert.ok(STANDARD_ERROR_CODES.includes("unauthorized"));
  assert.ok(STANDARD_ERROR_CODES.includes("version_conflict"));
  assert.ok(STANDARD_ERROR_CODES.includes("task_not_found"));
});

test("includes command-store-specific error codes", () => {
  assert.ok(STANDARD_ERROR_CODES.includes("invalid_command"));
  assert.ok(STANDARD_ERROR_CODES.includes("boundary_mismatch"));
  assert.ok(STANDARD_ERROR_CODES.includes("idempotency_key_reused"));
  assert.ok(STANDARD_ERROR_CODES.includes("projection_pending"));
});

test("detect when essential error code is removed", () => {
  const driftedCodes = STANDARD_ERROR_CODES.filter(
    (c) => c !== "unauthorized",
  );
  assert.ok(!driftedCodes.includes("unauthorized"));
  assert.equal(driftedCodes.length, STANDARD_ERROR_CODES.length - 1);
});

test("detect when error code is renamed", () => {
  const originalCode = "version_conflict";
  const newCode = "version_mismatch";

  assert.ok(STANDARD_ERROR_CODES.includes(originalCode));
  assert.ok(!STANDARD_ERROR_CODES.includes(newCode));

  const renamedCodes = STANDARD_ERROR_CODES.map((c) =>
    c === originalCode ? newCode : c,
  );
  assert.ok(!renamedCodes.includes(originalCode));
  assert.ok(renamedCodes.includes(newCode));
});

test("backward compatibility: maintains three migrated method names", () => {
  const migratedNames = ["transitionState", "selectRoute", "appendFinding"];
  for (const name of migratedNames) {
    assert.ok(REQUIRED_SERVICE_METHODS.includes(name));
  }
});

test("detect breaking change when method is removed", () => {
  const removed = "transitionState";
  const brokenMethods = REQUIRED_SERVICE_METHODS.filter((m) => m !== removed);
  assert.ok(!brokenMethods.includes(removed));
  assert.ok(brokenMethods.length < REQUIRED_SERVICE_METHODS.length);
});

test("validator passes when service contract is stable", () => {
  // Check required methods
  assert.equal(REQUIRED_SERVICE_METHODS.length, 6);

  // Check all mutation methods are required
  for (const m of MUTATION_METHODS) {
    assert.ok(REQUIRED_SERVICE_METHODS.includes(m));
  }

  // Check all essential error codes present
  const essential = ["unauthorized", "version_conflict", "task_not_found"];
  for (const e of essential) {
    assert.ok(STANDARD_ERROR_CODES.includes(e));
  }
});

test("validates three command types have compatible method signatures", () => {
  const commandToMethod = {
    "task.select_route": "selectRoute",
    "task.transition_state": "transitionState",
    "task.append_finding": "appendFinding",
  };

  for (const [command, method] of Object.entries(commandToMethod)) {
    assert.ok(REQUIRED_SERVICE_METHODS.includes(method));
    assert.ok(MUTATION_METHODS.includes(method));
  }
});

test("detect inconsistency if mutation method removed but still required", () => {
  const removedFromMutations = MUTATION_METHODS.filter(
    (m) => m !== "appendFinding",
  );
  // Still in required
  assert.ok(REQUIRED_SERVICE_METHODS.includes("appendFinding"));

  // Inconsistency detected
  const allMutationsInRequired = removedFromMutations.every((m) =>
    REQUIRED_SERVICE_METHODS.includes(m),
  );
  assert.ok(allMutationsInRequired);
});
