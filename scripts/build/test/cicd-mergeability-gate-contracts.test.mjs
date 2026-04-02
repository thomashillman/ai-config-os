/**
 * cicd-mergeability-gate-contracts.test.mjs
 *
 * Performance and correctness contracts for .github/workflows/pr-mergeability-gate.yml.
 *
 * Each test guards against a specific regression that was previously introduced
 * and reverted. The test name describes the *consequence* of the violation, not
 * just the YAML field that is wrong.
 *
 *  1. merge-git: checkout fetch-depth must be bounded
 *  2. merge-node: setup-node must cache npm
 *  3. merge-node: dashboard install must be conditional
 *  4. merge-git: base-branch fetch must be bounded
 *  5. changes: paths-filter for full_ci triage on pull_request
 *  6. merge-node: format check uses changed-files script (not full-repo Prettier)
 *  7. merge-gate-status: aggregate job with if: always(), needs all gate jobs,
 *     and inline shell (no checkout / no node from PR head) for trusted gate logic
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  ".github",
  "workflows",
);

/** Collect all steps from all jobs in a parsed workflow object. */
function allSteps(workflow) {
  const steps = [];
  for (const job of Object.values(workflow.jobs ?? {})) {
    steps.push(...(job.steps ?? []));
  }
  return steps;
}

/** Find a step whose `uses` field starts with the given prefix. */
function findActionStep(steps, actionPrefix) {
  return steps.find(
    (s) => typeof s.uses === "string" && s.uses.startsWith(actionPrefix),
  );
}

const wf = parseYaml(
  readFileSync(resolve(WORKFLOW_DIR, "pr-mergeability-gate.yml"), "utf8"),
);
const mergeGitSteps = wf.jobs?.["merge-git"]?.steps ?? [];
const mergeNodeSteps = wf.jobs?.["merge-node"]?.steps ?? [];
const changesSteps = wf.jobs?.changes?.steps ?? [];
const mergeGateStatusSteps = wf.jobs?.["merge-gate-status"]?.steps ?? [];

test("merge-git job exists and has bounded checkout fetch-depth", () => {
  assert.ok(wf.jobs?.["merge-git"], "merge-git job must exist");
  const checkout = findActionStep(mergeGitSteps, "actions/checkout");
  assert.ok(checkout, "merge-git actions/checkout step must exist");
  const depth = checkout.with?.["fetch-depth"];
  assert.notEqual(
    depth,
    0,
    "merge-git fetch-depth: 0 fetches full history unnecessarily",
  );
});

test("merge-node: setup-node caches npm to avoid cold install on every run", () => {
  assert.ok(wf.jobs?.["merge-node"], "merge-node job must exist");
  const setupNode = findActionStep(mergeNodeSteps, "actions/setup-node");
  assert.ok(setupNode, "merge-node actions/setup-node step must exist");
  assert.equal(
    setupNode.with?.cache,
    "npm",
    "setup-node must set cache: npm — without it every run cold-installs all dependencies.",
  );
});

test("merge-node: dashboard install is gated on dashboard/ diff", () => {
  const dashboardInstall = mergeNodeSteps.find(
    (s) =>
      typeof s.run === "string" &&
      s.run.includes("dashboard") &&
      s.run.includes("install"),
  );
  assert.ok(
    dashboardInstall,
    "A dashboard install step must exist (it should be conditional, not absent)",
  );
  assert.ok(
    dashboardInstall.if,
    "Dashboard install step must have an `if:` condition. " +
      "It should only run when dashboard/ files changed — running it unconditionally wastes ~30-60s " +
      "on every PR that does not touch the dashboard.",
  );
});

test("merge-git: base-branch fetch uses bounded depth, not full history", () => {
  const fetchStep = mergeGitSteps.find(
    (s) =>
      typeof s.run === "string" &&
      s.run.includes("git fetch") &&
      s.run.includes("BASE_REF"),
  );
  assert.ok(fetchStep, "A git fetch step for the base branch must exist");
  assert.ok(
    fetchStep.run.includes("--depth"),
    "git fetch for the base branch must use --depth to bound the history fetched.",
  );
  assert.ok(
    !fetchStep.run.includes("--unshallow"),
    "git fetch must not use --unshallow — that defeats the bounded fetch and pulls full history.",
  );
});

test("changes job uses paths-filter for full_ci on pull_request", () => {
  assert.ok(wf.jobs?.changes, "changes triage job must exist");
  const pf = changesSteps.find(
    (s) => typeof s.uses === "string" && s.uses.includes("dorny/paths-filter"),
  );
  assert.ok(pf, "changes job must use dorny/paths-filter");
  assert.ok(
    pf.if?.includes("pull_request"),
    "paths-filter should run only for pull_request (workflow_dispatch uses full_ci=true)",
  );
  assert.ok(
    String(pf.with?.filters ?? "").includes("full_ci:"),
    "paths-filter must define full_ci filter",
  );
});

test("merge-node: formatting uses changed-files script (performance)", () => {
  const fmt = mergeNodeSteps.find(
    (s) =>
      typeof s.run === "string" && s.run.includes("format-check-changed.mjs"),
  );
  assert.ok(
    fmt,
    "merge-node must run scripts/ci/format-check-changed.mjs instead of full-repo prettier --check",
  );
});

test("merge-node: validate/build/test steps are conditional on full_ci", () => {
  const validate = mergeNodeSteps.find((s) => s.name === "Validate");
  const build = mergeNodeSteps.find((s) => s.name === "Build");
  const tst = mergeNodeSteps.find((s) => s.name === "Test");
  assert.ok(
    validate?.if?.includes("full_ci"),
    "Validate must be gated on full_ci",
  );
  assert.ok(build?.if?.includes("full_ci"), "Build must be gated on full_ci");
  assert.ok(tst?.if?.includes("full_ci"), "Test must be gated on full_ci");
});

test("merge-gate-status aggregates gate jobs with if always", () => {
  const status = wf.jobs?.["merge-gate-status"];
  assert.ok(status, "merge-gate-status job must exist");
  assert.equal(
    status.if,
    "always()",
    "merge-gate-status must use if: always() so it runs when a needed job fails",
  );
  const needs = status.needs;
  assert.ok(
    Array.isArray(needs) &&
      needs.includes("merge-git") &&
      needs.includes("changes") &&
      needs.includes("merge-node"),
    "merge-gate-status must need merge-git, changes, merge-node",
  );
  assert.ok(
    !findActionStep(mergeGateStatusSteps, "actions/checkout"),
    "merge-gate-status must not checkout the PR branch — running node on repo files would let a PR replace scripts/ci and bypass the gate",
  );
  const checkStep = mergeGateStatusSteps.find(
    (s) => s.name === "Check merge gate jobs",
  );
  assert.ok(
    typeof checkStep?.run === "string" &&
      checkStep.run.includes("set -euo pipefail") &&
      checkStep.run.includes("failure") &&
      checkStep.run.includes("cancelled") &&
      !checkStep.run.includes("merge-gate-status.mjs"),
    "Check merge gate jobs must use inline shell from the workflow (trusted), not node scripts/ci/merge-gate-status.mjs",
  );
});
