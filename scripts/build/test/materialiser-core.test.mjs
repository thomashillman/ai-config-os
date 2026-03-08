/**
 * Materialiser Core Tests
 *
 * Tests the self-sufficient package materialization system.
 * Verifies that emitted packages work standalone without source-tree access.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readPackageMetadata,
  validatePackageContents,
  materializePackage,
  getPackageStats,
  MaterialiserError,
} from '../lib/materialise-client.mjs';

test('Materialiser Core', async (t) => {
  // Helper: create a minimal test package
  function createTestPackage() {
    const tmp = mkdtempSync(join(tmpdir(), 'materialise-test-'));
    const pluginDir = join(tmp, '.claude-plugin');
    mkdirSync(pluginDir, { recursive: true });

    // Create minimal plugin.json
    const pluginJson = {
      name: 'test-client',
      version: '1.0.0',
      skills: [
        { name: 'skill-one', version: '1.0.0', path: 'skills/skill-one/SKILL.md' },
        { name: 'skill-two', version: '2.0.0', path: 'skills/skill-two/SKILL.md' },
      ],
    };
    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify(pluginJson));

    // Create skill files
    mkdirSync(join(tmp, 'skills', 'skill-one'), { recursive: true });
    mkdirSync(join(tmp, 'skills', 'skill-two'), { recursive: true });
    writeFileSync(join(tmp, 'skills', 'skill-one', 'SKILL.md'), '---\nskill: skill-one\n---\nContent one');
    writeFileSync(join(tmp, 'skills', 'skill-two', 'SKILL.md'), '---\nskill: skill-two\n---\nContent two');

    return tmp;
  }

  await t.test('readPackageMetadata: should read valid plugin.json', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);

      assert.equal(metadata.version, '1.0.0');
      assert.equal(metadata.skills.length, 2);
      assert.equal(metadata.skills[0].name, 'skill-one');
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('readPackageMetadata: should fail if package root does not exist', () => {
    const nonexistent = join(tmpdir(), 'nonexistent-' + Math.random());

    assert.throws(
      () => readPackageMetadata(nonexistent),
      MaterialiserError,
      'Should throw for missing package'
    );
  });

  await t.test('readPackageMetadata: should fail if plugin.json missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'materialise-test-'));

    try {
      assert.throws(
        () => readPackageMetadata(tmp),
        MaterialiserError,
        'Should throw when plugin.json missing'
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await t.test('readPackageMetadata: should fail if plugin.json is invalid JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'materialise-test-'));
    mkdirSync(join(tmp, '.claude-plugin'), { recursive: true });
    writeFileSync(join(tmp, '.claude-plugin', 'plugin.json'), 'invalid json {');

    try {
      assert.throws(
        () => readPackageMetadata(tmp),
        MaterialiserError,
        'Should throw on invalid JSON'
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await t.test('readPackageMetadata: should fail if version field missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'materialise-test-'));
    mkdirSync(join(tmp, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(tmp, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ skills: [] }) // missing version
    );

    try {
      assert.throws(
        () => readPackageMetadata(tmp),
        MaterialiserError,
        'Should throw if version missing'
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await t.test('validatePackageContents: should succeed for valid package', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);
      assert.doesNotThrow(
        () => validatePackageContents(pkg, metadata),
        'Valid package should not throw'
      );
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('validatePackageContents: should reject absolute paths', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);
      metadata.skills[0].path = '/etc/passwd'; // absolute path attack

      assert.throws(
        () => validatePackageContents(pkg, metadata),
        MaterialiserError,
        'Should reject absolute paths'
      );
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('validatePackageContents: should reject path traversal attempts', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);
      metadata.skills[0].path = '../../etc/passwd'; // path traversal attack

      assert.throws(
        () => validatePackageContents(pkg, metadata),
        MaterialiserError,
        'Should reject path traversal'
      );
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('validatePackageContents: should reject missing skill files', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);
      metadata.skills.push({
        name: 'missing-skill',
        version: '1.0.0',
        path: 'skills/missing-skill/SKILL.md', // doesn't exist
      });

      assert.throws(
        () => validatePackageContents(pkg, metadata),
        MaterialiserError,
        'Should fail if skill file missing'
      );
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('materializePackage: should extract all skills to destination', () => {
    const pkg = createTestPackage();
    const dest = mkdtempSync(join(tmpdir(), 'materialise-dest-'));

    try {
      const result = materializePackage(pkg, dest);

      assert.equal(result.skillsExtracted.length, 2);
      assert.equal(result.version, '1.0.0');

      // Verify files were extracted
      assert.ok(
        existsSync(join(dest, 'skills', 'skill-one', 'SKILL.md')),
        'skill-one should be extracted'
      );
      assert.ok(
        existsSync(join(dest, 'skills', 'skill-two', 'SKILL.md')),
        'skill-two should be extracted'
      );

      // Verify content
      const content = readFileSync(join(dest, 'skills', 'skill-one', 'SKILL.md'), 'utf8');
      assert(content.includes('Content one'), 'Content should match');
    } finally {
      rmSync(pkg, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  await t.test('materializePackage: should support dryRun option', () => {
    const pkg = createTestPackage();
    const dest = mkdtempSync(join(tmpdir(), 'materialise-dest-'));

    try {
      const result = materializePackage(pkg, dest, { dryRun: true });

      assert.ok(result.dryRun, 'dryRun flag should be set');
      assert.equal(result.skillsExtracted.length, 2);

      // Files should NOT be created in dryRun
      assert.ok(!existsSync(join(dest, 'skills')), 'No files should be created in dryRun');
    } finally {
      rmSync(pkg, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  await t.test('materializePackage: should create destination if needed', () => {
    const pkg = createTestPackage();
    const dest = join(tmpdir(), 'materialise-auto-create-' + Math.random());

    try {
      assert.ok(!existsSync(dest), 'Destination should not exist initially');

      materializePackage(pkg, dest);

      assert.ok(existsSync(dest), 'Destination should be created');
      assert.ok(existsSync(join(dest, 'skills')), 'Skills dir should be created');
    } finally {
      rmSync(pkg, { recursive: true, force: true });
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    }
  });

  await t.test('getPackageStats: should return metadata about package', () => {
    const pkg = createTestPackage();

    try {
      const stats = getPackageStats(pkg);

      assert.equal(stats.skillCount, 2);
      assert.equal(stats.packageVersion, '1.0.0');
      assert(stats.totalSize > 0, 'totalSize should be positive');
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('MaterialiserError: should include context information', () => {
    const err = new MaterialiserError('Test error', {
      skill: 'test-skill',
      path: '/invalid/path',
    });

    assert.equal(err.name, 'MaterialiserError');
    assert.equal(err.message, 'Test error');
    assert.deepEqual(err.context.skill, 'test-skill');
    assert.deepEqual(err.context.path, '/invalid/path');
  });

  // ─── Security Tests: Path Traversal & Symlink Attacks ───

  await t.test('Security: should reject Windows-style absolute paths', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);
      metadata.skills[0].path = 'C:\\Windows\\System32\\bad'; // Windows absolute path

      assert.throws(
        () => validatePackageContents(pkg, metadata),
        MaterialiserError,
        'Should reject Windows absolute paths'
      );
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('Security: should reject paths with null bytes', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);
      metadata.skills[0].path = 'skills/skill\0/SKILL.md'; // null byte attack

      assert.throws(
        () => validatePackageContents(pkg, metadata),
        MaterialiserError,
        'Should reject paths with null bytes'
      );
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('Security: should reject complex path traversal patterns', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);
      const attacks = [
        'skills/../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'skills/./../../bad',
        './../../../etc/passwd',
      ];

      for (const path of attacks) {
        metadata.skills[0].path = path;
        assert.throws(
          () => validatePackageContents(pkg, metadata),
          MaterialiserError,
          `Should reject path traversal: ${path}`
        );
      }
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('Security: should reject directories when files expected', () => {
    const pkg = createTestPackage();

    try {
      const metadata = readPackageMetadata(pkg);
      metadata.skills[0].path = 'skills/skill-one'; // directory, not file

      assert.throws(
        () => validatePackageContents(pkg, metadata),
        MaterialiserError,
        'Should reject directory paths'
      );
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  await t.test('Security: materializePackage should refuse to extract from untrusted packages', () => {
    const pkg = createTestPackage();
    const dest = mkdtempSync(join(tmpdir(), 'materialise-dest-'));

    try {
      // Modify the actual plugin.json file to contain path traversal
      const pluginJsonPath = join(pkg, '.claude-plugin', 'plugin.json');
      const metadata = JSON.parse(readFileSync(pluginJsonPath, 'utf8'));
      metadata.skills[0].path = '../../etc/passwd'; // path traversal attack
      writeFileSync(pluginJsonPath, JSON.stringify(metadata, null, 2));

      assert.throws(
        () => materializePackage(pkg, dest),
        MaterialiserError,
        'Should refuse extraction with path traversal in metadata'
      );
    } finally {
      rmSync(pkg, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
