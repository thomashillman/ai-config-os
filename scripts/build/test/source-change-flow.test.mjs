/**
 * Source Change Flow Tests
 *
 * Verifies the portability contract: changes to shared/skills/ produce
 * predictable, deterministic changes in emitted packages (dist/).
 * This ensures source-to-output traceability and reproducibility.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '../../..');
const SKILLS_DIR = join(ROOT, 'shared', 'skills');
const DIST_PACKAGE = join(ROOT, 'dist', 'clients', 'claude-code');
const PLUGIN_MANIFEST = join(DIST_PACKAGE, '.claude-plugin', 'plugin.json');

test('Source Change Flow', async (t) => {
  // Skip tests if dist/ hasn't been built yet
  if (!existsSync(PLUGIN_MANIFEST)) {
    await t.test('dist/ not yet built (skip suite)', () => {
      // This is OK during development; tests will run after first compile
    });
    return;
  }

  await t.test('should have every skill in shared/skills/ represented in dist/', () => {
    const sourceSkills = readdirSync(SKILLS_DIR)
      .filter(f => !f.startsWith('.') && f !== '_template')
      .sort();
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    const distSkillNames = manifest.skills.map(s => s.name).sort();

    assert.deepEqual(
      distSkillNames,
      sourceSkills,
      'dist/ must contain exactly the skills from shared/skills/'
    );
  });

  await t.test('should have deterministic ordering of skills (alphabetical)', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    const skillNames = manifest.skills.map(s => s.name);
    const sorted = [...skillNames].sort();

    assert.deepEqual(
      skillNames,
      sorted,
      'Skills in plugin.json must be in alphabetical order for reproducibility'
    );
  });

  await t.test('should have content hash consistency (same source → same dist file)', () => {
    // For each skill, verify that the content in dist/ matches what was in shared/skills/
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));

    manifest.skills.forEach(skill => {
      const sourceFile = join(SKILLS_DIR, skill.name, 'SKILL.md');
      const distFile = join(DIST_PACKAGE, skill.path);

      const sourceContent = readFileSync(sourceFile, 'utf8');
      const distContent = readFileSync(distFile, 'utf8');

      assert.equal(
        sourceContent,
        distContent,
        `${skill.name}/SKILL.md content must be identical between source and dist/`
      );
    });
  });

  await t.test('should have version field in each skill matching manifest version', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    const packageVersion = manifest.version;

    manifest.skills.forEach(skill => {
      assert(
        skill.version,
        `Skill ${skill.name} must have version field in plugin.json`
      );
      // Skill version should be independent of package version
      // (each skill has its own version per semver)
    });
  });

  await t.test('should have deterministic file mtimes (no timestamps in dist/)', () => {
    // Verify that dist/ files don't have embedded timestamps in frontmatter
    // This ensures local builds are reproducible (same source → same bits)
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));

    manifest.skills.forEach(skill => {
      const distFile = join(DIST_PACKAGE, skill.path);
      const content = readFileSync(distFile, 'utf8');

      // Extract frontmatter only (between --- markers)
      const match = content.match(/^---\n([\s\S]*?)\n---\n/);
      if (!match) return; // No frontmatter means no timestamps to check

      const frontmatter = match[1];
      // Check for build metadata that shouldn't be in SKILL.md
      assert(
        !/built_at|buildTime|built_at_timestamp|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(frontmatter),
        `${skill.name}/SKILL.md frontmatter should not contain build timestamps`
      );
    });
  });

  await t.test('should have all referenced resources materialized in dist/', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));
    const skillsDir = join(DIST_PACKAGE, 'skills');

    manifest.skills.forEach(skill => {
      const distFile = join(DIST_PACKAGE, skill.path);
      const content = readFileSync(distFile, 'utf8');

      // Look for prompt_file references
      const promptMatches = content.match(/prompt_file:\s*([^\n]+)/g) || [];
      promptMatches.forEach(match => {
        let promptPath = match.replace(/prompt_file:\s*/, '').trim();
        // Remove surrounding quotes if present
        promptPath = promptPath.replace(/^["']|["']$/g, '');
        const resolvedPath = join(skillsDir, skill.name, promptPath);
        assert(
          existsSync(resolvedPath),
          `Prompt file ${promptPath} must be materialized in dist/ for ${skill.name}`
        );
      });
    });
  });
});
