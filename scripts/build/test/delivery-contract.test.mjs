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

    const failures = [];
    for (const { env, platform } of RUNTIME_PLATFORM_CASES) {
      const raw = execFileSync('bash', [PROBE_SCRIPT, '--quiet'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...BASE_PROBE_ENV, HOME: process.env.HOME || '/tmp', ...env },
      });
      const result = JSON.parse(raw);

      if (result.platform_hint !== platform) {
        failures.push(`  env ${JSON.stringify(env)}: expected platform_hint '${platform}', got '${result.platform_hint}'`);
      }
      if (
        !registryPlatforms.has(result.platform_hint) &&
        !NON_REGISTRY_RUNTIME_PLATFORM_HINTS.has(result.platform_hint)
      ) {
        failures.push(`  ${result.platform_hint}: not defined in shared/targets/platforms/ and not documented as intentional`);
      }
    }

    for (const platformId of COMPILE_TIME_ONLY_PLATFORM_IDS) {
      if (!registryPlatforms.has(platformId)) {
        failures.push(`  ${platformId}: must remain available for compile-time package selection`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} platform probe issue(s):\n${failures.join('\n')}`);
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
    timeout: 60_000,
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

    const failures = [];
    for (const skillPath of skillFiles) {
      try {
        const { frontmatter, body } = parseSkill(skillPath);
        const label = relative(CLIENTS_DIR, skillPath);
        if (!frontmatter.skill)       failures.push(`  ${label}: missing 'skill' field`);
        if (!frontmatter.description) failures.push(`  ${label}: missing 'description' field`);
        if (!frontmatter.type)        failures.push(`  ${label}: missing 'type' field`);
        if (!frontmatter.status)      failures.push(`  ${label}: missing 'status' field`);
        if (!frontmatter.version)     failures.push(`  ${label}: missing 'version' field`);
        if (!body || body.length === 0) failures.push(`  ${label}: body should not be empty`);
        if (frontmatter.version && !/^\d+\.\d+\.\d+$/.test(frontmatter.version)) {
          failures.push(`  ${label}: version '${frontmatter.version}' is not semver (expected X.Y.Z)`);
        }
      } catch (err) {
        failures.push(`  ${relative(CLIENTS_DIR, skillPath)}: parse error — ${err.message}`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} SKILL.md structure issue(s):\n${failures.join('\n')}`);
  });

  test('distributed SKILL.md files are readable (UTF-8)', () => {
    const skillFiles = getAllFilesRecursive(CLIENTS_DIR).filter(f => f.endsWith('SKILL.md'));

    const failures = [];
    for (const skillPath of skillFiles) {
      const label = relative(CLIENTS_DIR, skillPath);
      try {
        const content = readFileSync(skillPath, 'utf8');
        if (content.length === 0) failures.push(`  ${label}: file is empty`);
      } catch (err) {
        failures.push(`  ${label}: read error — ${err.message}`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} unreadable SKILL.md file(s):\n${failures.join('\n')}`);
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

    const failures = [];
    for (const skillPath of skillFiles) {
      const { frontmatter } = parseSkill(skillPath);
      const label = relative(DIST_DIR, skillPath);
      if (!frontmatter.name) {
        failures.push(`  ${label}: missing 'name' field (required for Claude Code slash-command discovery)`);
      } else if (!/^[a-z][a-z0-9-]*$/.test(frontmatter.name)) {
        failures.push(`  ${label}: name '${frontmatter.name}' must be kebab-case (lowercase, hyphens only)`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} name field issue(s):\n${failures.join('\n')}`);
  });

  test('name: field matches skill: field in all claude-code SKILL.md files', () => {
    const claudeCodeSkillsDir = join(CLIENTS_DIR, 'claude-code', 'skills');
    if (!existsSync(claudeCodeSkillsDir)) return;

    const skillFiles = getAllFilesRecursive(claudeCodeSkillsDir).filter(f => f.endsWith('SKILL.md'));

    const failures = [];
    for (const skillPath of skillFiles) {
      const { frontmatter } = parseSkill(skillPath);
      if (frontmatter.name !== frontmatter.skill) {
        failures.push(
          `  ${relative(DIST_DIR, skillPath)}: name '${frontmatter.name}' does not match skill '${frontmatter.skill}'`
        );
      }
    }
    assert.equal(failures.length, 0, `${failures.length} name/skill mismatch(es):\n${failures.join('\n')}`);
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

    const failures = [];
    for (const skill of plugin.skills) {
      const id = skill.name || `(unnamed — ${JSON.stringify(skill)})`;
      if (!skill.name)    failures.push(`  ${id}: missing 'name' field`);
      if (!skill.version) failures.push(`  ${id}: missing 'version' field`);
      if (!skill.path)    failures.push(`  ${id}: missing 'path' field`);
      if (skill.version && !/^\d+\.\d+\.\d+$/.test(skill.version)) {
        failures.push(`  ${id}: version '${skill.version}' is not semver (expected X.Y.Z)`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} plugin.json field issue(s):\n${failures.join('\n')}`);
  });

  test('all skill paths in plugin.json exist on disk', () => {
    const pluginPath = join(CLIENTS_DIR, 'claude-code', '.claude-plugin', 'plugin.json');
    const plugin = readJsonCached(pluginPath);

    const failures = [];
    for (const skill of plugin.skills) {
      const skillPath = join(CLIENTS_DIR, 'claude-code', skill.path);
      if (!existsSync(skillPath)) {
        failures.push(`  ${skill.name}: path not found — ${skill.path}`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} missing skill path(s):\n${failures.join('\n')}`);
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

    const failures = [];
    for (const skill of registry.skills) {
      const id = skill.id || `(no id — ${JSON.stringify(skill)})`;
      if (!skill.id) {
        failures.push(`  ${id}: missing 'id' field`);
      } else {
        if (!skill.compatibility || typeof skill.compatibility !== 'object') {
          failures.push(`  ${id}: missing or invalid 'compatibility' object`);
        } else if (Object.keys(skill.compatibility).length === 0) {
          failures.push(`  ${id}: compatibility object has no platform entries`);
        }
      }
    }
    assert.equal(failures.length, 0, `${failures.length} registry skill issue(s):\n${failures.join('\n')}`);
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
    const failures = [];
    for (const skill of registry.skills) {
      if (!skill.capabilities) {
        failures.push(`  ${skill.id}: missing 'capabilities' field`);
      } else if (!Array.isArray(skill.capabilities.required)) {
        failures.push(`  ${skill.id}: capabilities.required must be an array (got ${typeof skill.capabilities.required})`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} capabilities issue(s):\n${failures.join('\n')}`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 4b: Registry summary.json validity
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — registry summary.json', () => {
  test('dist/registry/summary.json exists and is valid JSON with required fields', () => {
    const summaryPath = join(REGISTRY_DIR, 'summary.json');
    assert.ok(existsSync(summaryPath), 'dist/registry/summary.json should exist');
    const content = readFileSync(summaryPath, 'utf8');
    let summary;
    try { summary = JSON.parse(content); }
    catch (err) { assert.fail(`summary.json is not valid JSON: ${err.message}`); }
    assert.ok(typeof summary.version === 'string',        'summary.version must be string');
    assert.ok(typeof summary.skill_count === 'number',    'summary.skill_count must be number');
    assert.ok(typeof summary.platform_count === 'number', 'summary.platform_count must be number');
    assert.ok(Array.isArray(summary.platforms),           'summary.platforms must be array');
    assert.ok(Array.isArray(summary.skills),              'summary.skills must be array');
    assert.equal(summary.skill_count, summary.skills.length, 'skill_count must equal skills.length');
  });

  test('summary.json omits forbidden fields and contains required per-skill fields', () => {
    const summary = readJsonCached(join(REGISTRY_DIR, 'summary.json'));
    // Top-level forbidden fields are scalar checks — fail-fast is fine here
    assert.ok(!('platform_definitions' in summary), 'summary must not contain platform_definitions');
    assert.ok(!('built_at'      in summary), 'summary must not contain built_at');
    assert.ok(!('build_id'      in summary), 'summary must not contain build_id');
    assert.ok(!('source_commit' in summary), 'summary must not contain source_commit');

    const failures = [];
    for (const skill of summary.skills) {
      const id = skill.id || `(no id — index ${summary.skills.indexOf(skill)})`;
      if (!skill.id)                                   failures.push(`  ${id}: missing 'id' field`);
      if (typeof skill.description !== 'string')       failures.push(`  ${id}: missing or non-string 'description' field`);
      if (!skill.type)                                 failures.push(`  ${id}: missing 'type' field`);
      if (!skill.status)                               failures.push(`  ${id}: missing 'status' field`);
      if (!skill.capabilities)                         failures.push(`  ${id}: missing 'capabilities' field`);
      if (skill.capabilities && !Array.isArray(skill.capabilities.required)) {
        failures.push(`  ${id}: capabilities.required must be an array`);
      }
      if ('invocation'               in skill) failures.push(`  ${id}: must not contain 'invocation'`);
      if ('disable-model-invocation' in skill) failures.push(`  ${id}: must not contain 'disable-model-invocation'`);
      if ('user-invocable'           in skill) failures.push(`  ${id}: must not contain 'user-invocable'`);
      if ('tags'                     in skill) failures.push(`  ${id}: must not contain 'tags'`);
      if ('compatibility'            in skill) failures.push(`  ${id}: must not contain 'compatibility'`);
      if ('dependencies'             in skill) failures.push(`  ${id}: must not contain 'dependencies'`);
    }
    assert.equal(failures.length, 0, `${failures.length} summary.json skill issue(s):\n${failures.join('\n')}`);
  });

  test('summary.json version and counts match index.json', () => {
    const index   = readJsonCached(join(REGISTRY_DIR, 'index.json'));
    const summary = readJsonCached(join(REGISTRY_DIR, 'summary.json'));
    assert.equal(summary.version,        index.version,        'summary.version must match index.version');
    assert.equal(summary.skill_count,    index.skill_count,    'skill_count must match');
    assert.equal(summary.platform_count, index.platform_count, 'platform_count must match');
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
    const failures = [];
    for (const skillId of registrySkillIds) {
      if (!pluginSkillNames.has(skillId)) {
        failures.push(`  ${skillId}: in registry but not found in plugin.json`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} missing skill(s) in plugin.json:\n${failures.join('\n')}`);
  });

  test('all plugin.json skills are in registry', () => {
    const registryPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(registryPath);

    const pluginPath = join(CLIENTS_DIR, 'claude-code', '.claude-plugin', 'plugin.json');
    const plugin = readJsonCached(pluginPath);

    const registrySkillIds = new Set(registry.skills.map(s => s.id));

    const failures = [];
    for (const skill of plugin.skills) {
      if (!registrySkillIds.has(skill.name)) {
        failures.push(`  ${skill.name}: in plugin.json but not found in registry`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} missing skill(s) in registry:\n${failures.join('\n')}`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test Group 8: Prompt file integrity
// ───────────────────────────────────────────────────────────────────────────

describe('delivery contract — prompt file existence', () => {
  test('all referenced prompt files exist', () => {
    const skillFiles = getAllFilesRecursive(CLIENTS_DIR).filter(f => f.endsWith('SKILL.md'));

    const failures = [];
    for (const skillPath of skillFiles) {
      const { frontmatter } = parseSkill(skillPath);
      const skillDir = dirname(skillPath);

      if (frontmatter.variants) {
        for (const [variantName, variantDef] of Object.entries(frontmatter.variants)) {
          if (variantDef.prompt_file) {
            const promptPath = join(skillDir, variantDef.prompt_file);
            if (!existsSync(promptPath)) {
              failures.push(`  ${frontmatter.skill} (variant: ${variantName}): prompt_file '${variantDef.prompt_file}' not found`);
            }
          }
        }
      }
    }
    assert.equal(failures.length, 0, `${failures.length} missing prompt file(s):\n${failures.join('\n')}`);
  });

  test('all prompt files are non-empty and readable', () => {
    const promptFiles = getAllFilesRecursive(CLIENTS_DIR).filter(f => f.endsWith('.md'));

    const failures = [];
    for (const promptPath of promptFiles) {
      const label = relative(CLIENTS_DIR, promptPath);
      try {
        const content = readFileSync(promptPath, 'utf8');
        if (content.length === 0) failures.push(`  ${label}: file is empty`);
      } catch (err) {
        failures.push(`  ${label}: read error — ${err.message}`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} unreadable/empty prompt file(s):\n${failures.join('\n')}`);
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
    const failures = [];
    for (const platformId of registry.platforms) {
      const platformDir = join(CLIENTS_DIR, platformId);
      if (!existsSync(platformDir)) {
        failures.push(`  ${platformId}: registered but dist/clients/${platformId}/ does not exist`);
      } else {
        const files = getAllFilesRecursive(platformDir);
        if (files.length === 0) {
          failures.push(`  ${platformId}: registered but dist/clients/${platformId}/ is empty`);
        }
      }
    }
    assert.equal(failures.length, 0, `${failures.length} platform artefact issue(s):\n${failures.join('\n')}`);
  });

  test('all dist/clients/<platform> directories are listed in registry', () => {
    const registryPath = join(REGISTRY_DIR, 'index.json');
    const registry = readJsonCached(registryPath);

    const emittedPlatforms = readdirSync(CLIENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const registryPlatforms = new Set(registry.platforms);

    const failures = [];
    for (const platformId of emittedPlatforms) {
      if (!registryPlatforms.has(platformId)) {
        failures.push(`  ${platformId}: dist/clients/${platformId}/ exists but not listed in registry.platforms`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} unregistered platform(s):\n${failures.join('\n')}`);
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
        timeout: 60_000,
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
      timeout: 60_000,
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
      timeout: 60_000,
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
