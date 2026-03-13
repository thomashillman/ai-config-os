import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFindingsLedgerEntry,
  appendFindingToTask,
  transitionFindingsForRouteUpgrade,
} from '../../../runtime/lib/findings-ledger.mjs';

function taskFixture(overrides = {}) {
  return {
    schema_version: '1.0.0',
    task_id: 'task_review_repository_010',
    task_type: 'review_repository',
    goal: 'Review repository changes for correctness and risk.',
    current_route: 'github_pr',
    state: 'active',
    progress: { completed_steps: 1, total_steps: 3 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [{ route: 'github_pr', selected_at: '2026-03-12T12:00:00.000Z' }],
    next_action: 'collect_more_context',
    version: 1,
    updated_at: '2026-03-12T12:00:00.000Z',
    ...overrides,
  };
}

test('createFindingsLedgerEntry validates canonical finding shape', () => {
  const entry = createFindingsLedgerEntry({
    findingId: 'unsafe_eval_usage',
    summary: 'Unsafe eval usage in user-controlled code path.',
    evidence: ['src/runner.mjs:42'],
    status: 'hypothesis',
    recordedAt: '2026-03-12T12:05:00.000Z',
    recordedByRoute: 'github_pr',
  });

  assert.equal(entry.finding_id, 'unsafe_eval_usage');
  assert.equal(entry.provenance.status, 'hypothesis');
  assert.equal(entry.provenance.recorded_by_route, 'github_pr');
});

test('appendFindingToTask appends finding, increments version, and keeps task valid', () => {
  const updated = appendFindingToTask({
    task: taskFixture(),
    expectedVersion: 1,
    finding: {
      findingId: 'missing_authz_check',
      summary: 'Missing authz check on privileged endpoint.',
      status: 'verified',
      recordedAt: '2026-03-12T12:06:00.000Z',
      recordedByRoute: 'github_pr',
    },
    updatedAt: '2026-03-12T12:06:00.000Z',
  });

  assert.equal(updated.version, 2);
  assert.equal(updated.findings.length, 1);
  assert.equal(updated.findings[0].provenance.status, 'verified');
});

test('appendFindingToTask rejects stale expectedVersion', () => {
  assert.throws(
    () => appendFindingToTask({
      task: taskFixture({ version: 3 }),
      expectedVersion: 2,
      finding: {
        findingId: 'stale_version_test',
        summary: 'stale version test',
        status: 'hypothesis',
        recordedAt: '2026-03-12T12:06:00.000Z',
        recordedByRoute: 'github_pr',
      },
      updatedAt: '2026-03-12T12:06:00.000Z',
    }),
    /expectedVersion 2 does not match task version 3/,
  );
});

test('transitionFindingsForRouteUpgrade downgrades cross-route verified findings to reused', () => {
  const findings = [
    createFindingsLedgerEntry({
      findingId: 'weak_route_verified',
      summary: 'Found while reviewing PR metadata.',
      status: 'verified',
      recordedAt: '2026-03-12T12:10:00.000Z',
      recordedByRoute: 'github_pr',
    }),
    createFindingsLedgerEntry({
      findingId: 'weak_route_hypothesis',
      summary: 'Potential issue in diff context.',
      status: 'hypothesis',
      recordedAt: '2026-03-12T12:11:00.000Z',
      recordedByRoute: 'github_pr',
    }),
    createFindingsLedgerEntry({
      findingId: 'strong_route_verified',
      summary: 'Strong-route validation already done.',
      status: 'verified',
      recordedAt: '2026-03-12T12:12:00.000Z',
      recordedByRoute: 'local_repo',
    }),
  ];

  const transitioned = transitionFindingsForRouteUpgrade({
    findings,
    toRouteId: 'local_repo',
    upgradedAt: '2026-03-12T12:15:00.000Z',
    toEquivalenceLevel: 'equal',
  });

  assert.equal(transitioned[0].provenance.status, 'reused');
  assert.equal(transitioned[0].provenance.recorded_by_route, 'local_repo');
  assert.match(transitioned[0].provenance.note, /Route upgrade to 'local_repo'/);

  assert.equal(transitioned[1].provenance.status, 'hypothesis');
  assert.equal(transitioned[2].provenance.status, 'verified');
});


test('transitionFindingsForRouteUpgrade is a no-op for degraded-equivalence routes', () => {
  const findings = [
    createFindingsLedgerEntry({
      findingId: 'degraded_no_transition',
      summary: 'Verified in weak route and kept unchanged for degraded transition.',
      status: 'verified',
      recordedAt: '2026-03-12T12:30:00.000Z',
      recordedByRoute: 'github_pr',
    }),
  ];

  const transitioned = transitionFindingsForRouteUpgrade({
    findings,
    toRouteId: 'uploaded_bundle',
    upgradedAt: '2026-03-12T12:31:00.000Z',
    toEquivalenceLevel: 'degraded',
  });

  assert.equal(transitioned[0].provenance.status, 'verified');
  assert.equal(transitioned[0].provenance.recorded_by_route, 'github_pr');
});

test('transitionFindingsForRouteUpgrade rejects unknown equivalence levels', () => {
  const findings = [
    createFindingsLedgerEntry({
      findingId: 'bad_equivalence_level',
      summary: 'Bad equivalence transition should fail fast.',
      status: 'hypothesis',
      recordedAt: '2026-03-12T12:40:00.000Z',
      recordedByRoute: 'github_pr',
    }),
  ];

  assert.throws(
    () => transitionFindingsForRouteUpgrade({
      findings,
      toRouteId: 'local_repo',
      upgradedAt: '2026-03-12T12:41:00.000Z',
      toEquivalenceLevel: 'unknown_level',
    }),
    /requires toEquivalenceLevel to be one of: equal, degraded/,
  );
});
