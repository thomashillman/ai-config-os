import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateMergeGateStatusResults } from "../../../scripts/ci/lib/merge-gate-status-logic.mjs";

test("all success passes", () => {
  const r = evaluateMergeGateStatusResults("success", "success", "success");
  assert.equal(r.ok, true);
  assert.ok(String(r.detail).includes("passed"));
});

test("all skipped passes (draft PR)", () => {
  const r = evaluateMergeGateStatusResults("skipped", "skipped", "skipped");
  assert.equal(r.ok, true);
});

test("any failure fails with tuple in message", () => {
  const r = evaluateMergeGateStatusResults("failure", "skipped", "skipped");
  assert.equal(r.ok, false);
  assert.ok(String(r.detail).includes("Merge gate failed"));
  assert.ok(String(r.detail).includes("merge-git=failure"));
});

test("any cancelled fails", () => {
  const r = evaluateMergeGateStatusResults("cancelled", "skipped", "skipped");
  assert.equal(r.ok, false);
});

test("mixed unexpected states fail", () => {
  const r = evaluateMergeGateStatusResults("success", "skipped", "success");
  assert.equal(r.ok, false);
  assert.ok(String(r.detail).includes("Unexpected"));
});

test("all empty strings fail closed (unexpected)", () => {
  const r = evaluateMergeGateStatusResults("", "", "");
  assert.equal(r.ok, false);
  assert.ok(String(r.detail).includes("Unexpected"));
});
