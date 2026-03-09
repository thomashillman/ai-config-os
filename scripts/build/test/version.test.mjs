/**
 * version.test.mjs
 *
 * Tests for the versioning system:
 * 1. VERSION file reading and validation
 * 2. Local build mode (no provenance)
 * 3. Release mode (with provenance)
 * 4. Malformed VERSION rejection
 * 5. Sync script correctness
 * 6. Version parity check
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  readReleaseVersion,
  validateReleaseVersion,
  getBuildProvenance,
  assertVersionParity,
} from '../lib/versioning.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILE_MJS = resolve(__dirname, '..', 'compile.mjs');
const SYNC_MJS = resolve(__dirname, '..', 'sync-release-version.mjs');
const CHECK_MJS = resolve(__dirname, '..', 'check-version-parity.mjs');

// --- Unit tests for versioning.mjs ---

test('readReleaseVersion reads VERSION file', () => {
  const version = readReleaseVersion(REPO_ROOT);
  assert.ok(version.length > 0, 'VERSION should not be empty');
  assert.ok(/^\d+\.\d+\.\d+$/.test(version), `Expected semver, got "${version}"`);
});

test('validateReleaseVersion accepts valid semver', () => {
  assert.equal(validateReleaseVersion('0.5.4'), '0.5.4');
  assert.equal(validateReleaseVersion('1.0.0'), '1.0.0');
  assert.equal(validateReleaseVersion('12.34.56'), '12.34.56');
});

test('validateReleaseVersion rejects invalid versions', () => {
  assert.throws(() => validateReleaseVersion('1.0'), /Invalid release version/);
  assert.throws(() => validateReleaseVersion('1.0.0-beta'), /Invalid release version/);
  assert.throws(() => validateReleaseVersion('v1.0.0'), /Invalid release version/);
  assert.throws(() => validateReleaseVersion(''), /Invalid release version/);
  assert.throws(() => validateReleaseVersion('abc'), /Invalid release version/);
});

test('getBuildProvenance returns null when not in release mode', () => {
  const result = getBuildProvenance({ releaseMode: false });
  assert.equal(result, null);
});

test('getBuildProvenance returns provenance in release mode', () => {
  const result = getBuildProvenance({
    releaseMode: true,
    env: { GITHUB_SHA: 'abc123', GITHUB_RUN_ID: '42' },
  });
  assert.ok(result.builtAt);
  assert.equal(result.buildId, '42');
  assert.equal(result.sourceCommit, 'abc123');
});

test('assertVersionParity passes on match', () => {
  assertVersionParity('1.0.0', '1.0.0', 'test-file');
});

test('assertVersionParity fails on mismatch', () => {
  assert.throws(
    () => assertVersionParity('1.0.0', '2.0.0', 'test-file'),
    /Version mismatch in test-file/
  );
});

// --- Case 1: Local build (no provenance) ---

test('local build emits release version without provenance', () => {
  const result = spawnSync(process.execPath, [COMPILE_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Compiler failed:\n${result.stderr}`);

  const pluginJson = JSON.parse(
    readFileSync(join(REPO_ROOT, 'dist', 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8')
  );
  const expectedVersion = readReleaseVersion(REPO_ROOT);
  assert.equal(pluginJson.version, expectedVersion, 'Emitted version should match VERSION');
  assert.equal(pluginJson.built_at, undefined, 'Local build should not have built_at');
  assert.equal(pluginJson.build_id, undefined, 'Local build should not have build_id');
  assert.equal(pluginJson.source_commit, undefined, 'Local build should not have source_commit');

  const registryJson = JSON.parse(
    readFileSync(join(REPO_ROOT, 'dist', 'registry', 'index.json'), 'utf8')
  );
  assert.equal(registryJson.version, expectedVersion, 'Registry version should match VERSION');
  assert.equal(registryJson.built_at, undefined, 'Registry local build should not have built_at');
});

// --- Case 2: Release mode (with provenance) ---

test('release build emits provenance fields', () => {
  const result = spawnSync(process.execPath, [COMPILE_MJS, '--release'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_SHA: 'test-sha-123', GITHUB_RUN_ID: 'run-456' },
  });
  assert.equal(result.status, 0, `Compiler failed:\n${result.stderr}`);

  const pluginJson = JSON.parse(
    readFileSync(join(REPO_ROOT, 'dist', 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8')
  );
  const expectedVersion = readReleaseVersion(REPO_ROOT);
  assert.equal(pluginJson.version, expectedVersion, 'Release version should still match VERSION');
  assert.ok(pluginJson.built_at, 'Release build should have built_at');
  assert.equal(pluginJson.build_id, 'run-456', 'Release build should have build_id from env');
  assert.equal(pluginJson.source_commit, 'test-sha-123', 'Release build should have source_commit from env');
});

// --- Case 3: Malformed VERSION ---

test('compiler fails on malformed VERSION', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'version-test-'));
  writeFileSync(join(tmp, 'VERSION'), 'not-a-version\n');
  // We can't run the full compiler against a temp dir (it needs full repo structure),
  // so test the validation function directly
  assert.throws(
    () => validateReleaseVersion(readReleaseVersion(tmp)),
    /Invalid release version/
  );
  rmSync(tmp, { recursive: true });
});

// --- Case 4: Sync script ---

test('sync script updates package.json and plugin.json to match VERSION', () => {
  // First, run the sync script
  const result = spawnSync(process.execPath, [SYNC_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Sync script failed:\n${result.stderr}`);

  const expectedVersion = readReleaseVersion(REPO_ROOT);

  const pkgJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkgJson.version, expectedVersion, 'package.json should match VERSION');

  const pluginJson = JSON.parse(
    readFileSync(join(REPO_ROOT, 'plugins', 'core-skills', '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.equal(pluginJson.version, expectedVersion, 'plugin.json should match VERSION');
});

// --- Case 5: Version parity check ---

test('version parity check passes when files are in sync', () => {
  const result = spawnSync(process.execPath, [CHECK_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Parity check failed:\n${result.stdout}\n${result.stderr}`);
  assert.ok(result.stdout.includes('parity check passed'), 'Should report success');
});

// --- Case 6: Runtime version helper ---

test('getReleaseVersion returns same value as readReleaseVersion', async () => {
  const { getReleaseVersion } = await import('../../../runtime/lib/release-version.mjs');
  const expected = readReleaseVersion(REPO_ROOT);
  assert.equal(getReleaseVersion(), expected, 'getReleaseVersion() must match readReleaseVersion()');
});

test('server.js does not hardcode a version string', () => {
  const serverSrc = readFileSync(join(REPO_ROOT, 'runtime', 'mcp', 'server.js'), 'utf8');
  assert.ok(
    serverSrc.includes('getReleaseVersion()'),
    'server.js must call getReleaseVersion() dynamically'
  );
  assert.ok(
    !/version:\s*["']\d+\.\d+\.\d+["']/.test(serverSrc),
    'server.js must not contain a hardcoded semver version string'
  );
});

// --- Slice 1: Runtime version validation ---

test('getReleaseVersionFromRoot rejects invalid semver in VERSION', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'version-root-'));
  try {
    writeFileSync(join(tmp, 'VERSION'), 'not-semver\n');
    const { getReleaseVersionFromRoot } = await import('../../../runtime/lib/release-version.mjs');

    assert.throws(
      () => getReleaseVersionFromRoot(tmp),
      /Invalid release version/,
      'runtime helper must validate VERSION with same rules as build path'
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('getReleaseVersionFromRoot rejects various malformed versions', async () => {
  const { getReleaseVersionFromRoot } = await import('../../../runtime/lib/release-version.mjs');
  const testCases = ['1.0', 'v1.0.0', '1.0.0-beta', '', 'abc'];

  for (const malformed of testCases) {
    const tmp = mkdtempSync(join(tmpdir(), 'version-root-'));
    try {
      writeFileSync(join(tmp, 'VERSION'), `${malformed}\n`);
      assert.throws(
        () => getReleaseVersionFromRoot(tmp),
        /Invalid release version/,
        `Should reject "${malformed}"`
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test('getReleaseVersion matches build validation and returns validated semver', async () => {
  const { getReleaseVersion } = await import('../../../runtime/lib/release-version.mjs');
  const expected = validateReleaseVersion(readReleaseVersion(REPO_ROOT));
  assert.equal(getReleaseVersion(), expected);
});
