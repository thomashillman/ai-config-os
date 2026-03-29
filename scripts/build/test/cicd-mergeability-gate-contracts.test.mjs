/**
 * cicd-mergeability-gate-contracts.test.mjs
 *
 * Performance and correctness contracts for .github/workflows/pr-mergeability-gate.yml.
 *
 * Each test guards against a specific regression that was previously introduced
 * and reverted. The test name describes the *consequence* of the violation, not
 * just the YAML field that is wrong.
 *
 *  1. Checkout fetch-depth must be bounded — fetching full history is unnecessary
 *     for merge simulation and significantly slows the job on large repos.
 *  2. setup-node must cache npm — without it every run cold-installs all deps.
 *  3. Dashboard install must be conditional — it runs npm install inside dashboard/,
 *     which takes 30-60s; it must only run when dashboard/ files changed.
 *  4. Base-branch fetch must be bounded — same rationale as checkout fetch-depth.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = resolve(__dirname, '..', '..', '..', '.github', 'workflows');

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

// Parse once at module level — all tests in this file share the same workflow object.
const wf = parseYaml(readFileSync(resolve(WORKFLOW_DIR, 'pr-mergeability-gate.yml'), 'utf8'));
const steps = allSteps(wf);

test('merge simulation: checkout uses bounded fetch-depth, not full history', () => {
  const checkout = findActionStep(steps, 'actions/checkout');
  assert.ok(checkout, 'actions/checkout step must exist');
  const depth = checkout.with?.['fetch-depth'];
  assert.notEqual(
    depth,
    0,
    'fetch-depth: 0 fetches the full repo history, which is unnecessary for merge simulation ' +
    'and slows the job on large repos. Use a bounded depth (e.g. 50).'
  );
});

test('merge simulation: setup-node caches npm to avoid cold install on every run', () => {
  const setupNode = findActionStep(steps, 'actions/setup-node');
  assert.ok(setupNode, 'actions/setup-node step must exist');
  assert.equal(
    setupNode.with?.cache,
    'npm',
    'setup-node must set cache: npm — without it every run cold-installs all dependencies.'
  );
});

test('merge simulation: dashboard install is gated on dashboard/ diff', () => {
  const dashboardInstall = steps.find(
    s => typeof s.run === 'string' && s.run.includes('dashboard') && s.run.includes('install')
  );
  assert.ok(
    dashboardInstall,
    'A dashboard install step must exist (it should be conditional, not absent)'
  );
  assert.ok(
    dashboardInstall.if,
    'Dashboard install step must have an `if:` condition. ' +
    'It should only run when dashboard/ files changed — running it unconditionally wastes ~30-60s ' +
    'on every PR that does not touch the dashboard.'
  );
});

test('merge simulation: base-branch fetch uses bounded depth, not full history', () => {
  const fetchStep = steps.find(
    s => typeof s.run === 'string' && s.run.includes('git fetch') && s.run.includes('base_ref')
  );
  assert.ok(fetchStep, 'A git fetch step for the base branch must exist');
  assert.ok(
    fetchStep.run.includes('--depth'),
    'git fetch for the base branch must use --depth to bound the history fetched. ' +
    'Without it, the full base-branch history is downloaded unnecessarily.'
  );
  assert.ok(
    !fetchStep.run.includes('--unshallow'),
    'git fetch must not use --unshallow — that defeats the bounded fetch and pulls full history.'
  );
});
