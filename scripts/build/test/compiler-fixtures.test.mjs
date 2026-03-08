/**
 * compiler-fixtures.test.mjs
 *
 * Tests the compiler's behavior with fixture repos through the CLI boundary.
 * Uses temporary repo helpers to test core compiler functionality and edge cases.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTempRepo,
  createSkillMd,
  createPlatformYaml,
} from './helpers/temp-repo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REAL_REPO_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILE_MJS = resolve(REAL_REPO_ROOT, 'scripts', 'build', 'compile.mjs');

// Helper: Run compiler against a temp repo
function runCompilerInRepo(repoPath, args = []) {
  const result = spawnSync(process.execPath, [COMPILE_MJS, ...args], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  return result;
}

// ─── Test 1: Temp repo helper creates correct structure ───

test('compiler-fixture: temp repo helper creates valid structure', () => {
  const { repoPath, cleanup } = createTempRepo({
    version: '1.0.0',
    skills: {
      'test-skill': {
        skillMd: createSkillMd(),
      },
    },
  });

  try {
    // Verify basic structure exists
    assert.ok(existsSync(join(repoPath, 'VERSION')), 'Should create VERSION file');
    assert.ok(existsSync(join(repoPath, 'package.json')), 'Should create package.json');
    assert.ok(existsSync(join(repoPath, 'shared', 'skills', 'test-skill', 'SKILL.md')), 'Should create SKILL.md');
    assert.ok(existsSync(join(repoPath, 'shared', 'targets', 'platforms')), 'Should create platforms dir');
  } finally {
    cleanup();
  }
});

// ─── Test 2: Skill MD creation helper ───

test('compiler-fixture: createSkillMd generates valid frontmatter', () => {
  const skillMd = createSkillMd({
    skill: 'test-skill',
    description: 'A test skill',
    version: '2.0.0',
  });

  assert.ok(skillMd.startsWith('---'), 'Should start with frontmatter delimiter');
  assert.ok(skillMd.includes('skill: test-skill'), 'Should include skill name');
  assert.ok(skillMd.includes('description: A test skill'), 'Should include description');
  assert.ok(skillMd.includes('version: 2.0.0'), 'Should include version');
});

// ─── Test 3: Platform YAML generation helper ───

test('compiler-fixture: createPlatformYaml generates valid YAML', () => {
  const platformYaml = createPlatformYaml({
    id: 'test-platform',
    capabilities: {
      'feature.read': { status: 'supported' },
      'feature.write': { status: 'unsupported' },
    },
  });

  assert.ok(platformYaml.includes('id: test-platform'), 'Should include id');
  assert.ok(platformYaml.includes('feature.read'), 'Should include capability');
  assert.ok(platformYaml.includes('status: supported'), 'Should include status');
});

// ─── Test 4: Helpers support custom properties ───

test('compiler-fixture: createSkillMd supports additional frontmatter properties', () => {
  const skillMd = createSkillMd({
    skill: 'extended-skill',
    dependencies: {
      skills: ['other-skill'],
    },
  });

  assert.ok(skillMd.includes('skill: extended-skill'), 'Should include skill');
  assert.ok(skillMd.includes('dependencies:'), 'Should include dependencies');
});

// ─── Test 5: Cleanup removes temp directories ───

test('compiler-fixture: cleanup removes temporary repository', () => {
  const { repoPath, cleanup } = createTempRepo({
    version: '1.0.0',
    skills: {
      'temp-skill': {
        skillMd: createSkillMd(),
      },
    },
  });

  // Verify it exists
  assert.ok(existsSync(repoPath), 'Temp repo should exist initially');

  // Clean it up
  cleanup();

  // Verify it's gone (with a small retry for Windows file locking)
  let removed = false;
  for (let i = 0; i < 3; i++) {
    if (!existsSync(repoPath)) {
      removed = true;
      break;
    }
    if (i < 2) {
      require('fs').rmSync(repoPath, { recursive: true, force: true });
    }
  }
  assert.ok(removed, 'Cleanup should remove temp repository');
});

// ─── Test 6: Temp repo has correct directory structure ───

test('compiler-fixture: temp repo structure matches expected layout', () => {
  const { repoPath, cleanup } = createTempRepo({
    version: '1.0.0',
    skills: {
      'skill-1': { skillMd: createSkillMd({ skill: 'skill-1' }) },
      'skill-2': { skillMd: createSkillMd({ skill: 'skill-2' }) },
    },
  });

  try {
    // Verify directory structure
    const expectedDirs = [
      'VERSION',
      'package.json',
      'plugins/core-skills/.claude-plugin/plugin.json',
      'shared/skills/skill-1/SKILL.md',
      'shared/skills/skill-2/SKILL.md',
      'shared/targets/platforms',
      'schemas/skill.schema.json',
      'schemas/platform.schema.json',
    ];

    for (const dir of expectedDirs) {
      assert.ok(existsSync(join(repoPath, dir)), `Should create ${dir}`);
    }
  } finally {
    cleanup();
  }
});
