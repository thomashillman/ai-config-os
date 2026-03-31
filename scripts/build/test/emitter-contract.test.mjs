/**
 * emitter-contract.test.mjs
 *
 * Tests that emitted artefacts match the compatibility contract:
 * 1. Claude Code plugin.json skill list matches compatibility resolution
 * 2. Cursor Agent Skills tree + .emit-meta.json (version, skill count)
 * 3. Registry output lists expected platforms and includes compatibility matrix
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

  const cursorMetaPath = join(REPO_ROOT, 'dist', 'clients', 'cursor', '.emit-meta.json');
  const cursorSkillsDir = join(REPO_ROOT, 'dist', 'clients', 'cursor', 'skills');
  const cursorMeta = existsSync(cursorMetaPath)
    ? JSON.parse(readFileSync(cursorMetaPath, 'utf8'))
    : null;

  return { claudeCodePlugin, registry, cursorMeta, cursorMetaPath, cursorSkillsDir };
}

// Eagerly read artefacts once; individual tests destructure what they need.
const { claudeCodePlugin, registry, cursorMeta, cursorMetaPath, cursorSkillsDir } = getArtefacts();

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

// ─── Test 2: Cursor skills tree + emit meta ───

test('cursor skills directory and .emit-meta.json exist with expected shape', () => {
  assert.ok(existsSync(cursorSkillsDir), 'Cursor skills/ directory must exist');
  assert.ok(existsSync(cursorMetaPath), 'Cursor .emit-meta.json must exist');
  assert.ok(cursorMeta, 'Cursor meta must parse');
  assert.equal(cursorMeta.emit_kind, 'cursor-agent-skills');
  assert.ok(/^\d+\.\d+\.\d+$/.test(cursorMeta.version), 'meta.version should be semver');
  assert.ok(cursorMeta.skills_count > 0, 'skills_count should be positive');
  const dirs = readdirSync(cursorSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
  assert.equal(
    dirs.length,
    cursorMeta.skills_count,
    'skills_count should match directory count'
  );
});

// ─── Test 3: Cursor emitted SKILL.md references known skills ───

test('cursor skills contain at least one registry skill with valid frontmatter', () => {
  const registrySkillIds = registry.skills.map(s => s.id);
  const dirs = readdirSync(cursorSkillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  const overlap = registrySkillIds.filter(id => dirs.includes(id));
  assert.ok(overlap.length > 0, 'At least one registry skill should be emitted under cursor/skills');

  const sampleId = overlap[0];
  const mdPath = join(cursorSkillsDir, sampleId, 'SKILL.md');
  assert.ok(existsSync(mdPath), `SKILL.md should exist for ${sampleId}`);
  const md = readFileSync(mdPath, 'utf8');
  assert.ok(md.startsWith('---\n'), 'Emitted SKILL.md should start with frontmatter');
  assert.ok(md.includes(`name: ${sampleId}`), 'Frontmatter should include name matching folder');
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
