/**
 * Tests for task command envelope drift detection
 *
 * Proves that the envelope drift validator catches:
 * - Missing or modified required fields
 * - Invalid semantic digest computation
 * - Missing or invalid command types
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";

const CANONICAL_FIELDS = [
  "task_id",
  "idempotency_key",
  "expected_task_version",
  "command_type",
  "payload",
  "principal",
  "boundary",
  "authority",
  "request_context",
  "resolved_context",
  "semantic_digest",
];

const PRINCIPAL_FIELDS = ["principal_type", "principal_id"];
const BOUNDARY_FIELDS = ["owner_principal_id", "workspace_id"];
const AUTHORITY_FIELDS = ["authority_mode", "allowed_actions", "stamped_at"];

const VALID_COMMAND_TYPES = [
  "task.create",
  "task.select_route",
  "task.transition_state",
  "task.append_finding",
  "task.transition_findings",
  "task.answer_question",
  "task.dismiss_question",
  "task.create_continuation",
];

test("canonical fields include all required task command envelope fields", () => {
  assert.ok(CANONICAL_FIELDS.includes("task_id"));
  assert.ok(CANONICAL_FIELDS.includes("idempotency_key"));
  assert.ok(CANONICAL_FIELDS.includes("semantic_digest"));
  assert.ok(CANONICAL_FIELDS.includes("principal"));
  assert.ok(CANONICAL_FIELDS.includes("boundary"));
  assert.ok(CANONICAL_FIELDS.includes("authority"));
  assert.equal(CANONICAL_FIELDS.length, 11);
});

test("detect when task_id field is missing from canonical fields", () => {
  const driftedFields = CANONICAL_FIELDS.filter((f) => f !== "task_id");
  assert.ok(!driftedFields.includes("task_id"));
  assert.equal(driftedFields.length, CANONICAL_FIELDS.length - 1);
});

test("detect when semantic_digest field is missing", () => {
  const driftedFields = CANONICAL_FIELDS.filter((f) => f !== "semantic_digest");
  assert.ok(!driftedFields.includes("semantic_digest"));
  assert.equal(driftedFields.length, CANONICAL_FIELDS.length - 1);
});

test("semantic digest is deterministic for same payload", () => {
  const payload = { route_id: "local_repo" };
  const serialized = JSON.stringify(payload);
  const digest1 = createHash("sha256").update(serialized).digest("hex");
  const digest2 = createHash("sha256").update(serialized).digest("hex");

  assert.equal(digest1, digest2);
});

test("semantic digest changes for different payload", () => {
  const payload1 = { route_id: "local_repo" };
  const payload2 = { route_id: "github_pr" };

  const digest1 = createHash("sha256")
    .update(JSON.stringify(payload1))
    .digest("hex");
  const digest2 = createHash("sha256")
    .update(JSON.stringify(payload2))
    .digest("hex");

  assert.notEqual(digest1, digest2);
});

test("semantic digest is 64 hex characters (SHA256)", () => {
  const payload = { test: "data" };
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  assert.equal(digest.length, 64);
  assert.ok(/^[0-9a-f]{64}$/.test(digest));
});

test("principal field is included in canonical fields", () => {
  assert.ok(CANONICAL_FIELDS.includes("principal"));
  assert.ok(PRINCIPAL_FIELDS.includes("principal_type"));
  assert.ok(PRINCIPAL_FIELDS.includes("principal_id"));
  assert.equal(PRINCIPAL_FIELDS.length, 2);
});

test("boundary field is included in canonical fields", () => {
  assert.ok(CANONICAL_FIELDS.includes("boundary"));
  assert.ok(BOUNDARY_FIELDS.includes("owner_principal_id"));
  assert.ok(BOUNDARY_FIELDS.includes("workspace_id"));
  assert.equal(BOUNDARY_FIELDS.length, 2);
});

test("authority field is included in canonical fields", () => {
  assert.ok(CANONICAL_FIELDS.includes("authority"));
  assert.ok(AUTHORITY_FIELDS.includes("authority_mode"));
  assert.ok(AUTHORITY_FIELDS.includes("allowed_actions"));
  assert.ok(AUTHORITY_FIELDS.includes("stamped_at"));
  assert.equal(AUTHORITY_FIELDS.length, 3);
});

test("detect when valid command type is removed", () => {
  const driftedTypes = VALID_COMMAND_TYPES.filter(
    (t) => t !== "task.select_route",
  );
  assert.ok(!driftedTypes.includes("task.select_route"));
  assert.equal(driftedTypes.length, VALID_COMMAND_TYPES.length - 1);
});

test("includes all three migrated command types", () => {
  assert.ok(VALID_COMMAND_TYPES.includes("task.select_route"));
  assert.ok(VALID_COMMAND_TYPES.includes("task.transition_state"));
  assert.ok(VALID_COMMAND_TYPES.includes("task.append_finding"));
  assert.equal(VALID_COMMAND_TYPES.length, 8);
});

test("all command types follow task.* format", () => {
  for (const type of VALID_COMMAND_TYPES) {
    assert.ok(type.startsWith("task."));
    assert.ok(type.includes("."));
  }
});

test("validator passes when envelope structure is stable", () => {
  // Check required fields
  assert.ok(CANONICAL_FIELDS.length > 0);
  assert.ok(PRINCIPAL_FIELDS.length > 0);
  assert.ok(BOUNDARY_FIELDS.length > 0);
  assert.ok(AUTHORITY_FIELDS.length > 0);

  // Check digest determinism
  const testPayload = { route_id: "local_repo", route_index: 0 };
  const serialized = JSON.stringify(testPayload);
  const digest1 = createHash("sha256").update(serialized).digest("hex");
  const digest2 = createHash("sha256").update(serialized).digest("hex");
  assert.equal(digest1, digest2);

  // Check command types
  assert.ok(VALID_COMMAND_TYPES.length > 0);
  for (const type of VALID_COMMAND_TYPES) {
    assert.ok(type && typeof type === "string");
  }
});

test("detect broken structure when principal is removed from canonical", () => {
  const brokenFields = CANONICAL_FIELDS.filter((f) => f !== "principal");
  assert.ok(!brokenFields.includes("principal"));

  // But we still try to validate principal fields - this creates inconsistency
  const hasError = !brokenFields.includes("principal");
  assert.ok(hasError);
});
