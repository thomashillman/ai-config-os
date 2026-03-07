/**
 * emit-claude-code.mjs
 * Emits claude-code platform artefacts for a set of skills.
 *
 * Output structure:
 *   dist/clients/claude-code/
 *     .claude-plugin/plugin.json
 *     skills/<skill-name>/SKILL.md
 *     skills/<skill-name>/prompts/   (if present in source)
 */
import { mkdirSync, writeFileSync, cpSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

/**
 * @param {object[]} skills - Pre-filtered skills for claude-code (from compatibility resolution)
 * @param {object} opts
 * @param {string} opts.distDir - e.g. dist/clients/claude-code
 * @param {string} opts.buildVersion - build version string
 * @param {string} opts.builtAt - ISO timestamp
 */
export function emitClaudeCode(skills, { distDir, buildVersion, builtAt }) {
  // Skills are pre-filtered by the compiler's compatibility resolution.
  // The emitter's job is packaging, not filtering.
  emitSkills(skills, distDir);

  // Generate plugin.json
  const pluginJsonPath = join(distDir, '.claude-plugin', 'plugin.json');
  mkdirSync(dirname(pluginJsonPath), { recursive: true });

  const pluginJson = {
    name: 'core-skills',
    version: buildVersion,
    description: 'Core AI Config OS skills',
    built_at: builtAt,
    skills: skills.map(s => ({
      name: s.skillName,
      version: s.frontmatter.version || '1.0.0',
      path: `skills/${s.skillName}/SKILL.md`,
    })),
  };

  writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n');
  console.log(`  [claude-code] plugin.json → ${pluginJsonPath}`);
}

function emitSkills(skills, distDir) {
  for (const skill of skills) {
    const skillOutDir = join(distDir, 'skills', skill.skillName);
    mkdirSync(skillOutDir, { recursive: true });

    // Copy SKILL.md
    const destSkillMd = join(skillOutDir, 'SKILL.md');
    writeFileSync(destSkillMd, readSkillMd(skill));

    // Copy prompts/ dir if present
    const promptsSrc = join(skill.skillDir, 'prompts');
    if (existsSync(promptsSrc)) {
      cpSync(promptsSrc, join(skillOutDir, 'prompts'), { recursive: true });
    }
  }
  console.log(`  [claude-code] emitted ${skills.length} skill(s) to ${distDir}/skills/`);
}

function readSkillMd(skill) {
  return readFileSync(skill.filePath, 'utf8');
}
