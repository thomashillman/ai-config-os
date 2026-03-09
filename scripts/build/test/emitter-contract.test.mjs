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

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILE_MJS = resolve(__dirname, '..', 'compile.mjs');


function hashManifestWithoutArtifactHashes(manifestDoc) {
  const clone = { ...manifestDoc };
  delete clone.artifactHashes;
  delete clone.artifactHashScope;

  return createHash('sha256').update(JSON.stringify(clone, null, 2) + '\n').digest('hex');
}

// Helper: Run compiler and return emitted artefacts
function runCompilerAndReadArtefacts() {
  const result = spawnSync(process.execPath, [COMPILE_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Compiler failed:\n${result.stderr}`);

  // Read Claude Code plugin.json
  const claudeCodePluginPath = join(
    REPO_ROOT,
    'dist',
    'clients',
    'claude-code',
    '.claude-plugin',
    'plugin.json'
  );
  const claudeCodePlugin = JSON.parse(readFileSync(claudeCodePluginPath, 'utf8'));

  // Read registry index.json
  const registryPath = join(REPO_ROOT, 'dist', 'registry', 'index.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

  // Read Cursor .cursorrules
  const cursorPath = join(REPO_ROOT, 'dist', 'clients', 'cursor', '.cursorrules');
  const cursorContent = existsSync(cursorPath) ? readFileSync(cursorPath, 'utf8') : null;

  return { claudeCodePlugin, registry, cursorContent, cursorPath };
}

// ─── Test 1: Claude Code plugin.json contains expected skill list ───

test('claude-code plugin.json skill list matches registry', () => {
  const { claudeCodePlugin, registry } = runCompilerAndReadArtefacts();

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
  const { cursorPath, cursorContent } = runCompilerAndReadArtefacts();

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
  const { cursorContent, registry } = runCompilerAndReadArtefacts();

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
  const { registry } = runCompilerAndReadArtefacts();

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
  const { registry } = runCompilerAndReadArtefacts();

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
  const { registry } = runCompilerAndReadArtefacts();

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
  const { claudeCodePlugin } = runCompilerAndReadArtefacts();

  // Should have required fields
  assert.ok(claudeCodePlugin.version, 'Plugin should have version');
  assert.ok(/^\d+\.\d+\.\d+$/.test(claudeCodePlugin.version), 'Version should be semver');
  assert.ok(claudeCodePlugin.skills, 'Plugin should have skills array');
  assert.ok(Array.isArray(claudeCodePlugin.skills), 'Plugin skills should be array');

  // Each skill should have required fields
  for (const skill of claudeCodePlugin.skills) {
    assert.ok(skill.name, 'Each skill should have name');
    assert.ok(skill.version, 'Each skill should have version');
    assert.ok(skill.path, 'Each skill should have path');
    assert.ok(skill.path.includes(skill.name), 'Skill path should include skill name');
  }
});


// ─── Test 8: Runtime manifest and companion docs are emitted with valid hashes ───

test('runtime docs are emitted with deterministic artifact hashes', () => {
  runCompilerAndReadArtefacts();

  const runtimeDir = join(REPO_ROOT, 'dist', 'runtime');
  const manifestPath = join(runtimeDir, 'manifest.json');
  const outcomesPath = join(runtimeDir, 'outcomes.json');
  const routesPath = join(runtimeDir, 'routes.json');
  const toolRegistryPath = join(runtimeDir, 'tool-registry.json');

  assert.ok(existsSync(manifestPath), 'runtime manifest.json must exist');
  assert.ok(existsSync(outcomesPath), 'runtime outcomes.json must exist');
  assert.ok(existsSync(routesPath), 'runtime routes.json must exist');
  assert.ok(existsSync(toolRegistryPath), 'runtime tool-registry.json must exist');

  const runtimeManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(runtimeManifest.schemaVersion, 1, 'runtime manifest schemaVersion should be 1');
  assert.ok(runtimeManifest.documents, 'runtime manifest should contain documents mapping');
  assert.ok(runtimeManifest.artifactHashes, 'runtime manifest should contain artifactHashes');

  const docPaths = [
    runtimeManifest.documents.manifest,
    runtimeManifest.documents.outcomes,
    runtimeManifest.documents.routes,
    runtimeManifest.documents.toolRegistry,
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
        'manifest-without-artifact-hashes',
        'runtime manifest should declare self-hash scope'
      );

      const expectedManifestHash = hashManifestWithoutArtifactHashes(runtimeManifest);
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
});
