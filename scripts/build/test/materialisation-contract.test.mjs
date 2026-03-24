/**
 * Package Materialisation Contract Tests
 *
 * Verifies the portability contract: emitted packages (dist/clients/claude-code/)
 * are self-sufficient and require zero access to the source tree (shared/skills/).
 * This ensures packages can be distributed, cached, and used independently.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '../../..');
const DIST_PACKAGE = join(ROOT, 'dist', 'clients', 'claude-code');
const PLUGIN_MANIFEST = join(DIST_PACKAGE, '.claude-plugin', 'plugin.json');

test('Package Materialisation Contract', async (t) => {
  // Skip tests if dist/ hasn't been built yet
  if (!existsSync(PLUGIN_MANIFEST)) {
    await t.test('dist/ not yet built (skip suite)', () => {
      // This is OK during development; tests will run after first compile
    });
    return;
  }

  // Parse manifest once; all subtests share this reference.
  const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
  const skillsDir = join(DIST_PACKAGE, 'skills');

  await t.test('should have complete plugin.json with all skills materialized', () => {
    assert.ok(Array.isArray(manifest.skills), 'plugin.json must have skills array');
    assert.ok(manifest.skills.length > 0, `skills array must be non-empty (got ${manifest.skills.length})`);
  });

  await t.test('should have all skills in dist/clients/claude-code/skills/', () => {
    assert.ok(existsSync(skillsDir), 'dist/clients/claude-code/skills/ must exist');

    for (const skill of manifest.skills) {
      const skillFilePath = join(DIST_PACKAGE, skill.path);
      assert.ok(existsSync(skillFilePath), `${skill.path} must exist in dist/`);
      assert.ok(skill.path.startsWith('skills/'), `skill '${skill.name}' path must be relative to dist root (got '${skill.path}')`);
    }
  });

  await t.test('should use only relative paths in plugin.json (no source references)', () => {
    for (const skill of manifest.skills) {
      assert.ok(
        !skill.path.includes('shared/skills'),
        `Skill ${skill.name}: path must not reference shared/skills/ (got '${skill.path}')`
      );
      assert.ok(
        !skill.path.startsWith('/'),
        `Skill ${skill.name}: path must be relative, not absolute (got '${skill.path}')`
      );
      assert.ok(
        !skill.path.includes('..'),
        `Skill ${skill.name}: path must not escape dist/ root with ../ (got '${skill.path}')`
      );
    }
  });

  await t.test('should have complete SKILL.md files with all required sections', () => {
    for (const skill of manifest.skills) {
      const skillFilePath = join(DIST_PACKAGE, skill.path);
      const content = readFileSync(skillFilePath, 'utf8');

      assert.ok(content.startsWith('---'), `${skill.name}/SKILL.md must start with --- frontmatter`);
      assert.ok(
        /^---[\s\S]*?skill:\s*["']?[\w-]+["']?/.test(content),
        `${skill.name}/SKILL.md must have 'skill' field in frontmatter`
      );
      assert.ok(
        /^---[\s\S]*?description:/.test(content),
        `${skill.name}/SKILL.md must have 'description' field in frontmatter`
      );
      assert.ok(
        /^---[\s\S]*?type:/.test(content),
        `${skill.name}/SKILL.md must have 'type' field in frontmatter`
      );
      assert.ok(
        /^---[\s\S]*?status:/.test(content),
        `${skill.name}/SKILL.md must have 'status' field in frontmatter`
      );
    }
  });

  await t.test('should have prompt files included for skills that reference them', () => {
    for (const skill of manifest.skills) {
      const skillFilePath = join(DIST_PACKAGE, skill.path);
      const content = readFileSync(skillFilePath, 'utf8');

      const promptFileMatches = content.match(/prompt_file:\s*([^\n]+)/g);
      if (!promptFileMatches) continue;

      for (const match of promptFileMatches) {
        let promptPath = match.replace(/prompt_file:\s*/, '').trim().replace(/^["']|["']$/g, '');
        const fullPath = join(skillsDir, skill.name, promptPath);
        assert.ok(
          existsSync(fullPath),
          `Prompt file '${promptPath}' referenced in ${skill.name}/SKILL.md must exist in dist/ (looked at ${fullPath})`
        );
      }
    }
  });

  await t.test('package version should match root VERSION file', () => {
    const versionFromFile = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
    assert.equal(
      manifest.version,
      versionFromFile,
      `package version must match root VERSION file (manifest: '${manifest.version}', VERSION: '${versionFromFile}')`
    );
  });
});
