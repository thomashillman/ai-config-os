import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBashCommand } from './shell-test-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const MATERIALISE_SCRIPT = join(REPO_ROOT, 'adapters', 'claude', 'materialise.sh');
const BASH_COMMAND = resolveBashCommand();
const SHELL_TEST_OPTIONS = BASH_COMMAND
  ? {}
  : { skip: 'bash is unavailable for shell integration tests' };

function toPosixPath(path) {
  return path.replace(/\\/g, '/');
}

function runBash(scriptPath, { cwd, env = {}, args = [] } = {}) {
  if (!BASH_COMMAND) {
    throw new Error('bash is unavailable for shell integration tests');
  }

  return spawnSync(BASH_COMMAND, [toPosixPath(scriptPath), ...args.map(toPosixPath)], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('materialise.sh install command', () => {
  test('install command requires a cached version file', SHELL_TEST_OPTIONS, () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'materialise-install-'));
    const tmpProject = mkdtempSync(join(tmpdir(), 'materialise-project-'));

    try {
      // Create minimal project structure (git repo)
      spawnSync('git', ['init', '-b', 'main'], { cwd: tmpProject, encoding: 'utf8' });

      const result = runBash(MATERIALISE_SCRIPT, {
        cwd: tmpProject,
        env: { HOME: tmpHome },
        args: ['install'],
      });

      assert.notEqual(result.status, 0, 'install should fail when no cached version exists');
      assert.ok(
        result.stderr.includes('No cached version found'),
        'install should error with helpful message about missing cache'
      );
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test('install copies skills from cache to ~/.claude/skills', SHELL_TEST_OPTIONS, () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'materialise-install-'));
    const tmpProject = mkdtempSync(join(tmpdir(), 'materialise-project-'));
    const cacheDir = join(tmpHome, '.ai-config-os', 'cache', 'claude-code');

    try {
      // Setup: git repo
      spawnSync('git', ['init', '-b', 'main'], { cwd: tmpProject, encoding: 'utf8' });

      // Setup: Create mock cached skills (materialise-client extracts to skills/ subdir)
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'latest.version'), '1.0.0');

      // Create two mock skill directories under skills/ (matches materialise-client output)
      mkdirSync(join(cacheDir, 'skills', 'skill-a'), { recursive: true });
      writeFileSync(join(cacheDir, 'skills', 'skill-a', 'SKILL.md'), '# Skill A');

      mkdirSync(join(cacheDir, 'skills', 'skill-b'), { recursive: true });
      writeFileSync(join(cacheDir, 'skills', 'skill-b', 'SKILL.md'), '# Skill B');

      // Run install
      const result = runBash(MATERIALISE_SCRIPT, {
        cwd: tmpProject,
        env: { HOME: tmpHome },
        args: ['install'],
      });

      assert.equal(result.status, 0, `install failed:\n${result.stdout}\n${result.stderr}`);

      // Verify skills were copied
      const skillsDir = join(tmpHome, '.claude', 'skills');
      assert.ok(existsSync(join(skillsDir, 'skill-a', 'SKILL.md')), 'skill-a should be installed');
      assert.ok(existsSync(join(skillsDir, 'skill-b', 'SKILL.md')), 'skill-b should be installed');

      // Verify version marker was written
      assert.ok(existsSync(join(skillsDir, '.version')), 'version marker should exist');
      assert.equal(
        readFileSync(join(skillsDir, '.version'), 'utf8'),
        '1.0.0',
        'version marker should contain the version from cache'
      );
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test('install is idempotent (no-op when version matches)', SHELL_TEST_OPTIONS, () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'materialise-install-'));
    const tmpProject = mkdtempSync(join(tmpdir(), 'materialise-project-'));
    const cacheDir = join(tmpHome, '.ai-config-os', 'cache', 'claude-code');
    const skillsDir = join(tmpHome, '.claude', 'skills');

    try {
      // Setup: git repo
      spawnSync('git', ['init', '-b', 'main'], { cwd: tmpProject, encoding: 'utf8' });

      // Setup: Create cached version and skills (under skills/ subdir)
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'latest.version'), '1.0.0');
      mkdirSync(join(cacheDir, 'skills', 'skill-a'), { recursive: true });
      writeFileSync(join(cacheDir, 'skills', 'skill-a', 'SKILL.md'), '# Skill A');

      // First run: install
      let result = runBash(MATERIALISE_SCRIPT, {
        cwd: tmpProject,
        env: { HOME: tmpHome },
        args: ['install'],
      });
      assert.equal(result.status, 0, 'first install should succeed');

      // Record timestamp of first install
      const firstInstallTime = statSync(join(skillsDir, 'skill-a')).mtimeMs;

      // Wait a bit to ensure timestamp would change on second run (optional for idempotency test)

      // Second run: install again (should be no-op)
      result = runBash(MATERIALISE_SCRIPT, {
        cwd: tmpProject,
        env: { HOME: tmpHome },
        args: ['install'],
      });

      assert.equal(result.status, 0, 'second install should succeed');
      assert.ok(
        result.stdout.includes('already up to date'),
        'second install should report no changes needed'
      );

      // Verify files still exist and have same structure
      assert.ok(existsSync(join(skillsDir, 'skill-a', 'SKILL.md')), 'skill should still exist');
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test('install updates when version changes', SHELL_TEST_OPTIONS, () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'materialise-install-'));
    const tmpProject = mkdtempSync(join(tmpdir(), 'materialise-project-'));
    const cacheDir = join(tmpHome, '.ai-config-os', 'cache', 'claude-code');
    const skillsDir = join(tmpHome, '.claude', 'skills');

    try {
      // Setup: git repo
      spawnSync('git', ['init', '-b', 'main'], { cwd: tmpProject, encoding: 'utf8' });

      // First version: v1.0.0 (skills under skills/ subdir)
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'latest.version'), '1.0.0');
      mkdirSync(join(cacheDir, 'skills', 'skill-a'), { recursive: true });
      writeFileSync(join(cacheDir, 'skills', 'skill-a', 'SKILL.md'), '# Skill A v1');

      // First install
      let result = runBash(MATERIALISE_SCRIPT, {
        cwd: tmpProject,
        env: { HOME: tmpHome },
        args: ['install'],
      });
      assert.equal(result.status, 0, 'first install should succeed');
      assert.equal(
        readFileSync(join(skillsDir, 'skill-a', 'SKILL.md'), 'utf8'),
        '# Skill A v1'
      );

      // Update version and skill content
      writeFileSync(join(cacheDir, 'latest.version'), '1.1.0');
      writeFileSync(join(cacheDir, 'skills', 'skill-a', 'SKILL.md'), '# Skill A v2 (updated)');

      // Second install with new version
      result = runBash(MATERIALISE_SCRIPT, {
        cwd: tmpProject,
        env: { HOME: tmpHome },
        args: ['install'],
      });
      assert.equal(result.status, 0, 'install with new version should succeed');

      // Verify skill was updated
      assert.equal(
        readFileSync(join(skillsDir, 'skill-a', 'SKILL.md'), 'utf8'),
        '# Skill A v2 (updated)'
      );
      assert.equal(
        readFileSync(join(skillsDir, '.version'), 'utf8'),
        '1.1.0',
        'version marker should be updated'
      );
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });
});
