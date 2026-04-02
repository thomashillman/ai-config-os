/**
 * Subprocess tests for scripts/ci/merge-gate-status.mjs (local / tooling; CI uses inline shell).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SCRIPT = resolve(REPO_ROOT, "scripts", "ci", "merge-gate-status.mjs");

function runMergeGateStatus(env) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("CLI: all empty env exits 1 with missing-results message", () => {
  const r = runMergeGateStatus({
    MERGE_GIT: "",
    CHANGES: "",
    MERGE_NODE: "",
  });
  assert.equal(r.status, 1);
  assert.ok(
    String(r.stderr ?? "").includes("Missing merge gate job results"),
    `stderr: ${r.stderr}`,
  );
  assert.ok(String(r.stderr ?? "").includes("::error::"));
});

test("CLI: all success exits 0", () => {
  const r = runMergeGateStatus({
    MERGE_GIT: "success",
    CHANGES: "success",
    MERGE_NODE: "success",
  });
  assert.equal(r.status, 0);
  assert.ok(String(r.stdout ?? "").includes("Merge gate passed"));
});

test("CLI: failure exits 1 with ::error:: on stderr", () => {
  const r = runMergeGateStatus({
    MERGE_GIT: "failure",
    CHANGES: "skipped",
    MERGE_NODE: "skipped",
  });
  assert.equal(r.status, 1);
  assert.ok(String(r.stderr ?? "").includes("::error::"));
});
