import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { persistCandidate, determineCandidateFilename } from '../../../runtime/lib/eval-candidate-store.mjs';

function mockCandidate(overrides = {}) {
  return {
    id: 'candidate_loop_12345',
    signal_type: 'loop',
    count: 4,
    severity: 'high',
    evidence: {
      turns: [3, 7, 12, 15],
      impacts: ['high'],
      examples: ['Tool called twice'],
      repeatable: true,
    },
    recommendation: 'Consider creating an eval or template adjustment',
    created_at: '2026-03-23T10:00:00.000Z',
    ...overrides,
  };
}

test('persistCandidate writes candidate to file', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `candidate-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const candidate = mockCandidate();
    const filename = await persistCandidate({
      candidate,
      outputDir: testDir,
    });

    assert.ok(filename);
    const filepath = join(testDir, filename);
    assert.ok(existsSync(filepath), `File should exist at ${filepath}`);

    // Verify file contents
    const content = readFileSync(filepath, 'utf8');
    const saved = JSON.parse(content);

    assert.equal(saved.id, candidate.id);
    assert.equal(saved.signal_type, 'loop');
    assert.equal(saved.count, 4);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('persistCandidate generates deterministic filename', async () => {
  const tempDir = tmpdir();
  const testDir1 = join(tempDir, `candidate-test-${Date.now()}-1`);
  const testDir2 = join(tempDir, `candidate-test-${Date.now()}-2`);
  mkdirSync(testDir1, { recursive: true });
  mkdirSync(testDir2, { recursive: true });

  try {
    const candidate = mockCandidate();

    const filename1 = await persistCandidate({
      candidate,
      outputDir: testDir1,
    });

    const filename2 = await persistCandidate({
      candidate,
      outputDir: testDir2,
    });

    // Same candidate → same filename
    assert.equal(filename1, filename2);
  } finally {
    rmSync(testDir1, { recursive: true });
    rmSync(testDir2, { recursive: true });
  }
});

test('persistCandidate prevents overwrite without allowOverwrite', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `candidate-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const candidate = mockCandidate();

    // First write
    const filename1 = await persistCandidate({
      candidate,
      outputDir: testDir,
    });

    // Second write without allowOverwrite should use next index
    const filename2 = await persistCandidate({
      candidate,
      outputDir: testDir,
      allowOverwrite: false,
    });

    // Should get different filenames
    assert.notEqual(filename1, filename2);
    assert.ok(existsSync(join(testDir, filename1)));
    assert.ok(existsSync(join(testDir, filename2)));
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('persistCandidate allows explicit overwrite', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `candidate-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const candidate = mockCandidate();

    const filename1 = await persistCandidate({
      candidate,
      outputDir: testDir,
      allowOverwrite: true,
    });

    // Overwrite the same file
    const filename2 = await persistCandidate({
      candidate,
      outputDir: testDir,
      allowOverwrite: true,
    });

    assert.equal(filename1, filename2);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('determineCandidateFilename generates filename from signal type', () => {
  const candidate = mockCandidate({
    signal_type: 'capability_gap',
  });

  const filename = determineCandidateFilename({ candidate });

  assert.ok(filename.startsWith('candidate_'));
  assert.ok(filename.includes('capability_gap'));
  assert.ok(filename.endsWith('.json'));
});

test('persistCandidate preserves candidate schema', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `candidate-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const candidate = mockCandidate({
      count: 5,
      severity: 'medium',
      evidence: {
        turns: [1, 5, 10],
        impacts: ['medium', 'low'],
        examples: ['example1', 'example2'],
      },
    });

    const filename = await persistCandidate({
      candidate,
      outputDir: testDir,
    });

    const content = readFileSync(join(testDir, filename), 'utf8');
    const saved = JSON.parse(content);

    assert.equal(saved.count, 5);
    assert.equal(saved.severity, 'medium');
    assert.deepEqual(saved.evidence.turns, [1, 5, 10]);
    assert.deepEqual(saved.evidence.impacts, ['medium', 'low']);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test('persistCandidate requires candidate', async () => {
  assert.rejects(
    () => persistCandidate({
      outputDir: '/tmp/test',
    }),
    /candidate is required/,
  );
});

test('persistCandidate requires outputDir', async () => {
  const candidate = mockCandidate();
  assert.rejects(
    () => persistCandidate({
      candidate,
    }),
    /outputDir is required/,
  );
});

test('persistCandidate creates pretty-printed JSON', async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `candidate-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const candidate = mockCandidate();
    const filename = await persistCandidate({
      candidate,
      outputDir: testDir,
    });

    const content = readFileSync(join(testDir, filename), 'utf8');
    // Pretty-printed JSON should have newlines and indentation
    assert.ok(content.includes('\n'));
    assert.ok(content.includes('  '));
  } finally {
    rmSync(testDir, { recursive: true });
  }
});
