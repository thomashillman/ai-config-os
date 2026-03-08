/**
 * scaffold-and-provenance.test.mjs
 *
 * Tests that:
 * 1. ops/new-skill.sh does not mutate release-version mirrors
 * 2. Version parity holds after scaffolding
 * 3. Release-mode provenance is consistent across all emitted artefacts
 * 4. Local-mode builds have no provenance in any emitted artefact
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, writeFileSync, readFileSync, mkdirSync,
  existsSync, lstatSync, rmSync, copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const NEW_SKILL_SH = join(REPO_ROOT, 'ops', 'new-skill.sh');
const COMPILE_MJS = resolve(__dirname, '..', 'compile.mjs');
const CHECK_MJS = resolve(__dirname, '..', 'check-version-parity.mjs');

import { readReleaseVersion } from '../lib/versioning.mjs';

// ─── Helper: create a minimal git repo fixture for scaffold tests ───

function createScaffoldFixture() {
  const tmp = mkdtempSync(join(tmpdir(), 'scaffold-test-'));

  // Init a git repo so git rev-parse --show-toplevel works
  spawnSync('git', ['init', '-b', 'main'], { cwd: tmp });
  spawnSync('git', ['config', 'user.email', 'test@test'], { cwd: tmp });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tmp });

  // Copy the real VERSION, package.json, and plugin.json
  copyFileSync(join(REPO_ROOT, 'VERSION'), join(tmp, 'VERSION'));
  copyFileSync(join(REPO_ROOT, 'package.json'), join(tmp, 'package.json'));

  const pluginJsonDir = join(tmp, 'plugins', 'core-skills', '.claude-plugin');
  mkdirSync(pluginJsonDir, { recursive: true });
  copyFileSync(
    join(REPO_ROOT, 'plugins', 'core-skills', '.claude-plugin', 'plugin.json'),
    join(pluginJsonDir, 'plugin.json')
  );

  // Create shared/skills/_template/SKILL.md
  const templateDir = join(tmp, 'shared', 'skills', '_template');
  mkdirSync(templateDir, { recursive: true });
  copyFileSync(
    join(REPO_ROOT, 'shared', 'skills', '_template', 'SKILL.md'),
    join(templateDir, 'SKILL.md')
  );

  // Create plugins/core-skills/skills/ directory
  mkdirSync(join(tmp, 'plugins', 'core-skills', 'skills'), { recursive: true });

  // Create a minimal manifest.md
  const manifestContent = `# Manifest\n\n## Skills\n\n| Skill | Description | Path |\n|---|---|---|\n\n## Plugins\n`;
  writeFileSync(join(tmp, 'shared', 'manifest.md'), manifestContent);

  // Initial commit so git works properly
  spawnSync('git', ['add', '.'], { cwd: tmp });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp });

  return tmp;
}

// ─── 1. ops/new-skill.sh must not mutate release-version mirrors ───

test('ops/new-skill.sh does not change VERSION, package.json, or plugin.json', () => {
  const fixture = createScaffoldFixture();

  try {
    const versionBefore = readFileSync(join(fixture, 'VERSION'), 'utf8');
    const pkgBefore = readFileSync(join(fixture, 'package.json'), 'utf8');
    const pluginBefore = readFileSync(
      join(fixture, 'plugins', 'core-skills', '.claude-plugin', 'plugin.json'), 'utf8'
    );

    // Run new-skill.sh from the real repo against the fixture
    const result = spawnSync('bash', [NEW_SKILL_SH, 'test-scaffold-skill'], {
      cwd: fixture,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `new-skill.sh failed:\n${result.stdout}\n${result.stderr}`);

    // Verify scaffold artefacts were created
    const skillDir = join(fixture, 'shared', 'skills', 'test-scaffold-skill');
    assert.ok(existsSync(skillDir), 'Skill directory should exist');
    assert.ok(existsSync(join(skillDir, 'SKILL.md')), 'SKILL.md should exist');

    const symlinkPath = join(fixture, 'plugins', 'core-skills', 'skills', 'test-scaffold-skill');
    assert.ok(existsSync(symlinkPath), 'Symlink should exist');
    assert.ok(lstatSync(symlinkPath).isSymbolicLink(), 'Should be a symlink');

    // Assert manifest was updated
    const manifest = readFileSync(join(fixture, 'shared', 'manifest.md'), 'utf8');
    assert.ok(manifest.includes('test-scaffold-skill'), 'Manifest should contain skill name');

    // Assert version files are unchanged
    const versionAfter = readFileSync(join(fixture, 'VERSION'), 'utf8');
    const pkgAfter = readFileSync(join(fixture, 'package.json'), 'utf8');
    const pluginAfter = readFileSync(
      join(fixture, 'plugins', 'core-skills', '.claude-plugin', 'plugin.json'), 'utf8'
    );

    assert.equal(versionAfter, versionBefore, 'VERSION must not change');
    assert.equal(pkgAfter, pkgBefore, 'package.json must not change');
    assert.equal(pluginAfter, pluginBefore, 'plugin.json must not change');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ─── 2. Version parity holds in real repo (unaffected by scaffold) ───

test('version parity check passes', () => {
  const result = spawnSync(process.execPath, [CHECK_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Parity check failed:\n${result.stdout}\n${result.stderr}`);
});

// ─── 3. Release-mode provenance is consistent across ALL emitted artefacts ───

test('release build has consistent provenance in claude-code, registry, and cursor', () => {
  const result = spawnSync(process.execPath, [COMPILE_MJS, '--release'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_SHA: 'prov-test-sha', GITHUB_RUN_ID: 'prov-test-run' },
  });
  assert.equal(result.status, 0, `Compiler failed:\n${result.stderr}`);

  const expectedVersion = readReleaseVersion(REPO_ROOT);

  // Claude Code plugin.json
  const pluginJson = JSON.parse(
    readFileSync(join(REPO_ROOT, 'dist', 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.equal(pluginJson.version, expectedVersion);
  assert.ok(pluginJson.built_at, 'claude-code: built_at required');
  assert.equal(pluginJson.build_id, 'prov-test-run', 'claude-code: build_id');
  assert.equal(pluginJson.source_commit, 'prov-test-sha', 'claude-code: source_commit');

  // Registry index.json
  const registryJson = JSON.parse(
    readFileSync(join(REPO_ROOT, 'dist', 'registry', 'index.json'), 'utf8')
  );
  assert.equal(registryJson.version, expectedVersion);
  assert.ok(registryJson.built_at, 'registry: built_at required');
  assert.equal(registryJson.build_id, 'prov-test-run', 'registry: build_id');
  assert.equal(registryJson.source_commit, 'prov-test-sha', 'registry: source_commit');

  // Cursor .cursorrules (MUST exist)
  const cursorPath = join(REPO_ROOT, 'dist', 'clients', 'cursor', '.cursorrules');
  assert.ok(existsSync(cursorPath), 'Cursor .cursorrules MUST be emitted in release mode');
  const cursorContent = readFileSync(cursorPath, 'utf8');
  assert.ok(cursorContent.includes(`# Version: ${expectedVersion}`), 'cursor: version header');
  assert.ok(cursorContent.includes('# Built:'), 'cursor: Built line required');
  assert.ok(cursorContent.includes('# Build ID: prov-test-run'), 'cursor: Build ID line');
  assert.ok(cursorContent.includes('# Source Commit: prov-test-sha'), 'cursor: Source Commit line');
});

// ─── 4. Local build has NO provenance in any emitted artefact ───

test('local build has no provenance in claude-code, registry, or cursor', () => {
  const result = spawnSync(process.execPath, [COMPILE_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Compiler failed:\n${result.stderr}`);

  // Claude Code plugin.json
  const pluginJson = JSON.parse(
    readFileSync(join(REPO_ROOT, 'dist', 'clients', 'claude-code', '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.equal(pluginJson.built_at, undefined, 'claude-code: no built_at in local');
  assert.equal(pluginJson.build_id, undefined, 'claude-code: no build_id in local');
  assert.equal(pluginJson.source_commit, undefined, 'claude-code: no source_commit in local');

  // Registry index.json
  const registryJson = JSON.parse(
    readFileSync(join(REPO_ROOT, 'dist', 'registry', 'index.json'), 'utf8')
  );
  assert.equal(registryJson.built_at, undefined, 'registry: no built_at in local');
  assert.equal(registryJson.build_id, undefined, 'registry: no build_id in local');
  assert.equal(registryJson.source_commit, undefined, 'registry: no source_commit in local');

  // Cursor .cursorrules (MUST exist)
  const cursorPath = join(REPO_ROOT, 'dist', 'clients', 'cursor', '.cursorrules');
  assert.ok(existsSync(cursorPath), 'Cursor .cursorrules MUST be emitted in local mode');
  const cursorContent = readFileSync(cursorPath, 'utf8');
  assert.ok(!cursorContent.includes('# Built:'), 'cursor: no Built line in local');
  assert.ok(!cursorContent.includes('# Build ID:'), 'cursor: no Build ID line in local');
  assert.ok(!cursorContent.includes('# Source Commit:'), 'cursor: no Source Commit line in local');
});
