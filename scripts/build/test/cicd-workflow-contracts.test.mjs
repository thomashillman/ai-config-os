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
 *  4. pr-mergeability-gate.yml — checkout fetch-depth must not be 0 (full history
 *     unnecessary for merge simulation)
 *  5. pr-mergeability-gate.yml — setup-node must use npm cache
 *  6. pr-mergeability-gate.yml — dashboard install must be conditional (skip when
 *     dashboard/ unchanged, which is the common case)
 *  7. validate.yml — must have path filters (avoid running on unrelated changes)
 *  8. validate.yml — checkout fetch-depth must not be 0
 *  9. validate.yml — setup-node must use npm cache
 * 10. All workflows — no step may run compile.mjs --validate-only followed immediately
 *     by a separate compile.mjs (triple-compile anti-pattern)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const WORKFLOW_DIR = resolve(REPO_ROOT, '.github', 'workflows');

/** Load and parse a workflow YAML file. */
function loadWorkflow(filename) {
  const src = readFileSync(resolve(WORKFLOW_DIR, filename), 'utf8');
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
  return steps.find(s => typeof s.uses === 'string' && s.uses.startsWith(actionPrefix));
}

// ─────────────────────────────────────────────
// build.yml
// ─────────────────────────────────────────────

test('build.yml: matrix strategy has fail-fast: true', () => {
  const wf = loadWorkflow('build.yml');
  const buildJob = wf.jobs?.build;
  assert.ok(buildJob, 'build job must exist');
  assert.equal(
    buildJob.strategy?.['fail-fast'],
    true,
    'fail-fast must be true — false wastes runner minutes when one leg fails'
  );
});

test('build.yml: setup-node action configures npm cache', () => {
  const wf = loadWorkflow('build.yml');
  const steps = allSteps(wf);
  const setupNode = findActionStep(steps, 'actions/setup-node');
  assert.ok(setupNode, 'actions/setup-node step must exist');
  assert.equal(
    setupNode.with?.cache,
    'npm',
    'setup-node must set cache: npm to avoid cold npm install on every run'
  );
});

test('build.yml: no redundant --validate-only compile step', () => {
  const wf = loadWorkflow('build.yml');
  const steps = allSteps(wf);
  const validateOnlyStep = steps.find(
    s => typeof s.run === 'string' && s.run.includes('--validate-only')
  );
  assert.equal(
    validateOnlyStep,
    undefined,
    [
      'Found a --validate-only compile step. This is redundant:',
      '  • pretest (npm test) already runs compile.mjs',
      '  • the subsequent full build step also validates',
      'Remove the --validate-only step to save one compiler invocation per matrix leg.',
    ].join('\n')
  );
});

test('build.yml: compile.mjs is not invoked more than twice in a single matrix leg', () => {
  // Acceptable: pretest (via npm test) + full build. Release mode on Linux adds a third
  // but is guarded by `if: runner.os == 'Linux'` so it only runs on one leg.
  // What we must NOT have: validate-only + full build + release = 3 unconditional calls.
  const wf = loadWorkflow('build.yml');
  const steps = allSteps(wf);
  const unconditionalCompileCalls = steps.filter(
    s =>
      typeof s.run === 'string' &&
      s.run.includes('compile.mjs') &&
      !s.if  // no `if:` condition — applies to all matrix legs
  );
  assert.ok(
    unconditionalCompileCalls.length <= 1,
    `Expected at most 1 unconditional compile.mjs call in steps, found ${unconditionalCompileCalls.length}. ` +
    'Extra unconditional calls waste runner time on every matrix leg.'
  );
});

// ─────────────────────────────────────────────
// pr-mergeability-gate.yml
// ─────────────────────────────────────────────

test('pr-mergeability-gate.yml: checkout fetch-depth is not 0 (full history)', () => {
  const wf = loadWorkflow('pr-mergeability-gate.yml');
  const steps = allSteps(wf);
  const checkout = findActionStep(steps, 'actions/checkout');
  assert.ok(checkout, 'actions/checkout step must exist');
  const depth = checkout.with?.['fetch-depth'];
  assert.notEqual(
    depth,
    0,
    'fetch-depth: 0 fetches the full repo history which is unnecessary for merge simulation. ' +
    'Use a bounded depth (e.g. 50).'
  );
});

test('pr-mergeability-gate.yml: setup-node action configures npm cache', () => {
  const wf = loadWorkflow('pr-mergeability-gate.yml');
  const steps = allSteps(wf);
  const setupNode = findActionStep(steps, 'actions/setup-node');
  assert.ok(setupNode, 'actions/setup-node step must exist');
  assert.equal(
    setupNode.with?.cache,
    'npm',
    'setup-node must set cache: npm'
  );
});

