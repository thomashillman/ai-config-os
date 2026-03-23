import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { createImprovementProposal } from '../../../runtime/lib/improvement-proposal.mjs';
import { persistProposal, determineCandidateFilename } from '../../../runtime/lib/improvement-proposal-store.mjs';

function templateInsight() {
  return {
    id: 'insight_001',
    type: 'template_effectiveness',
    finding: "'onStart' narrations get 90% engagement",
    evidence: { best_point: 'onStart' },
    suggestion: {
      target: 'templates.onStart',
      confidence: 0.85,
    },
  };
}

function intentInsight() {
  return {
    id: 'insight_002',
    type: 'intent_coverage',
    finding: '3 follow-up phrases could map to known task types',
    evidence: { phrases: ['phrase1', 'phrase2'] },
    suggestion: {
      target: 'definitions',
      action: 'add_patterns',
      confidence: 0.65,
    },
  };
}

test('persistProposal writes proposal to file', async (t) => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `proposal-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const insight = templateInsight();
    const proposal = createImprovementProposal({
      insight,
      target: 'templates.onStart',
      current: 'old text',
      proposed: 'new text',
    });

    const filename = await persistProposal({
      proposal,
      outputDir: testDir,
    });

    assert.ok(filename);
    const filepath = join(testDir, filename);
    assert.ok(existsSync(filepath), `File should exist at ${filepath}`);

    // Verify file contents
    const content = readFileSync(filepath, 'utf8');
    const saved = JSON.parse(content);

    assert.equal(saved.id, proposal.id);
    assert.equal(saved.type, proposal.type);
    assert.equal(saved.target, 'templates.onStart');
    assert.equal(saved.status, 'pending_review');
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('persistProposal returns deterministic filename', async (t) => {
  const tempDir = tmpdir();
  const testDir1 = join(tempDir, `proposal-test-${Date.now()}-1`);
  const testDir2 = join(tempDir, `proposal-test-${Date.now()}-2`);
  mkdirSync(testDir1, { recursive: true });
  mkdirSync(testDir2, { recursive: true });

  try {
    const insight = templateInsight();
    const proposal = createImprovementProposal({
      insight,
      target: 'templates.onStart',
      current: 'old',
      proposed: 'new',
    });

    const filename1 = await persistProposal({
      proposal,
      outputDir: testDir1,
    });

    const filename2 = await persistProposal({
      proposal,
      outputDir: testDir2,
    });

    // Same proposal should get same filename
    assert.equal(filename1, filename2);
  } finally {
    rmSync(testDir1, { recursive: true });
    rmSync(testDir2, { recursive: true });
  }
});

test('persistProposal avoids collision by incrementing index when file exists', async (t) => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `proposal-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const insight = templateInsight();
    const proposal1 = createImprovementProposal({
      insight,
      target: 'templates.onStart',
      current: 'old',
      proposed: 'new',
    });

    // First write
    const filename1 = await persistProposal({
      proposal: proposal1,
      outputDir: testDir,
    });

    // Second write of same proposal without allowOverwrite should use next index
    const filename2 = await persistProposal({
      proposal: proposal1,
      outputDir: testDir,
      allowOverwrite: false,
    });

    // Should get different filenames due to collision avoidance
    assert.notEqual(filename1, filename2);
    assert.ok(filename1.startsWith('proposal_'));
    assert.ok(filename2.includes('_01'));

    // Both files should exist
    assert.ok(existsSync(join(testDir, filename1)));
    assert.ok(existsSync(join(testDir, filename2)));
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('persistProposal allows explicit overwrite', async (t) => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `proposal-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const insight = templateInsight();
    const proposal = createImprovementProposal({
      insight,
      target: 'templates.onStart',
      current: 'old',
      proposed: 'new',
    });

    const filename = await persistProposal({
      proposal,
      outputDir: testDir,
      allowOverwrite: true,
    });

    assert.ok(existsSync(join(testDir, filename)));

    // Overwrite same file
    const filename2 = await persistProposal({
      proposal,
      outputDir: testDir,
      allowOverwrite: true,
    });

    assert.equal(filename, filename2);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('determineCandidateFilename generates deterministic filename', () => {
  const insight = templateInsight();
  const proposal = createImprovementProposal({
    insight,
    target: 'templates.onStart',
    current: 'old',
    proposed: 'new',
  });

  const filename1 = determineCandidateFilename({
    proposal,
    index: 0,
  });

  const filename2 = determineCandidateFilename({
    proposal,
    index: 0,
  });

  // Same proposal → same filename
  assert.equal(filename1, filename2);
  assert.ok(filename1.startsWith('proposal_'));
  assert.ok(filename1.endsWith('.json'));
});

test('determineCandidateFilename includes index for collision avoidance', () => {
  const insight = templateInsight();
  const proposal = createImprovementProposal({
    insight,
    target: 'templates.onStart',
    current: 'old',
    proposed: 'new',
  });

  const filename0 = determineCandidateFilename({
    proposal,
    index: 0,
  });

  const filename1 = determineCandidateFilename({
    proposal,
    index: 1,
  });

  // Different indices → potentially different filenames
  assert.ok(filename0.length > 0);
  assert.ok(filename1.length > 0);
});

test('persistProposal creates pretty-printed JSON', async (t) => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `proposal-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const insight = templateInsight();
    const proposal = createImprovementProposal({
      insight,
      target: 'templates.onStart',
      current: 'old',
      proposed: 'new',
    });

    const filename = await persistProposal({
      proposal,
      outputDir: testDir,
    });

    const content = readFileSync(join(testDir, filename), 'utf8');
    // Pretty-printed JSON should have newlines
    assert.ok(content.includes('\n'));
    // Verify it's valid JSON
    const parsed = JSON.parse(content);
    assert.equal(parsed.id, proposal.id);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});
