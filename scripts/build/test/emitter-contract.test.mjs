/**
 * emitter-contract.test.mjs
 *
 * Tests that emitted artefacts match the compatibility contract:
 * 1. Claude Code plugin.json skill list matches compatibility resolution
 * 2. Cursor .cursorrules exists with expected structure (header, version, skill count)
 * 3. Registry output lists expected platforms and includes compatibility matrix
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTaskRouteDefinitions } from '../../../runtime/lib/task-route-definition-loader.mjs';
import { loadTaskRouteInputDefinitions } from '../../../runtime/lib/task-route-input-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILE_MJS = resolve(__dirname, '..', 'compile.mjs');


function hashManifestWithRedactedSelfHash(manifestDoc) {
  const manifestPath = manifestDoc.documents.manifest;
  const clone = {
    ...manifestDoc,
    artifactHashes: {
      ...manifestDoc.artifactHashes,
      [manifestPath]: '',
    },
  };

  return createHash('sha256').update(JSON.stringify(clone, null, 2) + '\n').digest('hex');
}

// Run compiler once; all tests share the emitted artefacts.
const _compileResult = spawnSync(process.execPath, [COMPILE_MJS], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  timeout: 60_000,
});

function getArtefacts() {
  assert.equal(_compileResult.status, 0, `Compiler failed:\n${_compileResult.stderr}`);

  const claudeCodePluginPath = join(REPO_ROOT, 'dist', 'clients', 'claude-code', '.claude-plugin', 'plugin.json');
  const claudeCodePlugin = JSON.parse(readFileSync(claudeCodePluginPath, 'utf8'));

  const registryPath = join(REPO_ROOT, 'dist', 'registry', 'index.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

  const cursorPath = join(REPO_ROOT, 'dist', 'clients', 'cursor', '.cursorrules');
  const cursorContent = existsSync(cursorPath) ? readFileSync(cursorPath, 'utf8') : null;

  return { claudeCodePlugin, registry, cursorContent, cursorPath };
}

// Eagerly read artefacts once; individual tests destructure what they need.
const { claudeCodePlugin, registry, cursorContent, cursorPath } = getArtefacts();

// ─── Test 1: Claude Code plugin.json contains expected skill list ───

test('claude-code plugin.json skill list matches registry', () => {

  // Extract skill names from both sources
  const pluginSkillNames = new Set(claudeCodePlugin.skills.map(s => s.name));
  const registrySkillIds = new Set(registry.skills.map(s => s.id));

  // They should be identical
  assert.deepEqual(
    pluginSkillNames,
    registrySkillIds,
    'Plugin skill list should match registry skill IDs'
  );

  // Plugin should have same number of skills as registry
  assert.equal(
    claudeCodePlugin.skills.length,
    registry.skills.length,
    'Plugin skill count should match registry'
  );
});

// ─── Test 2: Cursor .cursorrules exists with expected structure ───

test('cursor .cursorrules exists with correct header and structure', () => {
  // cursorPath and cursorContent are module-level

  assert.ok(existsSync(cursorPath), 'Cursor .cursorrules file must exist');
  assert.ok(cursorContent && cursorContent.length > 0, 'Cursor content should not be empty');

  // Check for expected header lines
  assert.ok(
    cursorContent.includes('# AI Config OS — Cursor Rules'),
    'Cursor should have AI Config OS header'
  );

  // Check for version header (line format: "# Version: X.Y.Z")
  assert.ok(
    /# Version: \d+\.\d+\.\d+/.test(cursorContent),
    'Cursor should have version header'
  );

  // Check for skill count header (line format: "# Skills: N")
  assert.ok(
    /# Skills: \d+/.test(cursorContent),
    'Cursor should have skill count header'
  );

  // Extract skill count from header and verify it's a positive number
  const skillCountMatch = cursorContent.match(/# Skills: (\d+)/);
  assert.ok(skillCountMatch, 'Should find skill count in header');
  const skillCount = parseInt(skillCountMatch[1], 10);
  assert.ok(skillCount > 0, 'Cursor should emit at least one skill');
});

// ─── Test 3: Cursor .cursorrules contains at least one known skill ───

test('cursor .cursorrules contains at least one skill section', () => {
  // cursorContent and registry are module-level

  // Should have skill section headers formatted as "# ─── <skill-name> ───"
  const skillHeaderRegex = /# ─── .+ ───/;
  assert.ok(
    skillHeaderRegex.test(cursorContent),
    'Cursor should have at least one skill section with proper header format'
  );

  // Verify that at least one registry skill is referenced in Cursor
  const registrySkillIds = registry.skills.map(s => s.id);
  const hasAtLeastOneSkill = registrySkillIds.some(skillId => {
    // Check for skill header format or skill name in content
    return cursorContent.includes(skillId);
  });
  assert.ok(hasAtLeastOneSkill, 'Cursor should reference at least one known skill');
});

// ─── Test 4: Registry output has platforms list ───

test('registry lists expected platforms', () => {
  // registry is module-level

  assert.ok(Array.isArray(registry.platforms), 'Registry should have platforms array');
  assert.ok(registry.platforms.length > 0, 'Registry should list at least one platform');

  // Common platforms we expect: claude-code, cursor
  const hasCommonPlatforms = registry.platforms.some(p =>
    p === 'claude-code' || p === 'cursor'
  );
  assert.ok(hasCommonPlatforms, 'Registry should include common platforms (claude-code or cursor)');
});

// ─── Test 5: All registry skills have compatibility matrix ───

test('all registry skills have compatibility matrix', () => {
  // registry is module-level

  assert.ok(Array.isArray(registry.skills), 'Registry should have skills array');
  assert.ok(registry.skills.length > 0, 'Registry should have at least one skill');

  for (const skill of registry.skills) {
    assert.ok(skill.id, 'Skill should have id');
    assert.ok(
      typeof skill.compatibility === 'object' && skill.compatibility !== null,
      `Skill ${skill.id} should have compatibility object`
    );

    // Each skill should have compatibility entries for the platforms
    const compatKeys = Object.keys(skill.compatibility);
    assert.ok(
      compatKeys.length > 0,
      `Skill ${skill.id} should have at least one platform in compatibility`
    );
  }
});

// ─── Test 6: Registry skill_count and platform_count match arrays ───

test('registry metadata counts match actual arrays', () => {
  // registry is module-level

  assert.equal(
    registry.skill_count,
    registry.skills.length,
    'Registry skill_count should match actual skills array length'
  );

  assert.equal(
    registry.platform_count,
    registry.platforms.length,
    'Registry platform_count should match actual platforms array length'
  );
});

// ─── Test 7: Claude Code plugin.json has correct version and structure ───

test('claude-code plugin.json has correct version and structure', () => {
  // claudeCodePlugin is module-level

  // Should have required fields
  assert.ok(claudeCodePlugin.version, 'Plugin should have version');
  assert.ok(/^\d+\.\d+\.\d+$/.test(claudeCodePlugin.version), 'Version should be semver');
  assert.ok(claudeCodePlugin.skills, 'Plugin should have skills array');
  assert.ok(Array.isArray(claudeCodePlugin.skills), 'Plugin skills should be array');

  // Each skill should have required fields
  const failures = [];
  for (const skill of claudeCodePlugin.skills) {
    const id = skill.name || JSON.stringify(skill);
    if (!skill.name) failures.push(`  ${id}: missing 'name' field`);
    if (!skill.version) failures.push(`  ${id}: missing 'version' field`);
    if (!skill.path) failures.push(`  ${id}: missing 'path' field`);
    if (skill.name && skill.path && !skill.path.includes(skill.name)) {
      failures.push(`  ${skill.name}: path '${skill.path}' should include skill name`);
    }
  }
  assert.equal(failures.length, 0, `${failures.length} plugin skill field issue(s):\n${failures.join('\n')}`);
});


// ─── Test 8: Runtime manifest and companion docs are emitted with valid hashes ───

test('runtime docs are emitted with deterministic artifact hashes', () => {
  // Compiler was already run at module load; artefacts are in dist/.
  const runtimeDir = join(REPO_ROOT, 'dist', 'runtime');
  const manifestPath = join(runtimeDir, 'manifest.json');
  const outcomesPath = join(runtimeDir, 'outcomes.json');
  const routesPath = join(runtimeDir, 'routes.json');
  const toolRegistryPath = join(runtimeDir, 'tool-registry.json');
  const taskRouteDefinitionsPath = join(runtimeDir, 'task-route-definitions.json');
  const taskRouteInputDefinitionsPath = join(runtimeDir, 'task-route-input-definitions.json');

  assert.ok(existsSync(manifestPath), 'runtime manifest.json must exist');
  assert.ok(existsSync(outcomesPath), 'runtime outcomes.json must exist');
  assert.ok(existsSync(routesPath), 'runtime routes.json must exist');
  assert.ok(existsSync(toolRegistryPath), 'runtime tool-registry.json must exist');
  assert.ok(existsSync(taskRouteDefinitionsPath), 'runtime task-route-definitions.json must exist');
  assert.ok(existsSync(taskRouteInputDefinitionsPath), 'runtime task-route-input-definitions.json must exist');

  const runtimeManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(runtimeManifest.schemaVersion, 1, 'runtime manifest schemaVersion should be 1');
  assert.ok(runtimeManifest.documents, 'runtime manifest should contain documents mapping');
  assert.ok(runtimeManifest.artifactHashes, 'runtime manifest should contain artifactHashes');

  const docPaths = [
    runtimeManifest.documents.manifest,
    runtimeManifest.documents.outcomes,
    runtimeManifest.documents.routes,
    runtimeManifest.documents.toolRegistry,
    runtimeManifest.documents.taskRouteDefinitions,
    runtimeManifest.documents.taskRouteInputDefinitions,
  ];

  for (const relativePath of docPaths) {
    assert.ok(typeof relativePath === 'string' && relativePath.length > 0, 'document path should be non-empty');
    const absolutePath = join(REPO_ROOT, 'dist', relativePath);
    assert.ok(existsSync(absolutePath), `document should exist: ${relativePath}`);

    if (relativePath === runtimeManifest.documents.manifest) {
      assert.equal(
        runtimeManifest.artifactHashAlgorithm,
        'sha256',
        'runtime manifest should declare sha256 algorithm'
      );
      assert.equal(
        runtimeManifest.artifactHashScope,
        'manifest-with-self-hash-redacted',
        'runtime manifest should declare self-hash scope'
      );

      const expectedManifestHash = hashManifestWithRedactedSelfHash(runtimeManifest);
      assert.equal(
        runtimeManifest.artifactHashes[relativePath],
        expectedManifestHash,
        'manifest artifact hash should match normalized manifest content'
      );
    } else {
      const expectedHash = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
      assert.equal(
        runtimeManifest.artifactHashes[relativePath],
        expectedHash,
        `artifact hash should match for ${relativePath}`
      );
    }
  }

  for (const bundlePath of runtimeManifest.bundles || []) {
    const absolutePath = join(REPO_ROOT, 'dist', bundlePath);
    assert.ok(existsSync(absolutePath), `bundle should exist: ${bundlePath}`);

    const expectedHash = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
    assert.equal(
      runtimeManifest.artifactHashes[bundlePath],
      expectedHash,
      `artifact hash should match for ${bundlePath}`
    );
  }

  const emittedTaskRouteDefinitions = JSON.parse(readFileSync(taskRouteDefinitionsPath, 'utf8'));
  const emittedTaskRouteInputDefinitions = JSON.parse(readFileSync(taskRouteInputDefinitionsPath, 'utf8'));
  const sourceTaskRouteDefinitions = loadTaskRouteDefinitions(join(REPO_ROOT, 'runtime', 'task-route-definitions.yaml'));
  const sourceTaskRouteInputDefinitions = loadTaskRouteInputDefinitions(join(REPO_ROOT, 'runtime', 'task-route-input-definitions.yaml'));

  assert.deepEqual(
    emittedTaskRouteDefinitions.task_types,
    sourceTaskRouteDefinitions.taskTypes,
    'emitted task-route-definitions should match canonical runtime source definitions'
  );

  assert.deepEqual(
    emittedTaskRouteInputDefinitions.task_types,
    sourceTaskRouteInputDefinitions.taskTypes,
    'emitted task-route-input definitions should match canonical runtime source definitions'
  );
});
