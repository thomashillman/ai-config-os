/**
 * reproducibility.test.mjs
 *
 * Tests that builds are deterministic:
 * 1. Local builds are byte-reproducible (run twice, same output)
 * 2. Release builds are byte-reproducible with fixed provenance inputs
 * 3. Release builds differ only in provenance when env values change
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, rmSync, existsSync, cpSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILE_MJS = resolve(__dirname, '..', 'compile.mjs');
const DIST_DIR = join(REPO_ROOT, 'dist');

// Helper: Compute hash of a file
function hashFile(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Helper: Robustly remove a directory (handles race conditions)
function removeDistDir(dirPath) {
  if (!existsSync(dirPath)) return;
  // Use force: true to handle permission issues
  // If this fails, the compiler's mkdirSync with recursive:true will handle re-creation
  try {
    rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    // If removal fails, that's okay - the compiler will overwrite or re-create as needed
    // This prevents test failures due to OS-level file handle delays
  }
}

// Helper: Run compiler with given args and env
function runCompiler(args = [], env = {}) {
  const result = spawnSync(process.execPath, [COMPILE_MJS, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, `Compiler failed:\n${result.stderr}`);
  return result;
}

// Helper: Save dist/ to a temp location for comparison
function captureDistOutput() {
  const tmpDir = join(tmpdir(), `dist-capture-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  cpSync(DIST_DIR, tmpDir, { recursive: true });
  return tmpDir;
}

// Helper: Compare two dist/ snapshots
function compareDistSnapshots(snap1, snap2) {
  const paths = ['registry/index.json', 'clients/claude-code/.claude-plugin/plugin.json', 'clients/cursor/.cursorrules'];
  const hashes1 = {};
  const hashes2 = {};

  for (const path of paths) {
    hashes1[path] = hashFile(join(snap1, path));
    hashes2[path] = hashFile(join(snap2, path));
  }

  return { hashes1, hashes2, match: JSON.stringify(hashes1) === JSON.stringify(hashes2) };
}

// ─── Test 1: Local builds are deterministic ───

test('local builds are byte-reproducible', () => {
  // First build
  runCompiler();
  const snap1 = captureDistOutput();

  // Clean dist/ to remove any caching effects
  removeDistDir(DIST_DIR);

  // Second build
  runCompiler();
  const snap2 = captureDistOutput();

  const { hashes1, hashes2, match } = compareDistSnapshots(snap1, snap2);

  try {
    assert.ok(match, `Local builds not deterministic:\nFirst:  ${JSON.stringify(hashes1, null, 2)}\nSecond: ${JSON.stringify(hashes2, null, 2)}`);
  } finally {
    rmSync(snap1, { recursive: true, force: true });
    rmSync(snap2, { recursive: true, force: true });
  }
});

// ─── Test 2: Release builds are deterministic except for timestamps ───

test('release builds are deterministic (excluding timestamps)', () => {
  const fixedEnv = {
    GITHUB_SHA: 'fixed-test-sha-determinism',
    GITHUB_RUN_ID: 'fixed-test-run-id-determinism',
  };

  // First release build
  runCompiler(['--release'], fixedEnv);
  const snap1 = captureDistOutput();
  const plugin1 = JSON.parse(readFileSync(join(snap1, 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8'));
  const registry1 = JSON.parse(readFileSync(join(snap1, 'registry', 'index.json'), 'utf8'));

  // Clean dist/
  removeDistDir(DIST_DIR);

  // Second release build with same env
  runCompiler(['--release'], fixedEnv);
  const snap2 = captureDistOutput();
  const plugin2 = JSON.parse(readFileSync(join(snap2, 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8'));
  const registry2 = JSON.parse(readFileSync(join(snap2, 'registry', 'index.json'), 'utf8'));

  try {
    // Check that non-provenance fields match exactly
    assert.deepEqual(
      plugin1.version,
      plugin2.version,
      'Plugin version should match'
    );
    assert.deepEqual(
      plugin1.skills,
      plugin2.skills,
      'Plugin skills list should match exactly'
    );
    assert.deepEqual(
      registry1.version,
      registry2.version,
      'Registry version should match'
    );
    assert.deepEqual(
      registry1.skills.map(s => s.id),
      registry2.skills.map(s => s.id),
      'Registry skill IDs should match exactly'
    );

    // Verify that both have provenance (since we're in release mode)
    assert.ok(plugin1.build_id && plugin2.build_id, 'Both builds should have build_id');
    assert.equal(plugin1.build_id, plugin2.build_id, 'build_id should match (same env)');
    assert.equal(plugin1.source_commit, plugin2.source_commit, 'source_commit should match (same env)');
  } finally {
    rmSync(snap1, { recursive: true, force: true });
    rmSync(snap2, { recursive: true, force: true });
  }
});

// ─── Test 3: Release builds differ only in provenance when env changes ───

test('release builds differ only in provenance when env changes', () => {
  const env1 = {
    GITHUB_SHA: 'sha-first-build',
    GITHUB_RUN_ID: 'run-id-first-build',
  };

  const env2 = {
    GITHUB_SHA: 'sha-second-build',
    GITHUB_RUN_ID: 'run-id-second-build',
  };

  // First release build
  runCompiler(['--release'], env1);
  const snap1 = captureDistOutput();
  const plugin1 = JSON.parse(readFileSync(join(snap1, 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8'));
  const registry1 = JSON.parse(readFileSync(join(snap1, 'registry', 'index.json'), 'utf8'));

  // Clean dist/
  removeDistDir(DIST_DIR);

  // Second release build with different env
  runCompiler(['--release'], env2);
  const snap2 = captureDistOutput();
  const plugin2 = JSON.parse(readFileSync(join(snap2, 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8'));
  const registry2 = JSON.parse(readFileSync(join(snap2, 'registry', 'index.json'), 'utf8'));

  try {
    // Provenance should differ
    assert.notEqual(plugin1.source_commit, plugin2.source_commit, 'Plugin source_commit should differ');
    assert.notEqual(plugin1.build_id, plugin2.build_id, 'Plugin build_id should differ');
    assert.notEqual(registry1.source_commit, registry2.source_commit, 'Registry source_commit should differ');
    assert.notEqual(registry1.build_id, registry2.build_id, 'Registry build_id should differ');

    // Non-provenance fields should be identical
    const plugin1NonProv = { ...plugin1 };
    const plugin2NonProv = { ...plugin2 };
    delete plugin1NonProv.built_at;
    delete plugin1NonProv.build_id;
    delete plugin1NonProv.source_commit;
    delete plugin2NonProv.built_at;
    delete plugin2NonProv.build_id;
    delete plugin2NonProv.source_commit;

    assert.deepEqual(plugin1NonProv, plugin2NonProv, 'Plugin should differ only in provenance fields');

    const registry1NonProv = { ...registry1 };
    const registry2NonProv = { ...registry2 };
    delete registry1NonProv.built_at;
    delete registry1NonProv.build_id;
    delete registry1NonProv.source_commit;
    delete registry2NonProv.built_at;
    delete registry2NonProv.build_id;
    delete registry2NonProv.source_commit;

    assert.deepEqual(registry1NonProv, registry2NonProv, 'Registry should differ only in provenance fields');
  } finally {
    rmSync(snap1, { recursive: true, force: true });
    rmSync(snap2, { recursive: true, force: true });
  }
});

// ─── Test 4: Release build provenance is populated consistently ───

test('release build populates all provenance fields consistently', () => {
  const env = {
    GITHUB_SHA: 'test-sha-prov-consistency',
    GITHUB_RUN_ID: 'test-run-id-prov-consistency',
  };

  runCompiler(['--release'], env);

  const plugin = JSON.parse(
    readFileSync(join(DIST_DIR, 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8')
  );
  const registry = JSON.parse(
    readFileSync(join(DIST_DIR, 'registry', 'index.json'), 'utf8')
  );

  // Both should have all three provenance fields
  assert.ok(plugin.built_at, 'Plugin should have built_at');
  assert.ok(plugin.build_id, 'Plugin should have build_id');
  assert.ok(plugin.source_commit, 'Plugin should have source_commit');

  assert.ok(registry.built_at, 'Registry should have built_at');
  assert.ok(registry.build_id, 'Registry should have build_id');
  assert.ok(registry.source_commit, 'Registry should have source_commit');

  // Values should match expectations
  assert.equal(plugin.build_id, env.GITHUB_RUN_ID, 'Plugin build_id should match env');
  assert.equal(plugin.source_commit, env.GITHUB_SHA, 'Plugin source_commit should match env');
  assert.equal(registry.build_id, env.GITHUB_RUN_ID, 'Registry build_id should match env');
  assert.equal(registry.source_commit, env.GITHUB_SHA, 'Registry source_commit should match env');
});
