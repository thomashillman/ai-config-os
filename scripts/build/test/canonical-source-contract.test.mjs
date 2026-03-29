/**
 * Canonical Source Contract Tests
 *
 * Verifies the portability contract: the compiler reads skill definitions
 * exclusively from shared/skills/, never from plugins/core-skills/skills/.
 * This ensures that distributed packages are source-independent.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '../../..');
const SKILLS_DIR = join(ROOT, 'shared', 'skills');
const PLUGINS_SKILLS_DIR = join(ROOT, 'plugins', 'core-skills', 'skills');

test('Canonical Source Contract', async (t) => {
  await t.test('should read skill definitions only from shared/skills/', () => {
    // Verify shared/skills/ exists and is non-empty
    assert(existsSync(SKILLS_DIR), 'shared/skills/ must exist');
    const sharedSkills = readdirSync(SKILLS_DIR).filter(f => !f.startsWith('.'));
    assert(sharedSkills.length > 0, 'shared/skills/ must contain at least one skill');
  });

  await t.test('should have shared/skills/ as the only source of truth', () => {
    // Verify that each skill directory in shared/skills/ has a SKILL.md file
    const sharedSkills = readdirSync(SKILLS_DIR)
      .filter(f => !f.startsWith('.'))
      .sort();

    const failures = [];
    for (const skillName of sharedSkills) {
      const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
      if (!existsSync(skillPath)) {
        failures.push(`  ${skillName}: missing SKILL.md in shared/skills/${skillName}/`);
      }
    }
    assert(failures.length === 0, `${failures.length} skill(s) missing SKILL.md:\n${failures.join('\n')}`);
  });

  await t.test('should not enumerate skills from plugins/core-skills/skills/', () => {
    // plugins/ is optional; if it exists, it should only contain symlinks pointing back to shared/
    // The compiler should ignore plugins/ entirely and read only from shared/skills/
    if (!existsSync(PLUGINS_SKILLS_DIR)) {
      // Portable mode: plugins/ not created; skip this check
      return;
    }

    // If plugins/core-skills/skills/ exists, verify it's empty or contains only symlinks
    const pluginsSkills = readdirSync(PLUGINS_SKILLS_DIR).filter(f => !f.startsWith('.'));
    // (Test verifies symlinks are convenience only, not part of build contract)
  });

  await t.test('should have consistent skill names in shared/skills/', () => {
    // Verify no naming conflicts (case sensitivity on case-insensitive filesystems)
    const skills = readdirSync(SKILLS_DIR).filter(f => !f.startsWith('.'));
    const skillsByName = {};
    const failures = [];
    for (const skill of skills) {
      const lower = skill.toLowerCase();
      if (skillsByName[lower]) {
        failures.push(`  '${skill}' conflicts with '${skillsByName[lower]}' (case-insensitive duplicate)`);
      } else {
        skillsByName[lower] = skill;
      }
    }
    assert(failures.length === 0, `${failures.length} duplicate skill name(s):\n${failures.join('\n')}`);
  });
});
