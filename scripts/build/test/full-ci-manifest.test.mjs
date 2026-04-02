import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFullCiManifest } from "../../../scripts/ci/validate-full-ci-manifest.mjs";

test("full-ci manifest matches pr-mergeability-gate.yml full_ci globs", () => {
  const r = validateFullCiManifest();
  assert.equal(r.ok, true, r.ok ? "" : r.message);
});
