/**
 * cicd-workflow-contracts.test.mjs
 *
 * Regression tests for CI/CD workflow performance contracts.
 * Guards against re-introducing known performance anti-patterns:
 *
 *  1. build.yml — fail-fast must be true (stop sibling legs on first failure)
 *  2. build.yml — setup-node must use npm cache (avoid cold npm install every run)
 *  3. build.yml — redundant --validate-only step must not exist (pretest + full
 *     build already cover it; removing it saves one full compiler invocation per leg)
 *  4. validate.yml — push must keep path filters; PR uses triage (dorny/paths-filter) + noop job
 *  5. validate.yml — validate job checkout fetch-depth must be bounded (not full history)
 *  6. validate.yml — setup-node must use npm cache
 *  7. All workflows — no step may run compile.mjs --validate-only followed immediately
 *     by a separate compile.mjs (triple-compile anti-pattern)
 *
 * pr-mergeability-gate.yml contracts live in cicd-mergeability-gate-contracts.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const WORKFLOW_DIR = resolve(REPO_ROOT, ".github", "workflows");

/** Load and parse a workflow YAML file. */
function loadWorkflow(filename) {
  const src = readFileSync(resolve(WORKFLOW_DIR, filename), "utf8");
  return parseYaml(src);
}

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

// Parse each workflow once at module level — avoids redundant YAML reads per test.
const buildWf = loadWorkflow("build.yml");
const buildSteps = allSteps(buildWf);

const validateWf = loadWorkflow("validate.yml");
const validateSteps = allSteps(validateWf);
const validateJobSteps = validateWf.jobs?.validate?.steps ?? [];

// ─────────────────────────────────────────────
// build.yml
// ─────────────────────────────────────────────

test("build.yml: matrix strategy has fail-fast: true", () => {
  const buildJob = buildWf.jobs?.build;
  assert.ok(buildJob, "build job must exist");
  assert.equal(
    buildJob.strategy?.["fail-fast"],
    true,
    "fail-fast must be true — false wastes runner minutes when one leg fails",
  );
});

test("build.yml: setup-node action configures npm cache", () => {
  const setupNode = findActionStep(buildSteps, "actions/setup-node");
  assert.ok(setupNode, "actions/setup-node step must exist");
  assert.equal(
    setupNode.with?.cache,
    "npm",
    "setup-node must set cache: npm to avoid cold npm install on every run",
  );
});

test("build.yml: no redundant --validate-only compile step", () => {
  const validateOnlyStep = buildSteps.find(
    (s) => typeof s.run === "string" && s.run.includes("--validate-only"),
  );
  assert.equal(
    validateOnlyStep,
    undefined,
    [
      "Found a --validate-only compile step. This is redundant:",
      "  • pretest (npm test) already runs compile.mjs",
      "  • the subsequent full build step also validates",
      "Remove the --validate-only step to save one compiler invocation per matrix leg.",
    ].join("\n"),
  );
});

test("build.yml: triage job uses paths-filter and noop when skipped", () => {
  assert.ok(buildWf.jobs?.changes, "changes triage job must exist");
  const changesSteps = buildWf.jobs.changes.steps ?? [];
  const pf = changesSteps.find(
    (s) => typeof s.uses === "string" && s.uses.includes("dorny/paths-filter"),
  );
  assert.ok(pf, "changes job must use dorny/paths-filter");
  assert.ok(
    buildWf.jobs?.["build-not-needed"],
    "build-not-needed noop job must exist",
  );
});

test("build.yml: pull_request has branches main and no path filters (triage decides)", () => {
  const pr = buildWf.on?.pull_request;
  assert.ok(
    Array.isArray(pr?.branches) && pr.branches.includes("main"),
    "pull_request must target main",
  );
  assert.equal(
    pr?.paths,
    undefined,
    "PR trigger must not use paths: — triage job + noop covers relevance",
  );
});

test("build.yml: compile.mjs is not invoked more than twice in a single matrix leg", () => {
  // Acceptable: pretest (via npm test) + full build. Release mode on Linux adds a third
  // but is guarded by `if: runner.os == 'Linux'` so it only runs on one leg.
  // What we must NOT have: validate-only + full build + release = 3 unconditional calls.
  const unconditionalCompileCalls = buildSteps.filter(
    (s) => typeof s.run === "string" && s.run.includes("compile.mjs") && !s.if, // no `if:` condition — applies to all matrix legs
  );
  assert.ok(
    unconditionalCompileCalls.length <= 1,
    `Expected at most 1 unconditional compile.mjs call in steps, found ${unconditionalCompileCalls.length}. ` +
      "Extra unconditional calls waste runner time on every matrix leg.",
  );
});

