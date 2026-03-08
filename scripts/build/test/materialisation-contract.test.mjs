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

  await t.test('should have complete plugin.json with all skills materialized', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    assert(manifest.skills, 'plugin.json must have skills array');
    assert(Array.isArray(manifest.skills), 'skills must be an array');
    assert(manifest.skills.length > 0, 'skills array must be non-empty');
  });

  await t.test('should have all skills in dist/clients/claude-code/skills/', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    const skillsDir = join(DIST_PACKAGE, 'skills');
    assert(existsSync(skillsDir), 'dist/clients/claude-code/skills/ must exist');

    manifest.skills.forEach(skill => {
      const skillFilePath = join(DIST_PACKAGE, skill.path);
      assert(existsSync(skillFilePath), `${skill.path} must exist in dist/`);
      assert(skill.path.startsWith('skills/'), 'skill path must be relative to dist root');
    });
  });

  await t.test('should use only relative paths in plugin.json (no source references)', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));

    manifest.skills.forEach(skill => {
      assert(
        !skill.path.includes('shared/skills'),
        `Skill ${skill.name}: path must not reference shared/skills/`
      );
      assert(
        !skill.path.startsWith('/'),
        `Skill ${skill.name}: path must be relative, not absolute`
      );
      assert(
        !skill.path.includes('..'),
        `Skill ${skill.name}: path must not escape dist/ root with ../`
      );
    });
  });

  await t.test('should have complete SKILL.md files with all required sections', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    const skillsDir = join(DIST_PACKAGE, 'skills');

    manifest.skills.forEach(skill => {
      const skillFilePath = join(DIST_PACKAGE, skill.path);
      const content = readFileSync(skillFilePath, 'utf8');

      // Verify SKILL.md has frontmatter
      assert(content.startsWith('---'), `${skill.name}/SKILL.md must start with --- frontmatter`);

      // Verify it has required frontmatter fields
      assert(
        /^---[\s\S]*?skill:\s*[\w-]+/.test(content),
        `${skill.name}/SKILL.md must have 'skill' field in frontmatter`
      );
      assert(
        /^---[\s\S]*?description:/.test(content),
        `${skill.name}/SKILL.md must have 'description' field in frontmatter`
      );
      assert(
        /^---[\s\S]*?type:/.test(content),
        `${skill.name}/SKILL.md must have 'type' field in frontmatter`
      );
      assert(
        /^---[\s\S]*?status:/.test(content),
        `${skill.name}/SKILL.md must have 'status' field in frontmatter`
      );
    });
  });

  await t.test('should have prompt files included for skills that reference them', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    const skillsDir = join(DIST_PACKAGE, 'skills');

    manifest.skills.forEach(skill => {
      const skillFilePath = join(DIST_PACKAGE, skill.path);
      const content = readFileSync(skillFilePath, 'utf8');

      // Extract any prompt_file references from variants
      const promptFileMatches = content.match(/prompt_file:\s*([^\n]+)/g);
      if (promptFileMatches) {
        promptFileMatches.forEach(match => {
          const promptPath = match.replace(/prompt_file:\s*/, '').trim();
          const fullPath = join(skillsDir, skill.name, promptPath);
          assert(
            existsSync(fullPath),
            `Prompt file ${promptPath} referenced in ${skill.name}/SKILL.md must exist in dist/`
          );
        });
      }
    });
  });

  await t.test('package version should match root VERSION file', () => {
    const versionFile = join(ROOT, 'VERSION');
    const versionFromFile = readFileSync(versionFile, 'utf8').trim();

    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    assert.equal(
      manifest.version,
      versionFromFile,
      'package version must match root VERSION file'
    );
  });
});
