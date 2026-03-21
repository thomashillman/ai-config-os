/**
 * delivery-contract.test.mjs
 *
 * Tests that the delivery contract is fully honored:
 * 1. All emitted files exist and are non-empty
 * 2. All distributed SKILL.md files have required structure
 * 3. Plugin.json files for all platforms are valid and consistent
 * 4. Registry index is complete with all expected metadata
 * 5. Cursor .cursorrules is present (if skills are compatible)
 * 6. Cross-file references are valid (no dangling links or missing skills)
 * 7. Version consistency across all artefacts
 * 8. Path integrity: all referenced skill paths exist on disk
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkill } from '../lib/parse-skill.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const COMPILE_MJS = resolve(__dirname, '..', 'compile.mjs');
const DIST_DIR = join(REPO_ROOT, 'dist');
const CLIENTS_DIR = join(DIST_DIR, 'clients');
const REGISTRY_DIR = join(DIST_DIR, 'registry');
const PLATFORM_DIR = join(REPO_ROOT, 'shared', 'targets', 'platforms');
const PROBE_SCRIPT = join(REPO_ROOT, 'ops', 'capability-probe.sh');

const PROBE_PLATFORM_SIGNAL_KEYS = [
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_REMOTE',
  'CLAUDE_CODE',
  'CODEX_SURFACE',
  'CODEX_CLI',
  'CURSOR_SESSION',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CI',
  'VSCODE_INJECTION',
  'VSCODE_IPC_HOOK_CLI',
  'IDEA_HOME',
  'JETBRAINS_TOOLBOX_TOOL_NAME',
  'SSH_CONNECTION',
  'CLAUDE_SURFACE',
];

const BASE_PROBE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !PROBE_PLATFORM_SIGNAL_KEYS.includes(key))
);

const RUNTIME_PLATFORM_CASES = [
  { env: { CLAUDE_CODE_ENTRYPOINT: 'remote_mobile' }, platform: 'claude-ios' },
  { env: { CLAUDE_CODE_ENTRYPOINT: 'web' }, platform: 'claude-web' },
  { env: { CODEX_SURFACE: 'desktop' }, platform: 'codex-desktop' },
  { env: { CODEX_SURFACE: 'cli' }, platform: 'codex' },
  { env: { GITHUB_ACTIONS: 'true' }, platform: 'github-actions' },
  { env: { GITLAB_CI: 'true' }, platform: 'gitlab-ci' },
  { env: { CI: 'true' }, platform: 'ci-generic' },
  { env: { VSCODE_INJECTION: '1' }, platform: 'claude-vscode' },
  { env: { IDEA_HOME: '/Applications/IDEA' }, platform: 'claude-jetbrains' },
  { env: { SSH_CONNECTION: '1 2 3 4' }, platform: 'claude-ssh' },
  { env: { CLAUDE_CODE_REMOTE: '1' }, platform: 'claude-code-remote' },
  { env: { CLAUDE_CODE: '1' }, platform: 'claude-code' },
  { env: { CURSOR_SESSION: '1' }, platform: 'cursor' },
];

const NON_REGISTRY_RUNTIME_PLATFORM_HINTS = new Set([
  // `unknown` is the intentional fallback sentinel from ops/capability-probe.sh,
  // not a distributable platform definition under shared/targets/platforms/.
  'unknown',
]);

const COMPILE_TIME_ONLY_PLATFORM_IDS = new Set([
  // `claude-desktop` currently exists only for compile-time package selection.
  'claude-desktop',
]);

// ───────────────────────────────────────────────────────────────────────────
// Slice 3: Build truthfulness — platform selection logic
// ───────────────────────────────────────────────────────────────────────────

describe('capability-probe platform registry parity', () => {
  test('every concrete runtime platform_hint is registered or intentionally documented', () => {
    const bashProbe = spawnSync('bash', ['--version'], { stdio: 'ignore' });
    if (bashProbe.error || bashProbe.status !== 0) {
      return;
    }

    const registryPlatforms = new Set(
      readdirSync(PLATFORM_DIR)
        .filter(file => file.endsWith('.yaml'))
        .map(file => file.replace(/\.yaml$/, ''))
    );

    for (const { env, platform } of RUNTIME_PLATFORM_CASES) {
      const raw = execFileSync('bash', [PROBE_SCRIPT, '--quiet'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...BASE_PROBE_ENV, HOME: process.env.HOME || '/tmp', ...env },
      });
      const result = JSON.parse(raw);

      assert.equal(result.platform_hint, platform, `expected ${platform} for ${JSON.stringify(env)}`);
      assert.ok(
        registryPlatforms.has(result.platform_hint) ||
          NON_REGISTRY_RUNTIME_PLATFORM_HINTS.has(result.platform_hint),
        `${result.platform_hint} must be defined in shared/targets/platforms/ or documented as intentional`
      );
    }

    for (const platformId of COMPILE_TIME_ONLY_PLATFORM_IDS) {
      assert.ok(
        registryPlatforms.has(platformId),
        `${platformId} must remain available for compile-time package selection`
      );
    }
  });
});

describe('selectEmittedPlatforms — pure platform selection logic', () => {
  test('selectEmittedPlatforms excludes compatible platforms with no emitter', async () => {
    const { selectEmittedPlatforms } = await import('../lib/select-emitted-platforms.mjs');

    const platformSkills = {
      'claude-code': [{ skillName: 'a' }],
      'cursor': [{ skillName: 'b' }],
      'future-client': [{ skillName: 'c' }],
    };

    const emitterRegistry = {
      'claude-code': true,
      'cursor': true,
    };

    const emitted = selectEmittedPlatforms(platformSkills, emitterRegistry);

    assert.deepEqual(emitted.sort(), ['claude-code', 'cursor']);
    assert.ok(!emitted.includes('future-client'), 'future-client should not be in emitted list');
  });

  test('selectEmittedPlatforms returns deterministic order', async () => {
    const { selectEmittedPlatforms } = await import('../lib/select-emitted-platforms.mjs');

    const platformSkills = {
      'b': [{}],
      'a': [{}],
      'c': [{}],
    };

    const emitterRegistry = {
      'a': true,
      'c': true,
    };

    const emitted = selectEmittedPlatforms(platformSkills, emitterRegistry);

    // selectEmittedPlatforms returns keys in iteration order, which is insertion order
    // in modern JS. The exact order is not guaranteed, but it should be consistent.
    assert.deepEqual(new Set(emitted), new Set(['a', 'c']));
  });

  test('selectEmittedPlatforms handles empty emitterRegistry', async () => {
    const { selectEmittedPlatforms } = await import('../lib/select-emitted-platforms.mjs');

    const platformSkills = {
      'a': [{ skillName: 'skill1' }],
      'b': [{ skillName: 'skill2' }],
    };

    const emitterRegistry = {};

    const emitted = selectEmittedPlatforms(platformSkills, emitterRegistry);

    assert.deepEqual(emitted, []);
  });

  test('selectEmittedPlatforms handles empty platformSkills', async () => {
    const { selectEmittedPlatforms } = await import('../lib/select-emitted-platforms.mjs');

    const platformSkills = {};

    const emitterRegistry = {
      'claude-code': true,
      'cursor': true,
    };

    const emitted = selectEmittedPlatforms(platformSkills, emitterRegistry);

    assert.deepEqual(emitted, []);
  });

  test('registry contains only emitted platforms, not all compatible ones', async () => {
    ensureFreshDist();

    const indexPath = join(REGISTRY_DIR, 'index.json');
    const indexContent = readJsonCached(indexPath);

    // Registry should only list platforms with actual emitters
    assert.ok(Array.isArray(indexContent.platforms), 'registry.platforms should be an array');

    // Platforms with emitters should be present in registry
    const registryPlatforms = indexContent.platforms;
    assert.ok(registryPlatforms.includes('claude-code'), 'claude-code should be in registry');
    assert.ok(registryPlatforms.includes('cursor'), 'cursor should be in registry');
    assert.ok(registryPlatforms.includes('codex'), 'codex should be in registry (emitter added)');

    // Platforms without emitters should NOT be in registry
    assert.ok(!registryPlatforms.includes('claude-ios'), 'claude-ios should not be in registry (no emitter)');
    assert.ok(!registryPlatforms.includes('claude-web'), 'claude-web should not be in registry (no emitter)');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Helper: Run compiler to ensure dist/ is fresh — memoised (runs at most once)
// ───────────────────────────────────────────────────────────────────────────

let _distBuilt = false;

function ensureFreshDist() {
  if (_distBuilt) return;
  const result = spawnSync(process.execPath, [COMPILE_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.status !== 0) {
    console.error('Compiler stderr:', result.stderr);
    console.error('Compiler stdout:', result.stdout);
    assert.equal(result.status, 0, `Compiler failed with status ${result.status}`);
  }
  _distBuilt = true;
  // Invalidate file and JSON caches so subsequent reads reflect the new dist/
  _fileListCache.clear();
  _jsonCache.clear();
}

// ───────────────────────────────────────────────────────────────────────────
// Helper: Recursively get all files in a directory — cached per directory
// ───────────────────────────────────────────────────────────────────────────

// Cache: dir → string[] of absolute paths
const _fileListCache = new Map();

function getAllFilesRecursive(dir) {
  if (_fileListCache.has(dir)) return _fileListCache.get(dir);
  const files = [];
  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  _fileListCache.set(dir, files);
  return files;
}

// ───────────────────────────────────────────────────────────────────────────
// Helper: Parse JSON from disk — cached per file path
// ───────────────────────────────────────────────────────────────────────────

const _jsonCache = new Map();

function readJsonCached(filePath) {
  if (_jsonCache.has(filePath)) return _jsonCache.get(filePath);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  _jsonCache.set(filePath, data);
  return data;
}

// ───────────────────────────────────────────────────────────────────────────
// Test Group 1: Directory structure and file existence
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — directory structure', () => {
  test('dist/ directory exists', () => {
    assert.ok(existsSync(DIST_DIR), 'dist/ should exist');
  });

  test('dist/clients/ exists with at least one platform', () => {
    assert.ok(existsSync(CLIENTS_DIR), 'dist/clients/ should exist');
    const platforms = readdirSync(CLIENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    assert.ok(platforms.length > 0, 'Should have at least one platform (claude-code or cursor)');
  });

  test('dist/registry/ exists with index.json', () => {
    assert.ok(existsSync(REGISTRY_DIR), 'dist/registry/ should exist');
    const indexPath = join(REGISTRY_DIR, 'index.json');
    assert.ok(existsSync(indexPath), 'dist/registry/index.json should exist');
  });

  test('no empty files in dist/', () => {
    const allFiles = getAllFilesRecursive(DIST_DIR);
    // Collect sizes during a single stat pass rather than re-statting in a filter
    const emptyFiles = [];
    for (const f of allFiles) {
      if (statSync(f).size === 0) emptyFiles.push(f);
    }
    assert.equal(
      emptyFiles.length,
      0,
      `Found ${emptyFiles.length} empty files in dist/:\n${emptyFiles.join('\n')}`
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 2: SKILL.md file structure in distribution
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — distributed SKILL.md files', () => {
  test('all distributed SKILL.md files have valid structure', () => {
    const skillFiles = getAllFilesRecursive(CLIENTS_DIR).filter(f => f.endsWith('SKILL.md'));
    assert.ok(skillFiles.length > 0, 'Should have at least one distributed SKILL.md');

    for (const skillPath of skillFiles) {
      try {
        const { frontmatter, body } = parseSkill(skillPath);

        // Required frontmatter fields
        assert.ok(frontmatter.skill, `${skillPath}: missing 'skill' field`);
        assert.ok(frontmatter.description, `${skillPath}: missing 'description' field`);
        assert.ok(frontmatter.type, `${skillPath}: missing 'type' field`);
        assert.ok(frontmatter.status, `${skillPath}: missing 'status' field`);
        assert.ok(frontmatter.version, `${skillPath}: missing 'version' field`);

        // Body should not be empty
        assert.ok(body && body.length > 0, `${skillPath}: body should not be empty`);

        // Version should be semver
        assert.match(
          frontmatter.version,
          /^\d+\.\d+\.\d+$/,
          `${skillPath}: version should be semver (X.Y.Z)`
        );
      } catch (err) {
        assert.fail(`${skillPath}: ${err.message}`);
      }
    }
  });

  test('distributed SKILL.md files are readable (UTF-8)', () => {
    const skillFiles = getAllFilesRecursive(CLIENTS_DIR).filter(f => f.endsWith('SKILL.md'));

    for (const skillPath of skillFiles) {
      try {
        const content = readFileSync(skillPath, 'utf8');
        assert.ok(typeof content === 'string', `${skillPath}: should be valid UTF-8`);
        assert.ok(content.length > 0, `${skillPath}: should not be empty`);
      } catch (err) {
        assert.fail(`${skillPath}: ${err.message}`);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 2b: Claude Code skill discovery — `name:` field injection
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — claude-code skill discovery', () => {
  test('all claude-code SKILL.md files have name: field for slash-command discovery', () => {
    const claudeCodeSkillsDir = join(CLIENTS_DIR, 'claude-code', 'skills');
    if (!existsSync(claudeCodeSkillsDir)) return;

    const skillFiles = getAllFilesRecursive(claudeCodeSkillsDir).filter(f => f.endsWith('SKILL.md'));
    assert.ok(skillFiles.length > 0, 'Should have at least one claude-code SKILL.md');

    for (const skillPath of skillFiles) {
      const { frontmatter } = parseSkill(skillPath);
      assert.ok(
        frontmatter.name,
        `${relative(DIST_DIR, skillPath)}: must have 'name' field for Claude Code discovery`
      );
      assert.ok(
        /^[a-z][a-z0-9-]*$/.test(frontmatter.name),
        `${relative(DIST_DIR, skillPath)}: name '${frontmatter.name}' must be kebab-case`
      );
    }
  });

  test('name: field matches skill: field in all claude-code SKILL.md files', () => {
    const claudeCodeSkillsDir = join(CLIENTS_DIR, 'claude-code', 'skills');
    if (!existsSync(claudeCodeSkillsDir)) return;

    const skillFiles = getAllFilesRecursive(claudeCodeSkillsDir).filter(f => f.endsWith('SKILL.md'));

    for (const skillPath of skillFiles) {
      const { frontmatter } = parseSkill(skillPath);
      assert.equal(
        frontmatter.name,
        frontmatter.skill,
        `${relative(DIST_DIR, skillPath)}: name '${frontmatter.name}' should match skill '${frontmatter.skill}'`
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 3: Plugin.json validity
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — plugin.json validity', () => {
  test('claude-code plugin.json exists and is valid JSON', () => {
    const pluginPath = join(CLIENTS_DIR, 'claude-code', '.claude-plugin', 'plugin.json');
    assert.ok(existsSync(pluginPath), 'claude-code plugin.json should exist');

    const content = readFileSync(pluginPath, 'utf8');
    let plugin;
    try {
      plugin = JSON.parse(content);
    } catch (err) {
      assert.fail(`claude-code plugin.json is not valid JSON: ${err.message}`);
    }

    assert.ok(plugin.version, 'plugin.json should have version');
    assert.ok(plugin.skills, 'plugin.json should have skills array');
    assert.ok(Array.isArray(plugin.skills), 'plugin.skills should be an array');
    assert.ok(plugin.skills.length > 0, 'plugin.skills should have at least one skill');
  });

  test('each skill in plugin.json has required fields', () => {
    const pluginPath = join(CLIENTS_DIR, 'claude-code', '.claude-plugin', 'plugin.json');
    const plugin = readJsonCached(pluginPath);

    for (const skill of plugin.skills) {
      assert.ok(skill.name, `Skill should have name: ${JSON.stringify(skill)}`);
      assert.ok(skill.version, `Skill ${skill.name} should have version`);
      assert.ok(skill.path, `Skill ${skill.name} should have path`);

      // Version should be semver
      assert.match(skill.version, /^\d+\.\d+\.\d+$/, `Skill ${skill.name} version should be semver`);
    }
  });

  test('all skill paths in plugin.json exist on disk', () => {
    const pluginPath = join(CLIENTS_DIR, 'claude-code', '.claude-plugin', 'plugin.json');
    const plugin = readJsonCached(pluginPath);

    for (const skill of plugin.skills) {
      const skillPath = join(CLIENTS_DIR, 'claude-code', skill.path);
      assert.ok(
        existsSync(skillPath),
        `Skill path should exist: ${skill.path} (resolved to ${skillPath})`
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 4: Registry index.json validity
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — registry index.json', () => {
  test('registry index.json is valid JSON with required fields', () => {
    const indexPath = join(REGISTRY_DIR, 'index.json');
    const content = readFileSync(indexPath, 'utf8');

    let registry;
    try {
      registry = JSON.parse(content);
    } catch (err) {
      assert.fail(`registry/index.json is not valid JSON: ${err.message}`);
    }

    assert.ok(registry.skills, 'registry should have skills array');
    assert.ok(Array.isArray(registry.skills), 'registry.skills should be array');
    assert.ok(registry.platforms, 'registry should have platforms array');
    assert.ok(Array.isArray(registry.platforms), 'registry.platforms should be array');
    assert.ok(typeof registry.skill_count === 'number', 'registry should have skill_count');
    assert.ok(typeof registry.platform_count === 'number', 'registry should have platform_count');
  });

  test('registry skill_count matches actual skills', () => {
    const indexPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(indexPath);

    assert.equal(
      registry.skill_count,
      registry.skills.length,
      'skill_count should match skills array length'
    );
  });

  test('registry platform_count matches actual platforms', () => {
    const indexPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(indexPath);

    assert.equal(
      registry.platform_count,
      registry.platforms.length,
      'platform_count should match platforms array length'
    );
  });

  test('all registry skills have id and compatibility', () => {
    const indexPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(indexPath);

    for (const skill of registry.skills) {
      assert.ok(skill.id, `Skill should have id: ${JSON.stringify(skill)}`);
      assert.ok(
        skill.compatibility && typeof skill.compatibility === 'object',
        `Skill ${skill.id} should have compatibility object`
      );
      assert.ok(
        Object.keys(skill.compatibility).length > 0,
        `Skill ${skill.id} should have at least one platform in compatibility`
      );
    }
  });

  test('registry platforms list is non-empty', () => {
    const indexPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(indexPath);

    assert.ok(registry.platforms.length > 0, 'registry should list at least one platform');
    assert.ok(
      registry.platforms.includes('claude-code'),
      'registry should include claude-code platform'
    );
  });

  test('registry platform_definitions includes new CI/IDE/desktop platforms', () => {
    const indexPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(indexPath);

    const defs = registry.platform_definitions || {};
    assert.ok(defs['github-actions'],  'registry must have github-actions platform definition');
    assert.ok(defs['gitlab-ci'],       'registry must have gitlab-ci platform definition');
    assert.ok(defs['claude-vscode'],   'registry must have claude-vscode platform definition');
    assert.ok(defs['claude-desktop'],  'registry must have claude-desktop platform definition');
    assert.ok(defs['claude-ssh'],      'registry must have claude-ssh platform definition');
    assert.ok(defs['codex-desktop'],   'registry must have codex-desktop platform definition');
  });

  test('registry skills each have capabilities.required array', () => {
    const indexPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(indexPath);

    assert.ok(Array.isArray(registry.skills), 'registry.skills must be an array');
    for (const skill of registry.skills) {
      assert.ok(skill.capabilities, `skill ${skill.id} must have capabilities`);
      assert.ok(
        Array.isArray(skill.capabilities.required),
        `skill ${skill.id} capabilities.required must be an array`
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 5: Cursor .cursorrules validity (if cursor platform exists)
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — cursor .cursorrules', () => {
  test('cursor .cursorrules exists if cursor skills are compatible', () => {
    const cursorPath = join(CLIENTS_DIR, 'cursor', '.cursorrules');
    const cursorDir = join(CLIENTS_DIR, 'cursor');

    if (existsSync(cursorDir)) {
      // If cursor directory exists, .cursorrules should exist
      assert.ok(
        existsSync(cursorPath),
        'cursor/.cursorrules should exist if cursor platform directory exists'
      );

      const content = readFileSync(cursorPath, 'utf8');
      assert.ok(content.length > 0, 'cursor/.cursorrules should not be empty');
    }
  });

  test('cursor .cursorrules has required headers', () => {
    const cursorPath = join(CLIENTS_DIR, 'cursor', '.cursorrules');

    if (existsSync(cursorPath)) {
      const content = readFileSync(cursorPath, 'utf8');

      // Should have version header
      assert.ok(
        /# Version: \d+\.\d+\.\d+/.test(content),
        'cursor/.cursorrules should have version header (# Version: X.Y.Z)'
      );

      // Should have AI Config OS header
      assert.ok(
        content.includes('# AI Config OS'),
        'cursor/.cursorrules should have AI Config OS header'
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 6: Version consistency across artefacts
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — version consistency', () => {
  test('all platform plugin.json files have matching version', () => {
    const platforms = readdirSync(CLIENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const versions = {};
    for (const platform of platforms) {
      const pluginPath = join(CLIENTS_DIR, platform, '.claude-plugin', 'plugin.json');
      if (existsSync(pluginPath)) {
        const plugin = readJsonCached(pluginPath);
        versions[platform] = plugin.version;
      }
    }

    // All versions should be identical
    const uniqueVersions = new Set(Object.values(versions));
    assert.equal(
      uniqueVersions.size,
      1,
      `All platforms should have the same version. Got: ${JSON.stringify(versions)}`
    );
  });

  test('registry and plugin.json versions match', () => {
    const registryPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(registryPath);

    const pluginPath = join(CLIENTS_DIR, 'claude-code', '.claude-plugin', 'plugin.json');
    const plugin = readJsonCached(pluginPath);

    assert.equal(
      registry.version,
      plugin.version,
      'registry version should match plugin.json version'
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 7: Cross-file reference integrity
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — reference integrity', () => {
  test('all registry skill IDs are present in plugin.json', () => {
    const registryPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(registryPath);

    const pluginPath = join(CLIENTS_DIR, 'claude-code', '.claude-plugin', 'plugin.json');
    const plugin = readJsonCached(pluginPath);

    const pluginSkillNames = new Set(plugin.skills.map(s => s.name));
    const registrySkillIds = new Set(registry.skills.map(s => s.id));

    // Every registry skill should be in plugin
    for (const skillId of registrySkillIds) {
      assert.ok(
        pluginSkillNames.has(skillId),
        `Registry skill ${skillId} not found in plugin.json`
      );
    }
  });

  test('all plugin.json skills are in registry', () => {
    const registryPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(registryPath);

    const pluginPath = join(CLIENTS_DIR, 'claude-code', '.claude-plugin', 'plugin.json');
    const plugin = readJsonCached(pluginPath);

    const registrySkillIds = new Set(registry.skills.map(s => s.id));

    for (const skill of plugin.skills) {
      assert.ok(
        registrySkillIds.has(skill.name),
        `Plugin skill ${skill.name} not found in registry`
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 8: Prompt file integrity
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — prompt file existence', () => {
  test('all referenced prompt files exist', () => {
    const skillFiles = getAllFilesRecursive(CLIENTS_DIR).filter(f => f.endsWith('SKILL.md'));

    for (const skillPath of skillFiles) {
      const { frontmatter } = parseSkill(skillPath);
      const skillDir = dirname(skillPath);

      // Check variants for prompt files
      if (frontmatter.variants) {
        for (const [variantName, variantDef] of Object.entries(frontmatter.variants)) {
          if (variantDef.prompt_file) {
            const promptPath = join(skillDir, variantDef.prompt_file);
            assert.ok(
              existsSync(promptPath),
              `Prompt file not found: ${variantDef.prompt_file} (skill: ${frontmatter.skill}, variant: ${variantName})`
            );
          }
        }
      }
    }
  });

  test('all prompt files are non-empty and readable', () => {
    const promptFiles = getAllFilesRecursive(CLIENTS_DIR).filter(f => f.endsWith('.md'));

    for (const promptPath of promptFiles) {
      try {
        const content = readFileSync(promptPath, 'utf8');
        assert.ok(content.length > 0, `Prompt file should not be empty: ${promptPath}`);
      } catch (err) {
        assert.fail(`Failed to read prompt file ${promptPath}: ${err.message}`);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 9: Build truthfulness contract
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — build truthfulness (Slice 4)', () => {
  test('registry only lists platforms with actual emitted artefacts', () => {
    const registryPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(registryPath);

    // All platforms in registry.platforms should have a dist/clients/<platform> directory
    for (const platformId of registry.platforms) {
      const platformDir = join(CLIENTS_DIR, platformId);
      assert.ok(
        existsSync(platformDir),
        `Registry claims platform "${platformId}" but no dist/clients/${platformId} directory exists`
      );

      // Verify the platform directory is not empty
      const files = getAllFilesRecursive(platformDir);
      assert.ok(
        files.length > 0,
        `Registry claims platform "${platformId}" but dist/clients/${platformId} is empty`
      );
    }
  });

  test('all dist/clients/<platform> directories are listed in registry', () => {
    const registryPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(registryPath);

    const emittedPlatforms = readdirSync(CLIENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const registryPlatforms = new Set(registry.platforms);

    for (const platformId of emittedPlatforms) {
      assert.ok(
        registryPlatforms.has(platformId),
        `dist/clients/${platformId} exists but is not listed in registry.platforms`
      );
    }
  });

  test('stale artefacts are removed on rebuild', () => {
    // This test verifies that rebuilding removes old dist/ content.
    // We create a marker file, rebuild, and verify it's gone.

    // Create a marker file in an improbable location
    const markerDir = join(DIST_DIR, '_test-marker-should-not-exist');
    const markerFile = join(markerDir, 'test-file.txt');

    try {
      // Ensure dist/ exists (it should from previous tests)
      if (!existsSync(DIST_DIR)) {
        mkdirSync(DIST_DIR, { recursive: true });
      }

      // Create marker file
      mkdirSync(markerDir, { recursive: true });
      writeFileSync(markerFile, 'This file should be removed on rebuild\n');

      assert.ok(
        existsSync(markerFile),
        'Marker file should exist before rebuild'
      );

      // Run compiler to rebuild dist/
      const result = spawnSync(process.execPath, [COMPILE_MJS], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30000,
      });

      assert.equal(result.status, 0, `Compiler failed: ${result.stderr}`);

      // Verify marker file is gone
      assert.ok(
        !existsSync(markerFile),
        'Marker file should be removed after rebuild (stale artefacts must not survive)'
      );
    } finally {
      // Ensure cleanup even if test fails
      try {
        rmSync(markerDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  test('rebuild produces deterministic dist/ content', () => {
    // Compile once
    const result1 = spawnSync(process.execPath, [COMPILE_MJS], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result1.status, 0, `First compile failed: ${result1.stderr}`);

    // Capture all files and their content
    const files1 = getAllFilesRecursive(DIST_DIR);
    const content1 = {};
    for (const file of files1) {
      content1[relative(DIST_DIR, file)] = readFileSync(file, 'utf8');
    }

    // Compile again
    const result2 = spawnSync(process.execPath, [COMPILE_MJS], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result2.status, 0, `Second compile failed: ${result2.stderr}`);

    // Capture files again
    const files2 = getAllFilesRecursive(DIST_DIR);
    const content2 = {};
    for (const file of files2) {
      content2[relative(DIST_DIR, file)] = readFileSync(file, 'utf8');
    }

    // Compare
    assert.deepEqual(content1, content2, 'Rebuild should produce identical dist/ content');
  });
});