test('pr-mergeability-gate.yml: dashboard install step is conditional', () => {
  const wf = loadWorkflow('pr-mergeability-gate.yml');
  const steps = allSteps(wf);
  const dashboardInstall = steps.find(
    s => typeof s.run === 'string' && s.run.includes('dashboard') && s.run.includes('install')
  );
  assert.ok(
    dashboardInstall,
    'A dashboard install step must exist (it should just be conditional)'
  );
  assert.ok(
    dashboardInstall.if,
    'Dashboard install step must have an `if:` condition — it should only run when dashboard/ changes. ' +
    'Installing dashboard deps on every PR (even unrelated ones) wastes ~30-60s.'
  );
});

test('pr-mergeability-gate.yml: git fetch uses bounded depth, not full history', () => {
  const wf = loadWorkflow('pr-mergeability-gate.yml');
  const steps = allSteps(wf);
  const fetchStep = steps.find(
    s => typeof s.run === 'string' && s.run.includes('git fetch') && s.run.includes('base_ref')
  );
  assert.ok(fetchStep, 'git fetch step for base branch must exist');
  assert.ok(
    fetchStep.run.includes('--depth'),
    'git fetch must use --depth to bound history fetched for base branch'
  );
  // Must not use --depth=0 or --unshallow (which defeats the point)
  assert.ok(
    !fetchStep.run.includes('--unshallow'),
    'git fetch must not use --unshallow — that fetches full history'
  );
});

// ─────────────────────────────────────────────
// validate.yml
// ─────────────────────────────────────────────

test('validate.yml: push trigger has path filters', () => {
  const wf = loadWorkflow('validate.yml');
  const pushPaths = wf.on?.push?.paths;
  assert.ok(
    Array.isArray(pushPaths) && pushPaths.length > 0,
    'validate.yml push trigger must have path filters — without them the workflow runs on every ' +
    'push (including docs-only changes) triggering slow apt-get/brew installs unnecessarily'
  );
});

test('validate.yml: pull_request trigger has path filters', () => {
  const wf = loadWorkflow('validate.yml');
  const prPaths = wf.on?.pull_request?.paths;
  assert.ok(
    Array.isArray(prPaths) && prPaths.length > 0,
    'validate.yml pull_request trigger must have path filters'
  );
});

test('validate.yml: path filters cover skill and runtime directories', () => {
  const wf = loadWorkflow('validate.yml');
  const paths = wf.on?.push?.paths ?? [];
  const hasSkills = paths.some(p => p.includes('shared/skills'));
  const hasRuntime = paths.some(p => p.includes('runtime'));
  const hasPlugins = paths.some(p => p.includes('plugins'));
  assert.ok(hasSkills, 'Path filters must include shared/skills/**');
  assert.ok(hasRuntime, 'Path filters must include runtime/**');
  assert.ok(hasPlugins, 'Path filters must include plugins/**');
});

test('validate.yml: checkout fetch-depth is not 0 (full history)', () => {
  const wf = loadWorkflow('validate.yml');
  const steps = allSteps(wf);
  const checkout = findActionStep(steps, 'actions/checkout');
  assert.ok(checkout, 'actions/checkout step must exist');
  const depth = checkout.with?.['fetch-depth'];
  assert.notEqual(
    depth,
    0,
    'fetch-depth: 0 fetches full git history unnecessarily. Use a bounded depth.'
  );
});

test('validate.yml: setup-node action configures npm cache', () => {
  const wf = loadWorkflow('validate.yml');
  const steps = allSteps(wf);
  const setupNode = findActionStep(steps, 'actions/setup-node');
  assert.ok(setupNode, 'actions/setup-node step must exist');
  assert.equal(
    setupNode.with?.cache,
    'npm',
    'setup-node must set cache: npm'
  );
});

// ─────────────────────────────────────────────
// Cross-workflow: triple-compile anti-pattern
// ─────────────────────────────────────────────

test('no workflow contains back-to-back --validate-only then full compile steps', () => {
  const workflows = ['build.yml', 'pr-mergeability-gate.yml', 'validate.yml'];
  for (const filename of workflows) {
    const wf = loadWorkflow(filename);
    const steps = allSteps(wf);
    let prevWasValidateOnly = false;
    for (const step of steps) {
      if (typeof step.run !== 'string') {
        prevWasValidateOnly = false;
        continue;
      }
      const isValidateOnly = step.run.includes('compile.mjs') && step.run.includes('--validate-only');
      const isFullCompile =
        step.run.includes('compile.mjs') &&
        !step.run.includes('--validate-only') &&
        !step.run.includes('--release');

      if (prevWasValidateOnly && isFullCompile) {
        assert.fail(
          `${filename}: found --validate-only step immediately followed by a full compile step. ` +
          'This is the triple-compile anti-pattern. Remove the --validate-only step — ' +
          'the full build already validates.'
        );
      }
      prevWasValidateOnly = isValidateOnly;
    }
  }
});
