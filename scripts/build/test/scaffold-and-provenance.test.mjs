/**
 * scaffold-and-provenance.test.mjs
 *
 * Tests that:
 * 1. new-skill.mjs does not mutate release-version mirrors (portable)
 * 2. new-skill.mjs creates symlinks on Unix (Unix-only)
 * 3. Version parity holds after scaffolding
 * 4. Release-mode provenance is consistent across all emitted artefacts
 * 5. Local-mode builds have no provenance in any emitted artefact
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
const NEW_SKILL_MJS = resolve(__dirname, '..', 'new-skill.mjs');
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

  // Copy the lint script and its dependencies so post-scaffold lint works
  const lintDir = join(tmp, 'scripts', 'lint');
  mkdirSync(lintDir, { recursive: true });
  if (existsSync(join(REPO_ROOT, 'scripts', 'lint', 'skill.mjs'))) {
    copyFileSync(join(REPO_ROOT, 'scripts', 'lint', 'skill.mjs'), join(lintDir, 'skill.mjs'));
  }

  // Copy schemas needed by linter
  const schemasDir = join(tmp, 'schemas');
  mkdirSync(schemasDir, { recursive: true });
  if (existsSync(join(REPO_ROOT, 'schemas', 'skill.schema.json'))) {
    copyFileSync(join(REPO_ROOT, 'schemas', 'skill.schema.json'), join(schemasDir, 'skill.schema.json'));
  }

  // Copy build lib needed by linter
  const buildLibDir = join(tmp, 'scripts', 'build', 'lib');
  mkdirSync(buildLibDir, { recursive: true });
  if (existsSync(join(REPO_ROOT, 'scripts', 'build', 'lib', 'validate-skill-policy.mjs'))) {
    copyFileSync(
      join(REPO_ROOT, 'scripts', 'build', 'lib', 'validate-skill-policy.mjs'),
      join(buildLibDir, 'validate-skill-policy.mjs')
    );
  }

  // Copy platform targets needed by linter
  const platformsDir = join(tmp, 'shared', 'targets', 'platforms');
  mkdirSync(platformsDir, { recursive: true });

  // Create a minimal manifest.md
  const manifestContent = `# Manifest\n\n## Skills\n\n| Skill | Description | Path |\n|---|---|---|\n\n## Plugins\n`;
  writeFileSync(join(tmp, 'shared', 'manifest.md'), manifestContent);

  // Initial commit so git works properly
  spawnSync('git', ['add', '.'], { cwd: tmp });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp });

  return tmp;
}

// Historical names that must never appear under canonical shared/skills/ (leaked from old tests
// when new-skill resolved the wrong repo root). Temp fixtures use z-fixture-* names below instead.
const LEAKED_SCAFFOLD_NAMES_FORBIDDEN_IN_CANONICAL_REPO = [
  'test-scaffold-skill',
  'test-portable-skill',
  'test-link-skill',
  'test-dup-skill',
  'test-version-skill',
];

const FIXTURE_SCAFFOLD_A = 'z-fixture-scaffold-probe';
const FIXTURE_SCAFFOLD_B = 'z-fixture-portable-probe';
const FIXTURE_SCAFFOLD_C = 'z-fixture-link-probe';
const FIXTURE_SCAFFOLD_D = 'z-fixture-dup-probe';
const FIXTURE_SCAFFOLD_E = 'z-fixture-version-probe';

test('canonical repo must not list or host leaked scaffold test skills', () => {
  const manifestPath = join(REPO_ROOT, 'shared', 'manifest.md');
  const manifest = readFileSync(manifestPath, 'utf8');
  for (const name of LEAKED_SCAFFOLD_NAMES_FORBIDDEN_IN_CANONICAL_REPO) {
    const dir = join(REPO_ROOT, 'shared', 'skills', name);
    assert.ok(
      !existsSync(dir),
      `${name} must not exist under shared/skills (scaffold tests use isolated temp repos only)`
    );
    const manifestRowMarker = `| \`${name}\` |`;
    assert.ok(
      !manifest.includes(manifestRowMarker),
      `shared/manifest.md must not list ${name} (scaffold fixture names are not installable skills)`
    );
  }
});

// ─── 1. Portable: scaffold does not mutate release-version mirrors ───

test('new-skill.mjs does not change VERSION, package.json, or plugin.json', () => {
  const fixture = createScaffoldFixture();

  try {
    const versionBefore = readFileSync(join(fixture, 'VERSION'), 'utf8');
    const pkgBefore = readFileSync(join(fixture, 'package.json'), 'utf8');
    const pluginBefore = readFileSync(
      join(fixture, 'plugins', 'core-skills', '.claude-plugin', 'plugin.json'), 'utf8'
    );

    // Run new-skill.mjs with --no-link for portable test
    const result = spawnSync(process.execPath, [NEW_SKILL_MJS, FIXTURE_SCAFFOLD_A, '--no-link'], {
      cwd: fixture,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `new-skill.mjs failed:\n${result.stdout}\n${result.stderr}`);

    // Verify scaffold artefacts were created
    const skillDir = join(fixture, 'shared', 'skills', FIXTURE_SCAFFOLD_A);
    assert.ok(existsSync(skillDir), 'Skill directory should exist');
    assert.ok(existsSync(join(skillDir, 'SKILL.md')), 'SKILL.md should exist');

    // Verify template expansion worked
    const skillContent = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
    assert.ok(skillContent.includes(`skill: ${FIXTURE_SCAFFOLD_A}`), 'SKILL.md should have skill name in frontmatter');
    assert.ok(!skillContent.includes('{{SKILL_NAME}}'), 'Template placeholders should be replaced');

    // Assert manifest was updated
    const manifest = readFileSync(join(fixture, 'shared', 'manifest.md'), 'utf8');
    assert.ok(manifest.includes(FIXTURE_SCAFFOLD_A), 'Manifest should contain skill name');

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

// ─── 2. Portable mode: scaffold works without creating symlinks ───

test('new-skill.mjs --no-link creates skill without symlinks (portable)', () => {
  const fixture = createScaffoldFixture();

  try {
    const result = spawnSync(process.execPath, [NEW_SKILL_MJS, FIXTURE_SCAFFOLD_B, '--no-link'], {
      cwd: fixture,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `new-skill.mjs failed:\n${result.stdout}\n${result.stderr}`);

    // Verify skill was created in shared/skills/
    const skillDir = join(fixture, 'shared', 'skills', FIXTURE_SCAFFOLD_B);
    assert.ok(existsSync(skillDir), 'Skill directory should exist in shared/skills/');
    assert.ok(existsSync(join(skillDir, 'SKILL.md')), 'SKILL.md should exist');

    // Verify NO symlink was created in plugins/ (portable mode)
    const symlinkPath = join(fixture, 'plugins', 'core-skills', 'skills', FIXTURE_SCAFFOLD_B);
    assert.ok(!existsSync(symlinkPath), 'Symlink must NOT exist when --no-link is used');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ─── 2b. Unix-only: scaffold creates symlink (optional convenience) ───

test('new-skill.mjs creates symlink on Unix (optional)', { skip: process.platform === 'win32' ? 'symlinks need Unix' : false }, () => {
  const fixture = createScaffoldFixture();

  try {
    const result = spawnSync(process.execPath, [NEW_SKILL_MJS, FIXTURE_SCAFFOLD_C], {
      cwd: fixture,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `new-skill.mjs failed:\n${result.stdout}\n${result.stderr}`);

    // Verify symlink was created
    const symlinkPath = join(fixture, 'plugins', 'core-skills', 'skills', FIXTURE_SCAFFOLD_C);
    assert.ok(existsSync(symlinkPath), 'Symlink should exist');
    assert.ok(lstatSync(symlinkPath).isSymbolicLink(), 'Should be a symlink');

    // Verify symlink target resolves to the canonical source
    const skillDir = join(fixture, 'shared', 'skills', FIXTURE_SCAFFOLD_C);
    assert.ok(existsSync(join(symlinkPath, 'SKILL.md')), 'Symlink should resolve to skill with SKILL.md');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ─── 3. Scaffold rejects invalid skill names ───

test('new-skill.mjs rejects invalid skill names', () => {
  const fixture = createScaffoldFixture();

  try {
    const invalidNames = ['My Skill', 'UPPERCASE', 'has.dots', '123-starts-with-digit', 'has_underscores'];
    for (const name of invalidNames) {
      const result = spawnSync(process.execPath, [NEW_SKILL_MJS, name, '--no-link'], {
        cwd: fixture,
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, `Should reject invalid name: '${name}'`);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ─── 4. Scaffold rejects duplicate skill names ───

test('new-skill.mjs rejects duplicate skill name', () => {
  const fixture = createScaffoldFixture();

  try {
    // First scaffold succeeds
    const result1 = spawnSync(process.execPath, [NEW_SKILL_MJS, FIXTURE_SCAFFOLD_D, '--no-link'], {
      cwd: fixture,
      encoding: 'utf8',
    });
    assert.equal(result1.status, 0, 'First scaffold should succeed');

    // Second scaffold with same name fails
    const result2 = spawnSync(process.execPath, [NEW_SKILL_MJS, FIXTURE_SCAFFOLD_D, '--no-link'], {
      cwd: fixture,
      encoding: 'utf8',
    });
    assert.notEqual(result2.status, 0, 'Duplicate scaffold should fail');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ─── 4b. Scaffold does not bump VERSION file ───

test('new-skill.mjs does not change VERSION (version invariance)', () => {
  const fixture = createScaffoldFixture();

  try {
    const versionBefore = readFileSync(join(fixture, 'VERSION'), 'utf8').trim();

    const result = spawnSync(process.execPath, [NEW_SKILL_MJS, FIXTURE_SCAFFOLD_E, '--no-link'], {
      cwd: fixture,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, 'Scaffold should succeed');

    const versionAfter = readFileSync(join(fixture, 'VERSION'), 'utf8').trim();
    assert.equal(
      versionAfter,
      versionBefore,
      'VERSION file must not change during scaffold (version bump is separate)'
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ─── 5. Version parity holds in real repo (unaffected by scaffold) ───

test('version parity check passes', () => {
  const result = spawnSync(process.execPath, [CHECK_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Parity check failed:\n${result.stdout}\n${result.stderr}`);
});

// ─── 6. Release-mode provenance is consistent across ALL emitted artefacts ───

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

// ─── 7. Local build has NO provenance in any emitted artefact ───

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
