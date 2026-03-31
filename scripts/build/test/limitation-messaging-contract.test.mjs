import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { emitCursor } from '../lib/emit-cursor.mjs';
import { emitClaudeCode } from '../lib/emit-claude-code.mjs';
import { emitRegistry } from '../lib/emit-registry.mjs';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-config-os-limitations-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function createSkill(rootDir, skillName, fallbackNotes = 'Use fallback prompts for limited clients.') {
  const skillDir = join(rootDir, 'skills-src', skillName);
  mkdirSync(skillDir, { recursive: true });
  const skillPath = join(skillDir, 'SKILL.md');
  const fm = `---
skill: ${skillName}
description: Test fixture for ${skillName}
version: 1.0.0
capabilities:
  required:
    - shell.exec
  fallback_mode: prompt_only
  fallback_notes: ${JSON.stringify(fallbackNotes)}
---
# Skill body

Do the thing.
`;
  writeFileSync(skillPath, fm);

  return {
    skillName,
    skillDir,
    filePath: skillPath,
    body: 'Do the thing.',
    frontmatter: {
      skill: skillName,
      version: '1.0.0',
      description: `Test fixture for ${skillName}`,
      capabilities: {
        required: ['shell.exec'],
        fallback_mode: 'prompt_only',
        fallback_notes: fallbackNotes,
      },
    },
  };
}

function buildCompatMatrix(skillName, cursorResult) {
  return new Map([
    [
      skillName,
      new Map([
        ['cursor', { package: 'cursorrules', emit: true, ...cursorResult }],
        ['claude-code', { status: 'supported', mode: 'native', package: 'plugin', emit: true }],
      ]),
    ],
  ]);
}

test('non-native/non-supported compatibility emits clear limitation messaging in cursor and reason sources in registry', () => {
  withTempDir(tempRoot => {
    const fixtures = [
      {
        name: 'degraded-mode-uses-notes',
        result: {
          status: 'supported',
          mode: 'degraded',
          notes: 'Degraded: capability bridge is partial.',
        },
        expectedReason: 'Degraded: capability bridge is partial.',
      },
      {
        name: 'unverified-status-surfaces-unknown-capability-reason',
        result: {
          status: 'unverified',
          mode: 'native',
          notes: 'Unverified: unknown capabilities [shell.exec].',
        },
        expectedReason: 'unknown capabilities',
      },
      {
        name: 'excluded-mode-surfaces-unsupported-capability-reason',
        result: {
          status: 'excluded',
          mode: 'excluded',
          notes: 'Excluded: unsupported capabilities [shell.exec].',
        },
        expectedReason: 'unsupported capabilities',
      },
    ];

    for (const fixture of fixtures) {
      const skill = createSkill(tempRoot, fixture.name);
      const compatMatrix = buildCompatMatrix(skill.skillName, fixture.result);

      const cursorDir = join(tempRoot, 'dist', fixture.name, 'cursor');
      emitCursor([skill], {
        distDir: cursorDir,
        releaseVersion: '1.2.3',
        provenance: null,
        compatMatrix,
      });

      const skillMdPath = join(cursorDir, 'skills', skill.skillName, 'SKILL.md');
      const cursorContent = readFileSync(skillMdPath, 'utf8');
      assert.match(
        cursorContent,
        /LIMITATION \((supported|unverified|excluded)\/(degraded|native|excluded)\):/,
        `${fixture.name}: cursor SKILL.md should include limitation banner`
      );
      assert.ok(
        cursorContent.includes(fixture.expectedReason),
        `${fixture.name}: cursor should include reason source text`
      );
      assert.ok(
        cursorContent.includes('**Fallback:** Use fallback prompts for limited clients.'),
        `${fixture.name}: cursor should include fallback guidance`
      );

      const registryDist = join(tempRoot, 'dist', fixture.name);
      emitRegistry([skill], ['claude-code', 'cursor'], {
        distDir: registryDist,
        releaseVersion: '1.2.3',
        provenance: null,
        compatMatrix,
      });

      const registry = JSON.parse(readFileSync(join(registryDist, 'registry', 'index.json'), 'utf8'));
      const cursorCompat = registry.skills[0].compatibility.cursor;
      assert.equal(cursorCompat.status, fixture.result.status);
      assert.equal(cursorCompat.mode, fixture.result.mode);
      assert.ok(
        (cursorCompat.notes || '').includes(fixture.expectedReason),
        `${fixture.name}: registry compatibility notes should preserve reason source`
      );

      const claudeDir = join(tempRoot, 'dist', fixture.name, 'claude-code');
      emitClaudeCode([skill], { distDir: claudeDir, releaseVersion: '1.2.3', provenance: null });
      const plugin = JSON.parse(
        readFileSync(join(claudeDir, '.claude-plugin', 'plugin.json'), 'utf8')
      );
      assert.equal(plugin.skills.length, 1, `${fixture.name}: plugin should still include skill`);
      assert.equal(
        JSON.stringify(plugin).includes('⚠ LIMITATION'),
        false,
        `${fixture.name}: non-cursor artefacts should not include cursor warning banner text`
      );
    }
  });
});

test('fully native/supported compatibility does not emit false warning banners', () => {
  withTempDir(tempRoot => {
    const skill = createSkill(tempRoot, 'native-supported');
    const compatMatrix = buildCompatMatrix(skill.skillName, {
      status: 'supported',
      mode: 'native',
    });

    const cursorDir = join(tempRoot, 'dist', 'native', 'cursor');
    emitCursor([skill], {
      distDir: cursorDir,
      releaseVersion: '1.2.3',
      provenance: null,
      compatMatrix,
    });

    const cursorContent = readFileSync(join(cursorDir, 'skills', skill.skillName, 'SKILL.md'), 'utf8');
    assert.equal(
      cursorContent.includes('LIMITATION ('),
      false,
      'Native/supported cursor output must not include limitation banner'
    );

    const claudeDir = join(tempRoot, 'dist', 'native', 'claude-code');
    emitClaudeCode([skill], { distDir: claudeDir, releaseVersion: '1.2.3', provenance: null });
    const plugin = readFileSync(join(claudeDir, '.claude-plugin', 'plugin.json'), 'utf8');
    assert.equal(
      plugin.includes('⚠ LIMITATION'),
      false,
      'Native/supported claude-code plugin must not include limitation banner'
    );
  });
});
