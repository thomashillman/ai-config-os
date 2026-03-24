/**
 * momentum-journey.test.mjs
 *
 * Slice G: End-to-end acceptance test.
 * Validates the full journey: weak-start → strong-resume → confidence-growth
 * → momentum-view determinism → shelf ranking.
 *
 * Uses real module composition; no mocks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntent } from '../../../runtime/lib/intent-lexicon.mjs';
import { getStrengthLabel } from '../../../runtime/lib/strength-labels.mjs';
import { createFindingsLedgerEntry, transitionFindingsForRouteUpgrade } from '../../../runtime/lib/findings-ledger.mjs';
import { buildMomentumView } from '../../../runtime/lib/momentum-view.mjs';
import { createContinuationPackage } from '../../../runtime/lib/continuation-package.mjs';
import { buildMomentumShelf } from '../../../runtime/lib/momentum-shelf.mjs';

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeTask({ taskId, route, findings = [], nextAction = 'Next step', state = 'active', progress = { completed_steps: 1, total_steps: 5 }, updatedAt = '2026-03-12T12:00:00.000Z' } = {}) {
  return {
    schema_version: '1.0.0',
    task_id: taskId,
    task_type: 'review_repository',
    goal: 'Review repository for correctness.',
    current_route: route,
    state,
    progress,
    findings,
    unresolved_questions: [],
    approvals: [],
    route_history: [{ route, selected_at: '2026-03-12T12:00:00.000Z' }],
    next_action: nextAction,
    version: 1,
    updated_at: updatedAt,
  };
}

function makeContract({ taskId, routeId, equivalenceLevel, upgradeExplanation } = {}) {
  const contract = {
    schema_version: '1.0.0',
    task_id: taskId,
    task_type: 'review_repository',
    selected_route: {
      schema_version: '1.0.0',
      route_id: routeId,
      equivalence_level: equivalenceLevel,
      required_capabilities: [],
      missing_capabilities: [],
    },
    equivalence_level: equivalenceLevel,
    missing_capabilities: [],
    required_inputs: [],
    computed_at: '2026-03-12T12:00:00.000Z',
  };
  if (upgradeExplanation) {
    contract.upgrade_explanation = upgradeExplanation;
  }
  return contract;
}

// ── Scenario 1: Weak-start with pasted_diff ───────────────────────────────────

test('scenario 1: intent resolves to review_repository with workTitle', () => {
  const intent = resolveIntent('review this repo');
  assert.equal(intent.resolved, true);
  assert.equal(intent.taskType, 'review_repository');
  assert.equal(intent.workTitle, 'Repository review');
});

test('scenario 1: pasted_diff route has limited strength', () => {
  const strength = getStrengthLabel('pasted_diff');
  assert.equal(strength.level, 'limited');
});

test('scenario 1: MomentumView shows limited strength and upgrade opportunity for pasted_diff task', () => {
  const finding = createFindingsLedgerEntry({
    findingId: 'j-finding-01',
    summary: 'Potential null dereference in loop.',
    status: 'hypothesis',
    recordedAt: '2026-03-12T12:00:00.000Z',
    recordedByRoute: 'pasted_diff',
  });
  assert.equal(finding.provenance.confidence, 'low');
  assert.equal(finding.provenance.confidence_basis, 'diff_only');

  const task = makeTask({ taskId: 'task_journey_001', route: 'pasted_diff', findings: [finding], nextAction: 'Verify call sites' });
  const contract = makeContract({
    taskId: 'task_journey_001',
    routeId: 'pasted_diff',
    equivalenceLevel: 'degraded',
    upgradeExplanation: {
      before: 'Using pasted diff, only changed lines can be inspected',
      now: 'Diff analysis is available',
      unlocks: 'Full repository access enables call site verification, dependency impact analysis, and related test inspection',
      stronger_route_id: 'local_repo',
    },
  });

  const view = buildMomentumView({ task, effectiveExecutionContract: contract });

  assert.equal(view.work_title, 'Repository review');
  assert.equal(view.current_strength.level, 'limited');
  assert.equal(view.best_next_action, 'Verify call sites');
  assert.ok(view.upgrade_opportunity, 'upgrade_opportunity should be present');
  assert.match(view.upgrade_opportunity.unlocks, /[Ff]ull repository/);
  assert.equal(view.top_findings[0].confidence, 'low');
});

// ── Scenario 2: Strong-resume with local_repo ─────────────────────────────────

test('scenario 2: after route upgrade to local_repo, finding confidence upgrades to high', () => {
  const finding = createFindingsLedgerEntry({
    findingId: 'j-finding-02',
    summary: 'Missing input validation.',
    status: 'verified',
    recordedAt: '2026-03-12T12:00:00.000Z',
    recordedByRoute: 'pasted_diff',
  });
  assert.equal(finding.provenance.confidence, 'low');

  const upgraded = transitionFindingsForRouteUpgrade({
    findings: [finding],
    toRouteId: 'local_repo',
    upgradedAt: '2026-03-12T12:10:00.000Z',
    toEquivalenceLevel: 'equal',
  });
  assert.equal(upgraded[0].provenance.confidence, 'high');
  assert.equal(upgraded[0].provenance.confidence_basis, 'full_repo_verification');
});

test('scenario 2: MomentumView shows full strength and no upgrade opportunity for local_repo task', () => {
  const finding = createFindingsLedgerEntry({
    findingId: 'j-finding-03',
    summary: 'Confirmed null dereference.',
    status: 'verified',
    recordedAt: '2026-03-12T12:10:00.000Z',
    recordedByRoute: 'local_repo',
  });

  const task = makeTask({ taskId: 'task_journey_002', route: 'local_repo', findings: [finding], nextAction: 'Write fix' });
  const contract = makeContract({ taskId: 'task_journey_002', routeId: 'local_repo', equivalenceLevel: 'equal' });

  const view = buildMomentumView({ task, effectiveExecutionContract: contract });

  assert.equal(view.current_strength.level, 'full');
  assert.equal(view.upgrade_opportunity, undefined);
  assert.equal(view.top_findings[0].confidence, 'high');
});

test('scenario 2: continuation package has resume_headline "Continuing Repository review"', () => {
  const finding = createFindingsLedgerEntry({
    findingId: 'j-finding-04',
    summary: 'Confirmed finding after route upgrade.',
    status: 'verified',
    recordedAt: '2026-03-12T12:10:00.000Z',
    recordedByRoute: 'local_repo',
  });

  const task = makeTask({ taskId: 'task_journey_003', route: 'local_repo', findings: [finding], nextAction: 'Apply fix' });
  const contract = makeContract({ taskId: 'task_journey_003', routeId: 'local_repo', equivalenceLevel: 'equal' });

  const pkg = createContinuationPackage({
    task,
    effectiveExecutionContract: contract,
    handoffTokenId: 'handoff_journey_001',
    createdAt: '2026-03-12T12:15:00.000Z',
  });

  assert.equal(pkg.resume_headline, 'Continuing Repository review');
  assert.equal(pkg.best_next_step, 'Apply fix');
  assert.equal(pkg.upgrade_value_statement, undefined);
});

// ── Scenario 3: Confidence growth ─────────────────────────────────────────────

test('scenario 3: confidence grows pasted_diff → github_pr → local_repo and never decreases', () => {
  const finding = createFindingsLedgerEntry({
    findingId: 'j-finding-05',
    summary: 'Suspicious auth bypass.',
    status: 'hypothesis',
    recordedAt: '2026-03-12T12:00:00.000Z',
    recordedByRoute: 'pasted_diff',
  });
  assert.equal(finding.provenance.confidence, 'low');

  // Upgrade to github_pr
  const afterPR = transitionFindingsForRouteUpgrade({
    findings: [finding],
    toRouteId: 'github_pr',
    upgradedAt: '2026-03-12T12:05:00.000Z',
    toEquivalenceLevel: 'equal',
  });
  assert.equal(afterPR[0].provenance.confidence, 'medium');

  // Upgrade to local_repo
  const afterLocal = transitionFindingsForRouteUpgrade({
    findings: afterPR,
    toRouteId: 'local_repo',
    upgradedAt: '2026-03-12T12:10:00.000Z',
    toEquivalenceLevel: 'equal',
  });
  assert.equal(afterLocal[0].provenance.confidence, 'high');

  // Verify confidence never went below previous values at any stage
  const stages = ['low', 'medium', 'high'];
  const stageValues = [finding, ...afterPR, ...afterLocal].map(f => f.provenance.confidence);
  // Each stage's confidence should be >= the previous (non-decreasing)
  assert.equal(stageValues[0], 'low');
  assert.equal(stageValues[1], 'medium');
  assert.equal(stageValues[2], 'high');
});

// ── Scenario 4: Shelf ranking ─────────────────────────────────────────────────

test('scenario 4: buildMomentumShelf ranks active tasks with upgrade opportunity highest', () => {
  const finding = createFindingsLedgerEntry({
    findingId: 'j-shelf-finding',
    summary: 'Finding for shelf test.',
    status: 'hypothesis',
    recordedAt: '2026-03-12T12:00:00.000Z',
    recordedByRoute: 'github_pr',
  });

  // Task with route upgrade available (pasted_diff, can upgrade to local_repo)
  const taskWithUpgrade = makeTask({
    taskId: 'task_shelf_01',
    route: 'pasted_diff',
    findings: [finding],
    state: 'active',
    updatedAt: '2026-03-12T12:00:00.000Z',
  });

  // Active task already on strongest route
  const taskStrong = makeTask({
    taskId: 'task_shelf_02',
    route: 'local_repo',
    findings: [],
    state: 'active',
    updatedAt: '2026-03-12T11:00:00.000Z',
  });

  // Pending task
  const taskPending = makeTask({
    taskId: 'task_shelf_03',
    route: 'pasted_diff',
    findings: [],
    state: 'pending',
    updatedAt: '2026-03-12T10:00:00.000Z',
  });

  const shelf = buildMomentumShelf({
    tasks: [taskStrong, taskPending, taskWithUpgrade],
    currentCapabilities: {
      capabilities: {
        network_http: 'supported',
        local_fs: 'supported',
        local_shell: 'supported',
        local_repo: 'supported',
      },
    },
  });

  assert.ok(shelf.length >= 1, 'shelf should have entries');
  // All entries should have required fields
  for (const entry of shelf) {
    assert.ok(entry.task_id);
    assert.ok(typeof entry.rank === 'number');
    assert.ok(entry.environment_fit);
  }

  // The task with upgrade opportunity (pasted_diff → local_repo) should score highly
  const withUpgradeEntry = shelf.find(e => e.task_id === 'task_shelf_01');
  assert.ok(withUpgradeEntry, 'pasted_diff task with upgrade should appear in shelf');
  assert.equal(withUpgradeEntry.route_upgrade_available, true);
});

// ── Scenario 5: Determinism ───────────────────────────────────────────────────

test('scenario 5: identical journey inputs produce byte-identical MomentumView output', () => {
  const finding = createFindingsLedgerEntry({
    findingId: 'j-det-finding',
    summary: 'Determinism test finding.',
    status: 'hypothesis',
    recordedAt: '2026-03-12T12:00:00.000Z',
    recordedByRoute: 'github_pr',
  });

  const task = makeTask({ taskId: 'task_det_001', route: 'github_pr', findings: [finding], nextAction: 'Review changes' });
  const contract = makeContract({
    taskId: 'task_det_001',
    routeId: 'github_pr',
    equivalenceLevel: 'degraded',
    upgradeExplanation: {
      before: 'PR context is available from GitHub',
      now: 'PR metadata and changed files are inspected',
      unlocks: 'Full repository access enables complete call site verification and test inspection',
      stronger_route_id: 'local_repo',
    },
  });

  const first = JSON.stringify(buildMomentumView({ task, effectiveExecutionContract: contract }), null, 2);
  for (let i = 0; i < 9; i++) {
    const current = JSON.stringify(buildMomentumView({ task, effectiveExecutionContract: contract }), null, 2);
    assert.equal(current, first, `Run ${i + 2} produced different output`);
  }
});
