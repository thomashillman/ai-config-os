import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getStrengthLabel,
  compareStrength,
  STRENGTH_ORDER,
} from "../../../runtime/lib/strength-labels.mjs";

test("pasted_diff → level limited", () => {
  const result = getStrengthLabel("pasted_diff");
  assert.equal(result.level, "limited");
  assert.equal(result.label, "Diff-only review");
  assert.equal(result.description, "Can inspect changed lines only");
});

test("uploaded_bundle → level partial", () => {
  const result = getStrengthLabel("uploaded_bundle");
  assert.equal(result.level, "partial");
  assert.equal(result.label, "Bundle review");
  assert.equal(result.description, "Can inspect included files");
});

test("github_pr → level guided", () => {
  const result = getStrengthLabel("github_pr");
  assert.equal(result.level, "guided");
  assert.equal(result.label, "GitHub-level inspection");
  assert.ok(result.description.length > 0);
});

test("local_repo → level full", () => {
  const result = getStrengthLabel("local_repo");
  assert.equal(result.level, "full");
  assert.equal(result.label, "Full repository analysis");
  assert.ok(result.description.length > 0);
});

test("unknown route throws", () => {
  assert.throws(() => getStrengthLabel("unknown_route"), /Unknown route ID/);
});

test("all 4 routes have distinct levels", () => {
  const routes = ["pasted_diff", "uploaded_bundle", "github_pr", "local_repo"];
  const levels = routes.map((r) => getStrengthLabel(r).level);
  const unique = new Set(levels);
  assert.equal(unique.size, 4);
});

test("strength ordering: limited < partial < guided < full", () => {
  assert.equal(compareStrength("limited", "partial"), -1);
  assert.equal(compareStrength("partial", "guided"), -1);
  assert.equal(compareStrength("guided", "full"), -1);
  assert.equal(compareStrength("limited", "full"), -1);
  assert.equal(compareStrength("full", "limited"), 1);
  assert.equal(compareStrength("guided", "guided"), 0);
});

test("STRENGTH_ORDER has 4 entries in correct sequence", () => {
  assert.deepEqual(STRENGTH_ORDER, ["limited", "partial", "guided", "full"]);
});