// ─────────────────────────────────────────────
// validate.yml
// ─────────────────────────────────────────────

test("validate.yml: push trigger has path filters", () => {
  const pushPaths = validateWf.on?.push?.paths;
  assert.ok(
    Array.isArray(pushPaths) && pushPaths.length > 0,
    "validate.yml push trigger must have path filters — without them the workflow runs on every " +
      "push (including docs-only changes) triggering slow apt-get/brew installs unnecessarily",
  );
});

test("validate.yml: pull_request has branches main and no path filters (triage decides)", () => {
  const pr = validateWf.on?.pull_request;
  assert.ok(
    Array.isArray(pr?.branches) && pr.branches.includes("main"),
    "pull_request must target main",
  );
  assert.equal(
    pr?.paths,
    undefined,
    "PR trigger must not use paths: — triage job + noop covers relevance",
  );
});

test("validate.yml: triage job uses paths-filter and noop when skipped", () => {
  assert.ok(validateWf.jobs?.changes, "changes triage job must exist");
  const changesSteps = validateWf.jobs.changes.steps ?? [];
  const pf = changesSteps.find(
    (s) => typeof s.uses === "string" && s.uses.includes("dorny/paths-filter"),
  );
  assert.ok(pf, "changes job must use dorny/paths-filter");
  assert.ok(
    validateWf.jobs?.["validate-not-needed"],
    "validate-not-needed noop job must exist",
  );
});

test("validate.yml: path filters cover skill and runtime directories", () => {
  const paths = validateWf.on?.push?.paths ?? [];
  const hasSkills = paths.some((p) => p.includes("shared/skills"));
  const hasRuntime = paths.some((p) => p.includes("runtime"));
  const hasPlugins = paths.some((p) => p.includes("plugins"));
  assert.ok(hasSkills, "Path filters must include shared/skills/**");
  assert.ok(hasRuntime, "Path filters must include runtime/**");
  assert.ok(hasPlugins, "Path filters must include plugins/**");
});

test("validate.yml: validate job checkout fetch-depth is bounded (not full history)", () => {
  const checkout = findActionStep(validateJobSteps, "actions/checkout");
  assert.ok(checkout, "validate job actions/checkout step must exist");
  const depth = checkout.with?.["fetch-depth"];
  assert.notEqual(
    depth,
    0,
    "validate job fetch-depth: 0 would fetch full history unnecessarily. Use a bounded depth.",
  );
});

test("validate.yml: setup-node action configures npm cache", () => {
  const setupNode = findActionStep(validateJobSteps, "actions/setup-node");
  assert.ok(setupNode, "actions/setup-node step must exist");
  assert.equal(setupNode.with?.cache, "npm", "setup-node must set cache: npm");
});

// ─────────────────────────────────────────────
// Cross-workflow: triple-compile anti-pattern
// ─────────────────────────────────────────────

test("no workflow contains back-to-back --validate-only then full compile steps", () => {
  const workflows = ["build.yml", "pr-mergeability-gate.yml", "validate.yml"];
  for (const filename of workflows) {
    const wf = loadWorkflow(filename);
    const steps = allSteps(wf);
    let prevWasValidateOnly = false;
    for (const step of steps) {
      if (typeof step.run !== "string") {
        prevWasValidateOnly = false;
        continue;
      }
      const isValidateOnly =
        step.run.includes("compile.mjs") &&
        step.run.includes("--validate-only");
      const isFullCompile =
        step.run.includes("compile.mjs") &&
        !step.run.includes("--validate-only") &&
        !step.run.includes("--release");

      if (prevWasValidateOnly && isFullCompile) {
        assert.fail(
          `${filename}: found --validate-only step immediately followed by a full compile step. ` +
            "This is the triple-compile anti-pattern. Remove the --validate-only step — " +
            "the full build already validates.",
        );
      }
      prevWasValidateOnly = isValidateOnly;
    }
  }
});
