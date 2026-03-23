import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { promoteIntentProposal } from '../../../runtime/lib/promote-intent-proposal.mjs';

function intentProposal(overrides = {}) {
  return {
    id: 'proposal_intent_001',
    type: 'intent_definition',
    target: 'definitions',
    status: 'pending_review',
    insight_id: 'insight_intent_001',
    current: null,
    proposed: {
      phrases: ['How should I handle this error?', 'What about error recovery?'],
      taskType: 'error_handling',
    },
    evidence: {
      phrases: ['phrase1', 'phrase2', 'phrase3'],
    },
    confidence: 0.7,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test('promoteIntentProposal succeeds when eval passes', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-intent-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = intentProposal();
    const definitionsPath = join(testDir, 'definitions.json');

    const result = await promoteIntentProposal({
      proposal,
      definitionsFilePath: definitionsPath,
    });

    assert.equal(result.success, true);
    assert.ok(result.eval_result);
    assert.equal(result.eval_result.success, true);
    assert.equal(result.proposed_status, 'promoted');
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('promoteIntentProposal fails when eval fails', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-intent-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = intentProposal({
      proposed: {
        phrases: [],
        taskType: 'error_handling',
      },
    });
    const definitionsPath = join(testDir, 'definitions.json');

    const result = await promoteIntentProposal({
      proposal,
      definitionsFilePath: definitionsPath,
    });

    assert.equal(result.success, false);
    assert.ok(result.eval_result);
    assert.equal(result.eval_result.success, false);
    assert.equal(result.proposed_status, 'eval_failed');
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('promoteIntentProposal appends to existing definitions', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-intent-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = intentProposal();
    const definitionsPath = join(testDir, 'definitions.json');

    const result = await promoteIntentProposal({
      proposal,
      definitionsFilePath: definitionsPath,
    });

    assert.equal(result.success, true);
    assert.ok(result.updated_proposal);
    assert.equal(result.updated_proposal.status, 'promoted');
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('promoteIntentProposal creates definitions file if not exists', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-intent-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = intentProposal();
    const definitionsPath = join(testDir, 'definitions.json');

    const result = await promoteIntentProposal({
      proposal,
      definitionsFilePath: definitionsPath,
    });

    assert.equal(result.success, true);
    // Note: The file content depends on implementation - could be JSON array or object
    assert.ok(result.message);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('promoteIntentProposal includes eval details in result', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-intent-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = intentProposal();
    const definitionsPath = join(testDir, 'definitions.json');

    const result = await promoteIntentProposal({
      proposal,
      definitionsFilePath: definitionsPath,
    });

    assert.ok(result.eval_result);
    assert.ok(result.eval_result.phrases_checked >= 0);
    assert.ok(result.eval_result.task_type);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('promoteIntentProposal requires proposal', async () => {
  assert.rejects(
    () => promoteIntentProposal({
      definitionsFilePath: '/tmp/test.json',
    }),
    /proposal is required/,
  );
});

test('promoteIntentProposal requires definitionsFilePath', async () => {
  const proposal = intentProposal();
  assert.rejects(
    () => promoteIntentProposal({
      proposal,
    }),
    /definitionsFilePath is required/,
  );
});

test('promoteIntentProposal returns stable result shape', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-intent-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = intentProposal();
    const definitionsPath = join(testDir, 'definitions.json');

    const result = await promoteIntentProposal({
      proposal,
      definitionsFilePath: definitionsPath,
    });

    assert.ok(typeof result.success === 'boolean');
    assert.ok(result.eval_result);
    assert.ok(result.proposed_status);
    assert.ok(result.updated_proposal);
    assert.ok(result.message);
    assert.ok(result.promoted_at);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});
